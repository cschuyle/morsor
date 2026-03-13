/**
 * Format a number with comma separators for thousands (e.g. 1234 → "1,234").
 * Used for result counts and trove item counts in the UI.
 */
export function formatCount(n: number | undefined | null): string {
  if (typeof n === 'number' && Number.isFinite(n)) {
    return n.toLocaleString()
  }
  return String(n ?? 0)
}

/**
 * Format byte count for display (e.g. 1536 → "2 KB", 1048576 → "1 MB", 1073741824 → "1.0 GB").
 * Used for cache size in the status message.
 */
export function formatCacheBytes(bytes: number | undefined | null): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
