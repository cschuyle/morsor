import { resolveLanguageCodes, type LanguageCodeMap } from './languageCodeLookup'

const DURATION_FIELD_KEYS = new Set([
  'total_duration_seconds',
  'duration_seconds',
])

const SIZE_FIELD_KEYS = new Set([
  'total_size_bytes',
  'size_bytes',
])

const ISO_TIMESTAMP_RE =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?$/

/** Format ISO-8601 timestamps as `YYYY-MM-DD HH:MM:SS` (wall time from the string, no TZ shift). */
export function formatIsoTimestamp(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const match = trimmed.match(ISO_TIMESTAMP_RE)
  if (!match) {
    return null
  }
  return `${match[1]} ${match[2]}`
}

function isTimestampFieldKey(jsonKey: string): boolean {
  return jsonKey.toLowerCase().endsWith('_at')
}

/** Round seconds to the nearest minute and format as 1h22m (or 45m when under one hour). */
export function formatVideoDurationSeconds(seconds: number | undefined | null): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return ''
  }
  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours > 0) {
    return `${hours}h${minutes}m`
  }
  return `${minutes}m`
}

/** Human-readable byte size using bytes, K, MB, GB, TB (1024-based). */
export function formatVideoBytes(bytes: number | undefined | null): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    return ''
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} bytes`
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} K`
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }
  if (bytes < 1024 * 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`
  }
  return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(1)}TB`
}

export function videoFileBasename(source: unknown): string {
  if (typeof source !== 'string' || !source.trim()) {
    return 'file'
  }
  const normalized = source.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
}

export function formatVideoResolution(resolution: unknown): string {
  if (resolution == null || typeof resolution !== 'object' || Array.isArray(resolution)) {
    return ''
  }
  const r = resolution as Record<string, unknown>
  const w = r.width
  const h = r.height
  if (
    typeof w === 'number' &&
    typeof h === 'number' &&
    Number.isFinite(w) &&
    Number.isFinite(h) &&
    w > 0 &&
    h > 0
  ) {
    return `${Math.round(w)}x${Math.round(h)}`
  }
  return ''
}

/** One-line summary for an expandable list row: `movie.mkv, 2h45m, 1920x1080, 5.0MB`. */
export function formatVideoFileSummaryLine(file: unknown): string {
  if (file == null || typeof file !== 'object' || Array.isArray(file)) {
    return ''
  }
  const entry = file as Record<string, unknown>
  const parts: string[] = [videoFileBasename(entry.source)]
  if (typeof entry.duration_seconds === 'number') {
    const duration = formatVideoDurationSeconds(entry.duration_seconds)
    if (duration) {
      parts.push(duration)
    }
  }
  const resolution = formatVideoResolution(entry.resolution)
  if (resolution) {
    parts.push(resolution)
  }
  if (typeof entry.size_bytes === 'number') {
    const size = formatVideoBytes(entry.size_bytes)
    if (size) {
      parts.push(size)
    }
  }
  return parts.join(', ')
}

export function videoFileSourcePath(file: unknown): string | null {
  if (!isVideoMetadataFileEntry(file)) {
    return null
  }
  const source = file.source
  return typeof source === 'string' && source.trim() ? source.trim() : null
}

/** Comma-prefixed tail of {@link formatVideoFileSummaryLine} after the filename. */
export function videoFileSummarySuffix(file: unknown): string {
  const line = formatVideoFileSummaryLine(file)
  const filename = videoFileBasename(isVideoMetadataFileEntry(file) ? file.source : null)
  if (!line || line === filename) {
    return ''
  }
  if (line.startsWith(`${filename}, `)) {
    return line.slice(filename.length)
  }
  return line.slice(filename.length)
}

export function isVideoMetadataFileEntry(file: unknown): file is Record<string, unknown> {
  return file != null && typeof file === 'object' && !Array.isArray(file) && 'source' in file
}

function parseRawSourceRecord(raw: unknown): Record<string, unknown> | null {
  if (raw == null) {
    return null
  }
  let parsed: unknown = raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) {
      return null
    }
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      return null
    }
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }
  return parsed as Record<string, unknown>
}

function unwrapRawSourceItem(record: Record<string, unknown>): Record<string, unknown> {
  if (videoMetadataFilesFromExtra(record).length > 0) {
    return record
  }
  for (const key of Object.keys(record)) {
    const value = record[key]
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      const inner = value as Record<string, unknown>
      if (videoMetadataFilesFromExtra(inner).length > 0) {
        return inner
      }
    }
  }
  return record
}

/** Per-file metadata for expandable list rows (extraFields first, then raw source JSON). */
export function videoMetadataFilesFromRow(
  extra: Record<string, unknown> | null | undefined,
  rawSourceItem?: unknown,
): Record<string, unknown>[] {
  const fromExtra = videoMetadataFilesFromExtra(extra)
  if (fromExtra.length > 0) {
    return fromExtra
  }
  const parsed = parseRawSourceRecord(rawSourceItem)
  if (!parsed) {
    return []
  }
  return videoMetadataFilesFromExtra(unwrapRawSourceItem(parsed))
}

export type ExpandableListFile =
  | { kind: 'metadata'; file: Record<string, unknown> }
  | { kind: 'url'; url: string }

function urlStringsFromFilesArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    .map((entry) => entry.trim())
}

function urlStringsFromRawSourceItem(rawSourceItem?: unknown): string[] {
  const parsed = parseRawSourceRecord(rawSourceItem)
  if (!parsed) {
    return []
  }
  const fromTop = urlStringsFromFilesArray(parsed.files)
  if (fromTop.length > 0) {
    return fromTop
  }
  for (const key of Object.keys(parsed)) {
    const value = parsed[key]
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      const fromInner = urlStringsFromFilesArray((value as Record<string, unknown>).files)
      if (fromInner.length > 0) {
        return fromInner
      }
    }
  }
  return []
}

/** Basename for a URL or path in expandable file rows (strips query/hash first). */
export function urlFileBasename(url: string): string {
  const pathOnly = url.trim().replace(/[#?].*$/, '')
  return videoFileBasename(pathOnly)
}

/**
 * Per-file entries for expandable list rows: video metadata objects first, then URL strings
 * from {@link SearchResultRow.files} (e.g. Little Prince ebooks).
 */
export function expandableFilesFromRow(
  row: { files?: string[]; rawSourceItem?: unknown } | null | undefined,
  extra: Record<string, unknown> | null | undefined,
): ExpandableListFile[] {
  const metadata = videoMetadataFilesFromRow(extra, row?.rawSourceItem)
  if (metadata.length > 0) {
    return metadata.map((file) => ({ kind: 'metadata' as const, file }))
  }
  let urls = urlStringsFromFilesArray(row?.files)
  if (urls.length === 0) {
    urls = urlStringsFromRawSourceItem(row?.rawSourceItem)
  }
  return urls.map((url) => ({ kind: 'url' as const, url }))
}

/** Per-file video metadata from `extraFields.files` (not URL string arrays on the row). */
export function videoMetadataFilesFromExtra(
  extra: Record<string, unknown> | null | undefined,
): Record<string, unknown>[] {
  if (!extra) {
    return []
  }
  const files = extra.files
  if (!Array.isArray(files)) {
    return []
  }
  return files.filter(isVideoMetadataFileEntry)
}

function formatVideoFileEntry(file: unknown, languageCodeMap: LanguageCodeMap | null | undefined): string {
  if (file == null || typeof file !== 'object' || Array.isArray(file)) {
    return ''
  }
  const entry = file as Record<string, unknown>
  const name = videoFileBasename(entry.source)
  const parts: string[] = []
  if (entry.encoding != null && String(entry.encoding).trim()) {
    parts.push(String(entry.encoding))
  }
  if (typeof entry.duration_seconds === 'number') {
    const duration = formatVideoDurationSeconds(entry.duration_seconds)
    if (duration) {
      parts.push(duration)
    }
  }
  if (typeof entry.size_bytes === 'number') {
    const size = formatVideoBytes(entry.size_bytes)
    if (size) {
      parts.push(size)
    }
  }
  if (Array.isArray(entry.subtitles) && entry.subtitles.length > 0) {
    const labels = resolveLanguageCodes(
      entry.subtitles.filter((code): code is string => typeof code === 'string' && code.trim() !== ''),
      languageCodeMap,
    )
    if (labels.length > 0) {
      parts.push(labels.join(', '))
    }
  }
  if (parts.length === 0) {
    return name
  }
  return `${name} (${parts.join(' · ')})`
}

function formatVideoFilesArray(
  value: unknown,
  languageCodeMap: LanguageCodeMap | null | undefined,
): string {
  if (!Array.isArray(value)) {
    return ''
  }
  return value
    .map((file) => formatVideoFileEntry(file, languageCodeMap))
    .filter(Boolean)
    .join('; ')
}

/**
 * Format video trove extra fields (duration, size, per-file metadata) for display.
 * Returns null when the key is not a video metadata field.
 */
export function formatVideoExtraFieldValue(
  jsonKey: string,
  value: unknown,
  languageCodeMap: LanguageCodeMap | null | undefined,
): string | null {
  if (DURATION_FIELD_KEYS.has(jsonKey)) {
    return typeof value === 'number' ? formatVideoDurationSeconds(value) : ''
  }
  if (SIZE_FIELD_KEYS.has(jsonKey)) {
    return typeof value === 'number' ? formatVideoBytes(value) : ''
  }
  if (jsonKey === 'files') {
    return formatVideoFilesArray(value, languageCodeMap)
  }
  if (isTimestampFieldKey(jsonKey)) {
    const formatted = formatIsoTimestamp(value)
    if (formatted != null) {
      return formatted
    }
  }
  return null
}
