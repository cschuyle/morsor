/** File type groups for hierarchical dropdown. Only these are grouped; others appear at top level. */
const IMAGE_TYPES = ['JPG', 'JPEG', 'GIF', 'WEBP', 'TIFF', 'PNG']
const TEXT_TYPES = ['PDF', 'RDF', 'TXT', 'DOC', 'DOCX', 'EPUB', 'MOBI']
const VIDEO_TYPES = ['MP4', 'M4V', 'AVI', 'MOV', 'MKV']
const AUDIO_TYPES = ['MP3']

const GROUPS = [
  { group: 'Images', types: IMAGE_TYPES },
  { group: 'Text', types: TEXT_TYPES },
  { group: 'Video', types: VIDEO_TYPES },
  { group: 'Audio', types: AUDIO_TYPES },
]

/** All known file types from groups; used so dropdown can show full list (e.g. on mobile) even before API returns. */
export const ALL_KNOWN_FILE_TYPES: string[] = [...IMAGE_TYPES, ...TEXT_TYPES, ...VIDEO_TYPES, ...AUDIO_TYPES]

export interface FileTypeGroup {
  group: string
  types: string[]
}

/**
 * @param availableFileTypes - Types returned by the API (any case)
 * @returns Groups with group label and types in display order (original case from available)
 */
export function groupFileTypes(availableFileTypes: string[] | undefined | null): FileTypeGroup[] {
  const upper = (s: string) => (s || '').toUpperCase()
  const available = availableFileTypes || []
  const byUpper = new Map<string, string>()
  available.forEach((t) => byUpper.set(upper(t), t))
  const usedUpper = new Set<string>()
  const result: FileTypeGroup[] = []
  for (const { group, types } of GROUPS) {
    const inThisGroup = types.filter((t) => byUpper.has(t)).map((t) => byUpper.get(t)!)
    inThisGroup.forEach((t) => usedUpper.add(upper(t)))
    if (inThisGroup.length > 0) result.push({ group, types: inThisGroup })
  }
  const others = available.filter((t) => !usedUpper.has(upper(t)))
  if (others.length > 0) result.push({ group: 'Other', types: others })
  return result
}

/**
 * If the selected file types equal exactly one group (all types that group has in the dropdown, nothing else), return that group name for display (e.g. "Only Text").
 * Compares against the group's types that are present in allAvailableFileTypes (what we actually show), not the full group definition.
 */
export function getGroupNameIfFullySelected(
  selectedFileTypes: Set<string> | undefined | null,
  allAvailableFileTypes?: string[]
): string | null {
  if (!selectedFileTypes || selectedFileTypes.size === 0) return null
  const upper = (s: string) => (s || '').toUpperCase()
  const selectedUpper = new Set([...selectedFileTypes].map(upper))
  const available = allAvailableFileTypes || []
  const availableUpper = new Set(available.map(upper))
  for (const { group, types } of GROUPS) {
    const inDropdown = types.filter((t) => availableUpper.has(t))
    const groupSet = new Set(inDropdown)
    if (groupSet.size > 0 && groupSet.size === selectedUpper.size && [...groupSet].every((t) => selectedUpper.has(t))) {
      if (groupSet.size === 1) return null
      return group
    }
  }
  const usedUpper = new Set<string>()
  GROUPS.forEach(({ types }) => types.forEach((t) => usedUpper.add(t)))
  const otherSet = new Set(available.map(upper).filter((t) => !usedUpper.has(t)))
  if (otherSet.size > 0 && otherSet.size === selectedUpper.size && [...otherSet].every((t) => selectedUpper.has(t))) {
    if (otherSet.size === 1) return null
    return 'Other'
  }
  return null
}

/**
 * If the selection is only full groups (no group has some but not all of its types selected), return the list of those group names for display (e.g. ["Images", "Text"]).
 * Used on desktop to show "Only Images, Text" instead of listing every child type.
 */
export function getFullySelectedGroupNames(
  selectedFileTypes: Set<string> | undefined | null,
  allAvailableFileTypes?: string[]
): string[] | null {
  if (!selectedFileTypes || selectedFileTypes.size === 0) return null
  const upper = (s: string) => (s || '').toUpperCase()
  const selectedUpper = new Set([...selectedFileTypes].map(upper))
  const available = allAvailableFileTypes || []
  const availableUpper = new Set(available.map(upper))
  const usedUpper = new Set<string>()
  GROUPS.forEach(({ types }) => types.forEach((t) => usedUpper.add(t)))
  const otherSet = new Set(available.map(upper).filter((t) => !usedUpper.has(t)))
  const result: string[] = []
  const unionSelected = new Set<string>()
  for (const { group, types } of GROUPS) {
    const inDropdown = new Set(types.filter((t) => availableUpper.has(t)))
    if (inDropdown.size === 0) continue
    const selectedInGroup = [...inDropdown].filter((t) => selectedUpper.has(t))
    if (selectedInGroup.length === 0) continue
    if (selectedInGroup.length < inDropdown.size) return null
    result.push(group)
    inDropdown.forEach((t) => unionSelected.add(t))
  }
  if (otherSet.size > 0) {
    const selectedInOther = [...otherSet].filter((t) => selectedUpper.has(t))
    if (selectedInOther.length > 0) {
      if (selectedInOther.length < otherSet.size) return null
      result.push('Other')
      otherSet.forEach((t) => unionSelected.add(t))
    }
  }
  if (unionSelected.size !== selectedUpper.size || [...selectedUpper].some((t) => !unionSelected.has(t))) return null
  return result.length > 0 ? result : null
}
