/**
 * Canonical form for file-type filter tokens: uppercase extensions (matches backend
 * FileTypeCounts.extractExtension), and `Link` for URL / link aliases.
 */
export function normalizeFileTypeToken(raw: string): string {
  const t = (raw ?? '').trim()
  if (!t) {
    return t
  }
  const u = t.toUpperCase()
  if (u === 'URL' || u === 'LINK') {
    return 'Link'
  }
  return u
}

/** True if the set contains this type (case-insensitive; same rules as {@link normalizeFileTypeToken}). */
export function fileTypeSetHas(set: Set<string>, ft: string): boolean {
  const n = normalizeFileTypeToken(ft)
  if (!n) {
    return false
  }
  for (const x of set) {
    if (normalizeFileTypeToken(x) === n) {
      return true
    }
  }
  return false
}

/** Drop required markers for types that are no longer selected. */
export function pruneRequiredFileTypes(selected: Set<string>, required: Set<string>): Set<string> {
  const sel = new Set([...selected].map(normalizeFileTypeToken))
  return new Set([...required].map(normalizeFileTypeToken).filter((t) => sel.has(t)))
}
