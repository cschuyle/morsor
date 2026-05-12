/** Single search result row from API */
export interface SearchResultRow {
  id?: string
  title?: string
  /** JSON item shape key, e.g. littlePrinceItem, domain, movie */
  itemType?: string | null
  trove?: string
  troveId?: string
  score?: number
  files?: string[]
  largeImageUrl?: string | null
  itemUrl?: string | null
  rawSourceItem?: unknown
  /** Source fields not mapped to top-level props (any itemType). */
  extraFields?: Record<string, unknown> | null
  /** Legacy API name for {@link extraFields}; clients may still receive this until all caches expire. */
  littlePrinceItemExtra?: Record<string, unknown> | null
  [key: string]: unknown
}

/** Search API response */
export interface SearchResultData {
  count: number
  results: SearchResultRow[]
  page: number
  size: number
  warning?: string
  troveCounts?: Record<string, number>
  availableFileTypes?: string[]
  /** Hit count per file type for the full search result (for media dropdown). */
  fileTypeCounts?: Record<string, number>
  /** Distinct {@link SearchResultRow.extraFields} keys across the full result set (before pagination); for gallery sort. */
  availableExtraFieldKeys?: string[]
}

/** Trove from /api/troves */
export interface Trove {
  id: string
  name: string
  count: number
  cliCreated?: boolean
  updateTimestamp?: string | null
  [key: string]: unknown
}

/** Duplicate finder row: primary item + matches */
export interface DuplicateRow {
  primary?: SearchResultRow
  rerank?: string
  matches?: Array<{ result?: SearchResultRow; score?: number }>
}

/** Uniques result row */
export interface UniqueResultRow {
  item?: SearchResultRow
  score?: number
  nearMisses?: Array<{ result?: SearchResultRow; score?: number }>
}

/** Duplicates API response */
export interface DuplicatesResultData {
  total: number
  page: number
  size: number
  rows: DuplicateRow[]
  warning?: string
}

/** Uniques API response */
export interface UniquesResultData {
  total: number
  page: number
  size: number
  results: UniqueResultRow[]
  warning?: string
}

/** Lightbox payload for SearchResultsGrid thumbnail click */
export interface LightboxPayload {
  imageUrl?: string | null
  title?: string
  itemType?: string | null
  trove?: string | null
  pdfs?: string[]
  imageUrls?: string[]
  ebooks?: string[]
  videos?: string[]
  audios?: string[]
  otherFiles?: string[]
  itemUrl?: string | null
  rawSourceItem?: unknown
  /** When present, shown in the lightbox under the type/trove line (all item types). */
  extraFields?: Record<string, unknown> | null
  /** Legacy; merged with {@link extraFields} when building lightbox lines. */
  littlePrinceItemExtra?: Record<string, unknown> | null
}
