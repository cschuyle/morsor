/**
 * File type quick toggle: exactly two values, Any or Meh. Default Meh.
 * Enum-like: frozen object with string values for URL/serialization.
 */
export const FileTypeQuickMode = Object.freeze({
  Any: 'any',
  Meh: 'meh',
} as const)

export type FileTypeQuickModeValue = (typeof FileTypeQuickMode)[keyof typeof FileTypeQuickMode]

const VALID = new Set<string>([FileTypeQuickMode.Any, FileTypeQuickMode.Meh])

/** Parse ftq from URL; invalid or missing defaults to Meh. */
export function normalizeFileTypeQuickMode(value: string | null | undefined): FileTypeQuickModeValue {
  return (VALID.has(value ?? '') ? value : FileTypeQuickMode.Meh) as FileTypeQuickModeValue
}
