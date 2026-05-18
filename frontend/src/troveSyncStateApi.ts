export interface TroveSyncState {
  stale: boolean
  detectedAt?: string        // ISO-8601 string when stale
  staleTroveIds?: string     // comma-delimited trove ids when stale
}

export async function fetchTroveSyncState(
  signal?: AbortSignal,
  extraHeaders?: Record<string, string>
): Promise<TroveSyncState> {
  const res = await fetch('/api/troves/sync-state', {
    credentials: 'include',
    signal,
    headers: { ...extraHeaders },
  })
  if (!res.ok) {
    throw new Error(`GET /api/troves/sync-state: HTTP ${res.status}`)
  }
  return res.json() as Promise<TroveSyncState>
}
