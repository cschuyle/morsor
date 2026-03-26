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
  domainName?: string | null
  punycodeDomainName?: string | null
  expirationDate?: string | null
  autoRenew?: boolean | null
  /** Present when itemType is littlePrinceItem: source fields not mapped to top-level props. */
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
}

/** Trove from /api/troves */
export interface Trove {
  id: string
  name: string
  count: number
  [key: string]: unknown
}

/** Duplicate finder row: primary item + matches */
export interface DuplicateRow {
  primary?: SearchResultRow
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
  isFallbackThumbnail?: boolean
  rawSourceItem?: unknown
}
