/** Single search result row from API */
export interface SearchResultRow {
  id?: string
  title?: string
  trove?: string
  troveId?: string
  score?: number
  files?: string[]
  largeImageUrl?: string | null
  itemUrl?: string | null
  rawSourceItem?: unknown
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

/** Lightbox payload for SearchResultsGrid thumbnail click */
export interface LightboxPayload {
  imageUrl?: string | null
  title?: string
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
