/**
 * Mirror of SearchDataService.normalizeDynamicTroveItemTitle:
 * trim, collapse whitespace runs to a single space, then lower-case (Unicode default).
 */
export function normalizeDynamicTroveItemTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** True if any result title matches {@code query} under dynamic-trove normalization. */
export function resultsIncludeExactNormalizedTitle(
  results: Array<{ title?: string | null }>,
  query: string,
): boolean {
  const want = normalizeDynamicTroveItemTitle(query)
  if (!want) {
    return false
  }
  return results.some(
    (r) => normalizeDynamicTroveItemTitle(String(r.title ?? '')) === want,
  )
}
