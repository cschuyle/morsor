import { useEffect, useRef, useState } from 'react'
import { getApiAuthHeaders, readApiErrorMessage } from './apiAuth'
import {
  normalizeDynamicTroveItemTitle,
  resultsIncludeExactNormalizedTitle,
} from './normalizeDynamicTroveItemTitle'
import type { SearchResultData } from './types'

const DEBOUNCE_MS = 300
const FLASH_MS = 1000
const LOOKUP_PAGE_SIZE = 500

/**
 * When enabled (dups tab + dynamic primary), debounce the query and search the
 * primary trove for an exact normalized title match. On hit: {@code exists} and
 * a one-shot {@code flash} (1s green fade).
 */
export function useDupPrimaryTitleExists(
  enabled: boolean,
  troveId: string | null,
  query: string,
): { exists: boolean; flash: boolean } {
  const [exists, setExists] = useState(false)
  const [flash, setFlash] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)
  const flashTimerRef = useRef<number | null>(null)

  useEffect(() => {
    abortRef.current?.abort()
    abortRef.current = null

    if (!enabled || !troveId?.trim()) {
      setExists(false)
      setFlash(false)
      return
    }

    const trimmed = query.trim()
    const normalized = normalizeDynamicTroveItemTitle(query)
    if (!normalized || trimmed === '*') {
      setExists(false)
      setFlash(false)
      return
    }

    // Clear until the debounced lookup confirms, so a flash can fire on each new hit.
    setExists(false)
    setFlash(false)

    const requestId = ++requestIdRef.current
    const timer = window.setTimeout(() => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const params = new URLSearchParams({
        query: trimmed,
        page: '0',
        size: String(LOOKUP_PAGE_SIZE),
      })
      params.append('trove', troveId.trim())

      fetch(`/api/search?${params}`, {
        credentials: 'include',
        headers: { ...getApiAuthHeaders() },
        signal: controller.signal,
      })
        .then(async (res) => {
          if (res.status === 401) {
            window.location.href = '/login'
            return Promise.reject()
          }
          if (!res.ok) {
            throw new Error(await readApiErrorMessage(res))
          }
          return res.json() as Promise<SearchResultData>
        })
        .then((data) => {
          if (requestIdRef.current !== requestId) {
            return
          }
          const hit = resultsIncludeExactNormalizedTitle(data.results ?? [], trimmed)
          setExists(hit)
          if (hit) {
            if (flashTimerRef.current != null) {
              window.clearTimeout(flashTimerRef.current)
            }
            setFlash(true)
            flashTimerRef.current = window.setTimeout(() => {
              flashTimerRef.current = null
              if (requestIdRef.current === requestId) {
                setFlash(false)
              }
            }, FLASH_MS)
          }
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return
          }
          if (requestIdRef.current === requestId) {
            setExists(false)
            setFlash(false)
          }
        })
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [enabled, troveId, query])

  useEffect(() => {
    return () => {
      if (flashTimerRef.current != null) {
        window.clearTimeout(flashTimerRef.current)
      }
    }
  }, [])

  return { exists, flash }
}
