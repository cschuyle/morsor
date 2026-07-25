import { useCallback, useEffect, useRef, useState } from 'react'
import { getApiAuthHeaders, readApiErrorMessage } from './apiAuth'
import type { SearchResultData, SearchResultRow } from './types'

const DEBOUNCE_MS = 300
const TOP_N = 5

export type DupPrimaryMatch = {
  title: string
  score?: number
  trove?: string
}

/** First {@code limit} unique titles from a search response (API order). */
export function topMatchesFromSearchResult(
  data: SearchResultData | null | undefined,
  limit = TOP_N,
): DupPrimaryMatch[] {
  const out: DupPrimaryMatch[] = []
  const seen = new Set<string>()
  for (const row of data?.results ?? []) {
    const r = row as SearchResultRow
    const title = (r.title ?? '').trim()
    if (!title) {
      continue
    }
    const key = title.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    out.push({
      title,
      score: typeof r.score === 'number' ? r.score : undefined,
      trove: (r.trove ?? r.troveId ?? '').toString() || undefined,
    })
    if (out.length >= limit) {
      break
    }
  }
  return out
}

/**
 * When enabled (dups tab with dynamic primary, or search tab with a sole
 * dynamic trove), debounce the query and run a regular search against that
 * trove. Exposes the top hits for a dropdown under the query box.
 */
export function useDupPrimaryTitleExists(
  enabled: boolean,
  troveId: string | null,
  query: string,
): {
  matches: DupPrimaryMatch[]
  open: boolean
  dismiss: () => void
  reopen: () => void
} {
  const [matches, setMatches] = useState<DupPrimaryMatch[]>([])
  const [open, setOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)

  const dismiss = useCallback(() => {
    setOpen(false)
  }, [])

  const reopen = useCallback(() => {
    if (matches.length > 0) {
      setOpen(true)
    }
  }, [matches.length])

  useEffect(() => {
    abortRef.current?.abort()
    abortRef.current = null

    if (!enabled || !troveId?.trim()) {
      setMatches([])
      setOpen(false)
      return
    }

    const trimmed = query.trim()
    if (!trimmed || trimmed === '*') {
      setMatches([])
      setOpen(false)
      return
    }

    setMatches([])
    setOpen(false)

    const primaryId = troveId.trim()
    const requestId = ++requestIdRef.current
    const timer = window.setTimeout(() => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const params = new URLSearchParams({
        query: trimmed,
        page: '0',
        size: String(TOP_N),
      })
      params.append('trove', primaryId)

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
          const top = topMatchesFromSearchResult(data, TOP_N)
          setMatches(top)
          setOpen(top.length > 0)
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return
          }
          if (requestIdRef.current === requestId) {
            setMatches([])
            setOpen(false)
          }
        })
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [enabled, troveId, query])

  return { matches, open, dismiss, reopen }
}
