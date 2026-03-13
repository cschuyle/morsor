/**
 * In-memory cache for search/duplicates/uniques API responses.
 * Cache key = request URL (one page per request). Revisiting a page within 5 min is instant.
 * TTL 5 minutes.
 */
const TTL_MS = 5 * 60 * 1000

interface CacheEntry {
  data: unknown
  at: number
}

const cache = new Map<string, CacheEntry>()

function get(key: string): unknown {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.at > TTL_MS) {
    cache.delete(key)
    return null
  }
  return entry.data
}

function set(key: string, data: unknown): void {
  cache.set(key, { data, at: Date.now() })
}

export const queryCache = { get, set }
