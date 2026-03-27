/**
 * Wall-clock timing for cached / fresh search and compare API results (UI + session).
 */
export type QueryResultTiming = {
  durationMs: number
  receivedAtMs: number
}

/** Human-readable duration from measured milliseconds. */
export function formatQueryDurationSeconds(durationMs: number): string {
  const sec = durationMs / 1000
  if (!Number.isFinite(sec) || sec <= 0) {
    return '0s'
  }
  if (sec < 10) {
    const rounded = Math.round(sec * 10) / 10
    return (rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1)) + 's'
  }
  return `${Math.round(sec)}s`
}

/** Local timezone display for when results were received. */
export function formatQueryReceivedLocal(receivedAtMs: number): string {
  return new Date(receivedAtMs).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })
}
