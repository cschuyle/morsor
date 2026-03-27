/**
 * In-memory cache for search/duplicates/uniques API responses.
 * Cache key = request URL (one page per request). Revisiting a page within 5 min is instant.
 * TTL 5 minutes. Each entry stores original fetch duration and receive time for the UI.
 */
const TTL_MS = 5 * 60 * 1000

interface CacheEntry {
  data: unknown
  /** Used for TTL eviction */
  storedAt: number
  durationMs: number
  receivedAtMs: number
}

const cache = new Map<string, CacheEntry>()

export type QueryCacheHit<T = unknown> = {
  data: T
  durationMs: number
  receivedAtMs: number
}

function get(key: string): QueryCacheHit | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.storedAt > TTL_MS) {
    cache.delete(key)
    return null
  }
  return {
    data: entry.data,
    durationMs: entry.durationMs,
    receivedAtMs: entry.receivedAtMs,
  }
}

function set(key: string, data: unknown, meta: { durationMs: number; receivedAtMs?: number }): void {
  const receivedAtMs = meta.receivedAtMs ?? Date.now()
  cache.set(key, {
    data,
    storedAt: receivedAtMs,
    durationMs: meta.durationMs,
    receivedAtMs,
  })
}

function clear(): void {
  cache.clear()
}

export const queryCache = { get, set, clear }
