/**
 * Persisted log of posted queries (localStorage). Complements the in-memory queryCache.
 */
import { queryCache } from './queryCache'

const STORAGE_KEY = 'morsor.queryHistory.v1'
const MAX_ENTRIES = 200
/** Ignore repeats of the same API request logged within this window (URL sync + cache-hit replays). */
const DEDUP_SAME_API_MS = 2500

export type QueryHistoryMode = 'search' | 'duplicates' | 'uniques'

export type QueryHistoryEntry = {
  id: string
  mode: QueryHistoryMode
  /** When the query finished (same as receive time for that run). */
  ranAtMs: number
  durationMs: number
  /** Console URL query string (no leading ?) — active-tab params only. */
  consoleQuery: string
  /** queryCache key (e.g. /api/search?...) */
  apiCacheKey: string
  resultCount: number
  summary: string
  detail: string
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/** Remove page/size params from a console query string so history entries always start at page 1. */
function stripPaginationParams(consoleQuery: string): string {
  const p = new URLSearchParams(consoleQuery)
  p.delete('page')
  p.delete('size')
  p.delete('dpage')
  p.delete('upage')
  return p.toString()
}

function loadRaw(): QueryHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter(
      (x): x is QueryHistoryEntry =>
        x != null &&
        typeof x === 'object' &&
        typeof (x as QueryHistoryEntry).id === 'string' &&
        typeof (x as QueryHistoryEntry).consoleQuery === 'string' &&
        typeof (x as QueryHistoryEntry).apiCacheKey === 'string'
    )
  } catch {
    return []
  }
}

export function loadQueryHistory(): QueryHistoryEntry[] {
  return loadRaw()
}

export function appendQueryHistoryEntry(
  entry: Omit<QueryHistoryEntry, 'id'> & { id?: string }
): void {
  try {
    const list = loadRaw()
    const full: QueryHistoryEntry = {
      id: entry.id ?? newId(),
      mode: entry.mode,
      ranAtMs: entry.ranAtMs,
      durationMs: entry.durationMs,
      consoleQuery: stripPaginationParams(entry.consoleQuery),
      apiCacheKey: entry.apiCacheKey,
      resultCount: entry.resultCount,
      summary: entry.summary,
      detail: entry.detail,
    }
    const head = list[0]
    if (
      head &&
      head.apiCacheKey === full.apiCacheKey &&
      Math.abs(head.ranAtMs - full.ranAtMs) < DEDUP_SAME_API_MS
    ) {
      return
    }
    list.unshift(full)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)))
  } catch {
    // quota / private mode
  }
}

export function clearQueryHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** Whether this API URL still has a non-expired cache entry; returns cache receive time if yes. */
export function historyEntryCacheInfo(apiCacheKey: string): { cached: boolean; cachedAtMs?: number } {
  const hit = queryCache.get(apiCacheKey)
  if (!hit) return { cached: false }
  return { cached: true, cachedAtMs: hit.receivedAtMs }
}

export function truncateMiddle(s: string, maxLen: number): string {
  const t = (s ?? '').trim()
  if (t.length <= maxLen) return t
  const half = Math.floor((maxLen - 3) / 2)
  return `${t.slice(0, half)}…${t.slice(t.length - half)}`
}
