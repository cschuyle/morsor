export function setEquals<T>(a: Set<T>, b: Set<T>): boolean {
  if (a === b) return true
  if (a.size !== b.size) return false
  for (const x of a) {
    if (!b.has(x)) return false
  }
  return true
}

/** Returns `prev` unchanged when `next` has the same members, so callers that pass this to
 * a functional setState update don't churn object identity (and retrigger effects/renders)
 * on every call when nothing actually changed. */
export function stableSet<T>(prev: Set<T>, next: Set<T>): Set<T> {
  return setEquals(prev, next) ? prev : next
}
