import type { Trove } from './types'

function troveLabel(troves: Trove[], id: string): string {
  const t = troves.find((x) => x.id === id)
  return t?.name ?? id
}

function joinTroveLabels(troves: Trove[], ids: string[]): string {
  return ids.map((id) => troveLabel(troves, id)).join(', ')
}

export function searchHistoryLabels(
  troves: Trove[],
  q: string,
  view: 'list' | 'gallery',
  troveIds: string[],
  sortBy: string | null,
  sortDir: 'asc' | 'desc' | null,
  fileTypes: Set<string>,
  thumbnailOnly: boolean,
  boostId: string | null
): { summary: string; detail: string } {
  const qt = (q ?? '').trim()
  const displayQ = qt === '' ? '(empty)' : qt.length > 56 ? `${qt.slice(0, 53)}…` : qt
  const summary = `Search · ${view} · ${displayQ}`
  const parts: string[] = [
    qt === '' ? 'q=(empty)' : `q=${qt.length > 100 ? `${qt.slice(0, 97)}…` : qt}`,
    troveIds.length ? `troves=${joinTroveLabels(troves, troveIds)}` : 'troves=(none)',
    `view=${view}`,
  ]
  if (sortBy) {
    parts.push(`sort=${sortBy} ${sortDir ?? ''}`.trim())
  }
  if (fileTypes.size > 0) {
    parts.push(`fileTypes=${[...fileTypes].sort().join(', ')}`)
  }
  if (thumbnailOnly) {
    parts.push('thumbnails only')
  }
  if (boostId) {
    parts.push(`boost=${troveLabel(troves, boostId)}`)
  }
  return { summary, detail: parts.join(' · ') }
}

export function duplicatesHistoryLabels(
  troves: Trove[],
  q: string,
  primaryId: string,
  compareIds: string[],
  sortBy: string | null,
  sortDir: 'asc' | 'desc'
): { summary: string; detail: string } {
  const qt = (q ?? '').trim() || '*'
  const shortQ = qt.length > 40 ? `${qt.slice(0, 37)}…` : qt
  const primaryName = primaryId ? troveLabel(troves, primaryId) : '(no primary)'
  const summary = `Duplicates · ${primaryName} · ${shortQ}`
  const parts: string[] = [
    `q=${qt}`,
    `primary=${primaryName}`,
    compareIds.length ? `compare=${joinTroveLabels(troves, compareIds)}` : 'compare=(none)',
  ]
  if (sortBy) {
    parts.push(`sort=${sortBy} ${sortDir}`)
  }
  return { summary, detail: parts.join(' · ') }
}

export function uniquesHistoryLabels(
  troves: Trove[],
  q: string,
  primaryId: string,
  compareIds: string[],
  sortBy: string | null,
  sortDir: 'asc' | 'desc'
): { summary: string; detail: string } {
  const qt = (q ?? '').trim() || '*'
  const shortQ = qt.length > 40 ? `${qt.slice(0, 37)}…` : qt
  const primaryName = primaryId ? troveLabel(troves, primaryId) : '(no primary)'
  const summary = `Uniques · ${primaryName} · ${shortQ}`
  const parts: string[] = [
    `q=${qt}`,
    `primary=${primaryName}`,
    compareIds.length ? `compare=${joinTroveLabels(troves, compareIds)}` : 'compare=(none)',
  ]
  if (sortBy) {
    parts.push(`sort=${sortBy} ${sortDir}`)
  }
  return { summary, detail: parts.join(' · ') }
}
