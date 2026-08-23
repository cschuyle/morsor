/**
 * Persisted (localStorage) record of which stale trove ids the user has already dismissed,
 * so the "troves updated" banner stays hidden until a trove not already dismissed changes too.
 */

const STORAGE_KEY = 'morsor.trovesStaleDismissedIds.v1'

export function parseTroveIds(idsCsv: string): string[] {
  return idsCsv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function getDismissedTroveIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? new Set(parseTroveIds(raw)) : new Set()
  } catch {
    return new Set()
  }
}

export function setDismissedTroveIds(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, ids.join(','))
  } catch {
    // quota / private mode
  }
}

export function clearDismissedTroveIds(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** True iff there's at least one currently-stale trove id that hasn't already been dismissed. */
export function shouldShowStaleBanner(currentIds: string[], dismissed: Set<string>): boolean {
  return currentIds.length > 0 && currentIds.some((id) => !dismissed.has(id))
}
