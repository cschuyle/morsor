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

/** Human-readable byte size using b, K, M, G (1024-based). */
export function formatVideoBytes(bytes: number | undefined | null): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
    return ''
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} b`
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} K`
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} M`
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} G`
}

function videoFileBasename(source: unknown): string {
  if (typeof source !== 'string' || !source.trim()) {
    return 'file'
  }
  const normalized = source.replace(/\\/g, '/')
  const idx = normalized.lastIndexOf('/')
  return idx >= 0 ? normalized.slice(idx + 1) : normalized
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
