/**
 * Shared logic for when "Comparing to self" should be visible (not hidden) in the trove picker.
 * Visible when: a primary trove is selected and (no comparison troves, or only the primary is in compare).
 * Used by both desktop and mobile compare-mode trove pickers.
 */
export function isCompareToSelfVisible(
  primaryTroveId: string,
  compareIds: Set<string>
): boolean {
  return !!(
    primaryTroveId &&
    (compareIds.size === 0 || (compareIds.size === 1 && compareIds.has(primaryTroveId)))
  )
}
