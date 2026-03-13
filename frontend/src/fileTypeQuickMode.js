/**
 * File type quick toggle: exactly two values, Any or Meh. Default Meh.
 * JavaScript enum-like: frozen object with string values for URL/serialization.
 */
export const FileTypeQuickMode = Object.freeze({
  Any: 'any',
  Meh: 'meh'
})

const VALID = new Set([FileTypeQuickMode.Any, FileTypeQuickMode.Meh])

/** Parse ftq from URL; invalid or missing defaults to Meh. */
export function normalizeFileTypeQuickMode(value) {
  return VALID.has(value) ? value : FileTypeQuickMode.Meh
}
