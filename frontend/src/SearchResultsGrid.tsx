import { useState, useMemo, useEffect, useCallback, useRef, type ReactNode, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table'
import type { SearchResultRow, LightboxPayload } from './types'
import './SearchResultsGrid.css'

export interface SearchResultsGridProps {
  data?: SearchResultRow[] | null
  sortBy?: string | null
  sortDir?: 'asc' | 'desc'
  onSortChange?: ((columnId: string | null, direction: 'asc' | 'desc') => void) | null
  showScoreColumn?: boolean
  afterFilterSlot?: ReactNode
  viewMode?: 'list' | 'gallery'
  hideTroveInGallery?: boolean
  hideTroveInList?: boolean
  showPdfSashInGallery?: boolean
  showGalleryDecorations?: boolean
  isMobile?: boolean
  /** List view only: extra JSON keys (from {@link extraFields}) to show as non-sortable columns. */
  visibleExtraFieldKeys?: string[] | null
}

const AMAZON_PLACEHOLDER_THUMB = 'https://m.media-amazon.com/images/I/01RmK+J4pJL._SS135_.gif'

/** Display label for API itemType in lightbox (falls back to a trimmed string). */
function formatItemTypeForLightbox(value: unknown): string {
  if (value == null) return ''
  const s = String(value).trim()
  if (!s) return ''
  const map: Record<string, string> = {
    littlePrinceItem: 'Book',
    domain: 'Domain',
    movie: 'Movie',
  }
  if (map[s]) return map[s]
  const spaced = s.replace(/([a-z])([A-Z])/g, '$1 $2')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** One entry when a field value is an array: comma + space between items; no JSON quotes around strings. */
function formatLittlePrinceListItem(item: unknown): string {
  if (item === null || item === undefined) {
    return ''
  }
  if (typeof item === 'string') {
    return item
  }
  if (typeof item === 'number' || typeof item === 'boolean') {
    return String(item)
  }
  if (typeof item === 'bigint') {
    return String(item)
  }
  if (Array.isArray(item)) {
    return item.map(formatLittlePrinceListItem).filter((s) => s !== '').join(', ')
  }
  if (typeof item === 'object') {
    try {
      return JSON.stringify(item)
    } catch {
      return String(item)
    }
  }
  return String(item)
}

function formatLittlePrinceExtraValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  if (Array.isArray(value)) {
    return value.map(formatLittlePrinceListItem).filter((s) => s !== '').join(', ')
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (typeof value === 'bigint') {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/** Human-readable label for a JSON key: hyphens → spaces, camelCase split, title case. */
export function formatLittlePrinceFieldLabel(key: string): string {
  const s = key.trim()
  if (!s) {
    return ''
  }
  const noHyphens = s.replace(/-/g, ' ')
  const spaced = noHyphens.replace(/([a-z])([A-Z])/g, '$1 $2')
  return spaced
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

/** One row in the Little Prince extra hover tooltip (includes original JSON key for catalog links). */
type LittlePrinceExtraLine = { label: string; content: string; jsonKey: string }

function formatLittlePrinceExtraLines(extra: Record<string, unknown> | null | undefined): LittlePrinceExtraLine[] {
  if (extra == null || typeof extra !== 'object') {
    return []
  }
  const out: LittlePrinceExtraLine[] = []
  for (const [key, value] of Object.entries(extra)) {
    const content = formatLittlePrinceExtraValue(value)
    if (content === '') {
      continue
    }
    out.push({ label: formatLittlePrinceFieldLabel(key), content, jsonKey: key })
  }
  return out
}

/** Digits after the last hyphen (PP-4277 → 4277), else trailing digit run. */
function lpidNumericSuffixForCatalog(lpidRaw: string): string | null {
  const s = lpidRaw.trim()
  const afterHyphen = s.match(/-(\d+)$/)
  if (afterHyphen) {
    return afterHyphen[1]
  }
  const tail = s.match(/(\d+)$/)
  return tail ? tail[1] : null
}

function littlePrinceExtraCatalogLinkHref(jsonKey: string, content: string): string | null {
  if (jsonKey === 'lpid') {
    const n = lpidNumericSuffixForCatalog(content)
    if (!n) {
      return null
    }
    return `https://petit-prince-collection.com/lang/show_livre.php?id=${encodeURIComponent(n)}`
  }
  if (jsonKey === 'tintenfassId') {
    const id = content.trim()
    if (!id) {
      return null
    }
    return `https://editiontintenfass.de/en/catalog/${encodeURIComponent(id)}`
  }
  return null
}

/** Plain "Label: value" lines (e.g. aria-label); use formatLittlePrinceExtraLines + rich tooltip for bold labels. */
function formatLittlePrinceExtraTooltip(extra: Record<string, unknown> | null | undefined): string | null {
  const lines = formatLittlePrinceExtraLines(extra)
  return lines.length > 0 ? lines.map((l) => `${l.label}: ${l.content}`).join('\n') : null
}

function combineTooltipParts(...parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join('\n\n')
}

/** Strip trailing punctuation often glued to URLs in prose. */
function trimUrlDisplayAndHref(raw: string): string {
  return raw.replace(/[.,;:!?)\]}>'"]+$/g, '')
}

/**
 * Split plain text into fragments; substring that look like http(s) or www. URLs become links.
 */
function linkifyTextWithUrls(text: string): ReactNode {
  const re = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(text.slice(last, m.index))
    }
    const trimmed = trimUrlDisplayAndHref(m[0])
    if (trimmed.length > 0) {
      const href = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
      out.push(
        <a
          key={`lp-url-${key++}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="search-results-lp-extra-tooltip-catalog-link"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="search-results-lp-extra-tooltip-catalog-link-text">{trimmed}</span>
          <PopOutIcon className="search-results-lp-extra-tooltip-catalog-link-icon" />
        </a>
      )
    }
    last = m.index + m[0].length
  }
  if (last < text.length) {
    out.push(text.slice(last))
  }
  return out.length === 0 ? text : <>{out}</>
}

function isPlaceholderThumb(url: unknown): boolean {
  if (!url || !String(url).trim()) return false
  const u = String(url).trim()
  return u === AMAZON_PLACEHOLDER_THUMB || u.includes('/no_image')
}

/** List view URL tooltip: place near pointer like a default OS/browser hint (offset from cursor, clamped to viewport). */
function listUrlTooltipPositionFromPointer(clientX: number, clientY: number): { left: number; top: number } {
  const offsetX = 10
  const offsetY = 18
  const margin = 8
  const estHeight = 72
  const maxWidth = 480
  let left = clientX + offsetX
  let top = clientY + offsetY
  if (typeof window === 'undefined') {
    return { left, top }
  }
  const vw = window.innerWidth
  const vh = window.innerHeight
  if (left + maxWidth > vw - margin) {
    left = Math.max(margin, vw - margin - maxWidth)
  } else {
    left = Math.max(margin, left)
  }
  if (top + estHeight > vh - margin) {
    top = Math.max(margin, clientY - estHeight - 8)
  }
  top = Math.max(margin, Math.min(top, vh - margin - estHeight))
  return { left, top }
}

/** Viewport / grid-relative anchor for gallery URL tooltips (hover). */
function getUrlTooltipAnchor(
  cardEl: HTMLElement,
  gridEl: HTMLElement | null,
  isMobile: boolean
): { startX: number; startY: number; endX: number; endY: number; above: boolean } {
  const cardRect = cardEl.getBoundingClientRect()
  const startX = cardRect.left + cardRect.width / 2
  const startY = cardRect.top + cardRect.height / 2
  const tooltipApproxHalfHeight = 24
  let clampedEndX = startX
  let endY: number
  let above: boolean

  const vv = typeof window !== 'undefined' && window.visualViewport ? window.visualViewport : null
  const viewportHeight = vv ? vv.height : (window.innerHeight || document.documentElement.clientHeight || 0)
  const viewportTopOffset = vv ? vv.offsetTop : 0

  if (gridEl) {
    const gridRect = gridEl.getBoundingClientRect()
    const relX = startX - gridRect.left
    const containerWidth = gridRect.width
    if (containerWidth > 0) {
      const maxTooltipFraction = 2 / 3
      const halfMaxWidth = (maxTooltipFraction * containerWidth) / 2
      const edgeMargin = 8
      const minCenter = gridRect.left + halfMaxWidth + edgeMargin
      const maxCenter = gridRect.right - halfMaxWidth - edgeMargin
      clampedEndX = Math.min(Math.max(startX, minCenter), maxCenter)
    }

    if (isMobile) {
      const marginAbove = 60
      const gapBelow = 4
      const viewportTopMargin = 8
      const viewportBottomMargin = 8

      let endYCandidate: number
      let useAbove = false

      if (viewportHeight > 0) {
        const preferredAboveCenterY = cardRect.top - tooltipApproxHalfHeight - marginAbove
        const tooltipTopIfAbove = preferredAboveCenterY - tooltipApproxHalfHeight

        if (tooltipTopIfAbove >= viewportTopMargin) {
          endYCandidate = preferredAboveCenterY
          useAbove = true
        } else {
          const preferredBelowCenterY = cardRect.bottom + tooltipApproxHalfHeight + gapBelow
          endYCandidate = preferredBelowCenterY
        }

        const minCenterY = viewportTopOffset + tooltipApproxHalfHeight + viewportTopMargin
        const maxCenterY = viewportTopOffset + viewportHeight - tooltipApproxHalfHeight - viewportBottomMargin
        endY = Math.min(Math.max(endYCandidate, minCenterY), maxCenterY)
        above = useAbove
      } else {
        const preferredBelowCenterY = cardRect.bottom + tooltipApproxHalfHeight + gapBelow
        endY = preferredBelowCenterY
        above = false
      }
    } else {
      const spaceAbove = cardRect.top - gridRect.top
      const showAbove = spaceAbove > 120
      const margin = 6
      if (showAbove) {
        endY = cardRect.top - tooltipApproxHalfHeight - margin
      } else {
        endY = cardRect.bottom + tooltipApproxHalfHeight + margin
      }
      above = showAbove
    }
  } else {
    const viewportTopMargin = 8
    const viewportBottomMargin = 8
    const marginAbove = 60
    const gapBelow = 4

    const preferredAboveCenterY = cardRect.top - tooltipApproxHalfHeight - marginAbove
    const tooltipTopIfAbove = preferredAboveCenterY - tooltipApproxHalfHeight

    let endYCandidate: number
    let useAbove = false

    if (tooltipTopIfAbove >= viewportTopMargin) {
      endYCandidate = preferredAboveCenterY
      useAbove = true
    } else {
      const preferredBelowCenterY = cardRect.bottom + tooltipApproxHalfHeight + gapBelow
      endYCandidate = preferredBelowCenterY
    }

    if (viewportHeight > 0) {
      const minCenterY = tooltipApproxHalfHeight + viewportTopMargin
      const maxCenterY = viewportHeight - tooltipApproxHalfHeight - viewportBottomMargin
      endY = Math.min(Math.max(endYCandidate, minCenterY), maxCenterY)
    } else {
      endY = endYCandidate
    }
    above = useAbove
  }

  return { startX, startY, endX: clampedEndX, endY, above }
}

function PopOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="currentColor" aria-hidden="true">
      <path d="M27,33H5a2,2,0,0,1-2-2V9A2,2,0,0,1,5,7H15V9H5V31H27V21h2V31A2,2,0,0,1,27,33Z" />
      <path d="M18,3a1,1,0,0,0,0,2H29.59L15.74,18.85a1,1,0,1,0,1.41,1.41L31,6.41V18a1,1,0,0,0,2,0V3Z" />
    </svg>
  )
}

/** Rich LP extra lines (bold labels, linkified URLs, catalog links)—shared by hover tooltip and lightbox. */
function LittlePrinceExtraLinesRich({ lines }: { lines: LittlePrinceExtraLine[] }) {
  return (
    <>
      {lines.map((line, i) => {
        const catalogHref = littlePrinceExtraCatalogLinkHref(line.jsonKey, line.content)
        return (
          <div key={i} className="search-results-lp-extra-tooltip-line">
            <strong className="search-results-lp-extra-tooltip-line-label">{`${line.label}:`}</strong>
            {/* NBSP: keep field name + value on the same line when the line wraps (no break right after ":"). */}
            {'\u00A0'}
            <span className="search-results-lp-extra-tooltip-line-value">
              <span className="search-results-lp-extra-tooltip-content">{linkifyTextWithUrls(line.content)}</span>
              {catalogHref ? (
                <>
                  {' '}
                  (
                  <a
                    href={catalogHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="search-results-lp-extra-tooltip-catalog-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="search-results-lp-extra-tooltip-catalog-link-text">Link</span>
                    <PopOutIcon className="search-results-lp-extra-tooltip-catalog-link-icon" />
                  </a>
                  )
                </>
              ) : null}
            </span>
          </div>
        )
      })}
    </>
  )
}

const textColumns = [
  {
    id: 'title',
    accessorKey: 'title',
    header: 'Title',
    cell: (info) => info.getValue(),
    size: 500,
    minSize: 80,
    maxSize: 1200,
  },
  {
    id: 'trove',
    accessorKey: 'trove',
    header: 'Trove',
    cell: (info) => info.getValue(),
    size: 80,
    minSize: 40,
    maxSize: 400,
  },
]

/**
 * Extra field map from a search row: {@link SearchResultRow.extraFields} (current API) or legacy
 * {@code littlePrinceItemExtra} so older responses and the lightbox/tooltips stay in sync.
 */
export function extraFieldsFromRow(row: SearchResultRow | undefined | null): Record<string, unknown> | null {
  if (!row) {
    return null
  }
  const asRecord = (v: unknown): Record<string, unknown> | null =>
    v != null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  return asRecord(row.extraFields) ?? asRecord((row as Record<string, unknown>).littlePrinceItemExtra)
}

/** LP vendor ids: always listed in the extra-fields picker when any row is a Little Prince item. */
const LITTLE_PRINCE_EXTRA_FIELD_KEYS_ALWAYS_OFFERED = ['lpid', 'tintenfassId'] as const

/** Distinct extra-field JSON keys on the current rows, sorted for stable column order. */
export function collectExtraFieldKeysFromRows(rows: SearchResultRow[] | null | undefined): string[] {
  if (!Array.isArray(rows) || rows.length === 0) {
    return []
  }
  const keys = new Set<string>()
  let hasLittlePrinceItem = false
  for (const row of rows) {
    if (row?.itemType === 'littlePrinceItem') {
      hasLittlePrinceItem = true
    }
    const ex = extraFieldsFromRow(row)
    if (!ex) {
      continue
    }
    for (const k of Object.keys(ex)) {
      keys.add(k)
    }
  }
  if (hasLittlePrinceItem) {
    for (const k of LITTLE_PRINCE_EXTRA_FIELD_KEYS_ALWAYS_OFFERED) {
      keys.add(k)
    }
  }
  return [...keys].sort((a, b) => a.localeCompare(b))
}

/** Extra map for lightbox / tooltips (supports legacy field on the payload). */
function extraFieldsFromLightboxPayload(lb: LightboxPayload): Record<string, unknown> | null {
  const asRecord = (v: unknown): Record<string, unknown> | null =>
    v != null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  const rawExtra: unknown = lb.extraFields
  const fromPrimary = asRecord(rawExtra)
  if (fromPrimary) {
    return fromPrimary
  }
  const legacy = asRecord((lb as Record<string, unknown>).littlePrinceItemExtra)
  if (legacy) {
    return legacy
  }
  if (typeof rawExtra === 'string') {
    const t = rawExtra.trim()
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(t)
        return asRecord(parsed)
      } catch {
        return null
      }
    }
  }
  return null
}

/**
 * Build lightbox payload for any result row. Center image prefers {@link SearchResultRow.largeImageUrl}, then a non-placeholder {@link SearchResultRow.thumbnailUrl}.
 * Always returns a payload when the row is present so the lightbox can open even with no media.
 */
function rowToLightboxPayload(row: SearchResultRow | undefined | null): LightboxPayload | null {
  if (!row) return null
  const files = Array.isArray(row.files) ? row.files : []
  const pdfs = files.filter((u) => typeof u === 'string' && /\.pdf(\?|$)/i.test(u))
  const imageUrls = files.filter((u) => typeof u === 'string' && /\.(jpe?g|png|gif|webp|tiff?|bmp|svg)(\?|$)/i.test(u))
  const ebooks = files.filter((u) => typeof u === 'string' && /\.(mobi|epub)(\?|$)/i.test(u))
  const videos = files.filter((u) => typeof u === 'string' && /\.(mp4|m4v|avi|mov|mkv|webm|wmv|flv)(\?|$)/i.test(u))
  const audios = files.filter((u) => typeof u === 'string' && /\.(mp3|m4a|wav|ogg|flac|aac|wma)(\?|$)/i.test(u))
  const known = new Set([...pdfs, ...imageUrls, ...ebooks, ...videos, ...audios])
  const otherFiles = files.filter((u) => typeof u === 'string' && !known.has(u))
  const largeUrl =
    row.largeImageUrl && String(row.largeImageUrl).trim() ? String(row.largeImageUrl).trim() : null
  const thumbCandidate =
    row.thumbnailUrl && String(row.thumbnailUrl).trim() ? String(row.thumbnailUrl).trim() : null
  const imageUrl: string | null =
    largeUrl != null
      ? largeUrl
      : thumbCandidate != null && !isPlaceholderThumb(thumbCandidate)
        ? thumbCandidate
        : null

  const itemUrl = row.itemUrl && String(row.itemUrl).trim() ? row.itemUrl.trim() : null

  const troveName = row.trove != null && String(row.trove).trim() ? String(row.trove).trim() : null
  const itemType = row.itemType != null && String(row.itemType).trim() ? String(row.itemType).trim() : null

  return {
    imageUrl,
    pdfs,
    imageUrls,
    ebooks,
    videos,
    audios,
    otherFiles,
    itemUrl,
    rawSourceItem: row.rawSourceItem,
    itemType,
    trove: troveName,
    title: row.title ?? '',
    extraFields: extraFieldsFromRow(row),
  }
}

function getLightboxPayload(row: SearchResultRow | undefined | null) {
  return rowToLightboxPayload(row)
}

function getFileTypeTooltip(pdfs: string[], imageUrls: string[], ebooks: string[], videos: string[], audios: string[], otherFiles: string[], itemUrl: string | null, hasLargeImage: boolean): string | null {
  const labels = new Set()
  if (itemUrl && hasLargeImage) labels.add('Link')
  if (pdfs.length > 0) labels.add('PDF')
  imageUrls.forEach((u) => {
    const m = u.match(/\.(jpe?g|png|gif|webp|tiff?|bmp|svg)(\?|$)/i)
    if (m) labels.add(m[1].toUpperCase())
  })
  ebooks.forEach((u) => {
    const m = u.match(/\.(mobi|epub)(\?|$)/i)
    if (m) labels.add(m[1].toUpperCase())
  })
  videos.forEach((u) => {
    const m = u.match(/\.(mp4|m4v|avi|mov|mkv|webm|wmv|flv)(\?|$)/i)
    if (m) labels.add(m[1].toUpperCase())
  })
  audios.forEach((u) => {
    const m = u.match(/\.(mp3|m4a|wav|ogg|flac|aac|wma)(\?|$)/i)
    if (m) labels.add(m[1].toUpperCase())
  })
  otherFiles.forEach((u) => {
    const m = u.match(/\.([a-z0-9]+)(\?|$)/i)
    labels.add(m ? m[1].toUpperCase() : 'Other')
  })
  const list = [...labels].sort()
  if (itemUrl && !hasLargeImage) {
    const mediaPart = list.length > 0 ? ` · Media: ${list.join(', ')}` : ''
    return `Link: ${itemUrl}${mediaPart}`
  }
  return list.length > 0 ? `Media: ${list.join(', ')}` : null
}

function ThumbColumnHeader({ column }: { column: { getIsSorted: () => false | 'asc' | 'desc' } }) {
  const sorted = column.getIsSorted()
  return (
    <span className="grid-thumb-header-icons">
      <img src="/thumb-thumbnail.png" alt="" aria-hidden="true" className="grid-thumb-header-thumbs" />
      <img src={sorted === 'asc' ? '/to-top.png' : '/to-bottom.png'} alt="" aria-hidden="true" className="grid-thumb-header-direction" />
    </span>
  )
}

type LpExtraHoverHandlers = {
  onEnter: (lines: LittlePrinceExtraLine[], e: MouseEvent<HTMLElement>) => void
  onMove: (e: MouseEvent<HTMLElement>) => void
  onLeave: () => void
}

function thumbnailColumnDef(
  onThumbnailClick: (payload: LightboxPayload) => void,
  isMobile = false,
  setRawSourceLightbox: ((state: { title: string; rawSourceItem: string } | null) => void) | null = null,
  hasThumbnails = true,
  lpExtraHover: LpExtraHoverHandlers | null = null
) {
  return {
    id: 'thumb',
    accessorKey: 'thumbnailUrl',
    header: ({ column }) => <ThumbColumnHeader column={column} />,
    size: hasThumbnails ? 80 : 48,
    minSize: 40,
    maxSize: hasThumbnails ? 200 : 48,
    enableResizing: false,
    cell: (info) => {
      const row = info.row.original
      const url = info.getValue()
      const itemType = row?.itemType
      const largeUrl = row?.largeImageUrl
      const itemUrl = row?.itemUrl && String(row.itemUrl).trim() ? row.itemUrl.trim() : null
      const files = Array.isArray(row?.files) ? row.files : []
      const pdfs = files.filter((u) => typeof u === 'string' && /\.pdf(\?|$)/i.test(u))
      const imageUrls = files.filter((u) => typeof u === 'string' && /\.(jpe?g|png|gif|webp|tiff?|bmp|svg)(\?|$)/i.test(u))
      const ebooks = files.filter((u) => typeof u === 'string' && /\.(mobi|epub)(\?|$)/i.test(u))
      const videos = files.filter((u) => typeof u === 'string' && /\.(mp4|m4v|avi|mov|mkv|webm|wmv|flv)(\?|$)/i.test(u))
      const audios = files.filter((u) => typeof u === 'string' && /\.(mp3|m4a|wav|ogg|flac|aac|wma)(\?|$)/i.test(u))
      const known = new Set([...pdfs, ...imageUrls, ...ebooks, ...videos, ...audios])
      const otherFiles = files.filter((u) => typeof u === 'string' && !known.has(u))
      const isLittlePrince = itemType === 'littlePrinceItem'
      const thumbIsPlaceholder = isPlaceholderThumb(url)
      const showLinkIconInsteadOfThumb = isLittlePrince && (!url || thumbIsPlaceholder)
      const showLinkIconOnly = isLittlePrince && !url && itemUrl
      const hasThumbnailImage = isLittlePrince && url && !showLinkIconInsteadOfThumb
      const showNonLpThumb = !isLittlePrince && url && String(url).trim() && !thumbIsPlaceholder
      const fileTypeTooltip = getFileTypeTooltip(pdfs, imageUrls, ebooks, videos, audios, otherFiles, itemUrl, !!largeUrl)
      const rowExtras = extraFieldsFromRow(row)
      const lpLines = formatLittlePrinceExtraLines(rowExtras ?? undefined)
      const lpExtraPlain = formatLittlePrinceExtraTooltip(rowExtras ?? undefined)
      const payload = rowToLightboxPayload(row)
      const linkIcon = (
        <span className="search-thumb-link-icon" aria-hidden="true">
          <PopOutIcon className="search-thumb-link-icon-img" />
        </span>
      )
      const defaultTitle = hasThumbnailImage || showNonLpThumb || showLinkIconOnly ? 'View full size' : 'View details'
      const thumbTitle =
        lpLines.length > 0
          ? fileTypeTooltip ?? defaultTitle
          : combineTooltipParts(lpExtraPlain, fileTypeTooltip) || defaultTitle
      const thumbAriaLabel = showLinkIconOnly
        ? 'Open link'
        : combineTooltipParts(lpExtraPlain, fileTypeTooltip) || defaultTitle
      return (
        <button
          type="button"
          className="search-thumb-btn"
          title={thumbTitle}
          onClick={() => payload && onThumbnailClick(payload)}
          onMouseEnter={lpLines.length > 0 && lpExtraHover ? (e) => lpExtraHover.onEnter(lpLines, e) : undefined}
          onMouseMove={lpLines.length > 0 && lpExtraHover ? (e) => lpExtraHover.onMove(e) : undefined}
          onMouseLeave={lpLines.length > 0 && lpExtraHover ? lpExtraHover.onLeave : undefined}
          aria-label={thumbAriaLabel}
        >
          {largeUrl && url && !thumbIsPlaceholder && isLittlePrince && (
            <span className="search-thumb-pop-icon" aria-hidden="true">↗</span>
          )}
          {isLittlePrince ? (
            showLinkIconInsteadOfThumb ? (
              linkIcon
            ) : url ? (
              <img
                src={url}
                alt=""
                className="search-thumb"
                loading="lazy"
              />
            ) : null
          ) : showNonLpThumb ? (
            <img
              src={url}
              alt=""
              className="search-thumb"
              loading="lazy"
            />
          ) : (
            linkIcon
          )}
        </button>
      )
    },
  }
}
const scoreColumn = {
  id: 'score',
  accessorKey: 'score',
  header: 'Score',
  cell: (info) => {
    const v = info.getValue()
    return typeof v === 'number' ? v.toFixed(2) : '—'
  },
  size: 80,
  minSize: 50,
  maxSize: 150,
}

const RAW_SOURCE_NOT_AVAILABLE = 'Raw Source Not Available'

export function rawSourceDisplay(rawSourceItem: unknown): string {
  return (rawSourceItem != null && rawSourceItem !== '') ? String(rawSourceItem) : RAW_SOURCE_NOT_AVAILABLE
}

export function SearchResultsGrid({ data, sortBy = null, sortDir = 'asc', onSortChange, showScoreColumn = false, afterFilterSlot = null, viewMode = 'list', hideTroveInGallery = false, hideTroveInList = false, showPdfSashInGallery = false, showGalleryDecorations = true, isMobile = false, visibleExtraFieldKeys = null }: SearchResultsGridProps) {
  const [globalFilter, setGlobalFilter] = useState('')
  const [lightbox, setLightbox] = useState<LightboxPayload | null>(null)
  const [rawSourceLightbox, setRawSourceLightbox] = useState<{ title: string; rawSourceItem: string } | null>(null)
  const galleryClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const galleryLastClickRef = useRef<{ rowId: string | number | null; time: number }>({ rowId: null, time: 0 })
  const tableRowLastClickRef = useRef<{ rowId: string | number | null; time: number }>({ rowId: null, time: 0 })
  const [urlTooltipState, setUrlTooltipState] = useState<{ startX: number; startY: number; endX: number; endY: number; above: boolean; url: string } | null>(null)
  const urlTooltipLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const urlTooltipShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [listUrlTooltipState, setListUrlTooltipState] = useState<{
    left: number
    top: number
    url: string
  } | null>(null)
  const listUrlTooltipLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listUrlTooltipShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listUrlPointerRef = useRef({ x: 0, y: 0 })
  const [lpExtraRichTooltipState, setLpExtraRichTooltipState] = useState<{
    left: number
    top: number
    lines: LittlePrinceExtraLine[]
  } | null>(null)
  const lpExtraTooltipLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lpExtraTooltipShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lpExtraPointerRef = useRef({ x: 0, y: 0 })

  const handleLpExtraMouseEnter = useCallback(
    (lines: LittlePrinceExtraLine[], e: MouseEvent<HTMLElement>) => {
      if (lines.length === 0) {
        return
      }
      setListUrlTooltipState(null)
      lpExtraPointerRef.current = { x: e.clientX, y: e.clientY }
      if (lpExtraTooltipLeaveTimerRef.current) {
        clearTimeout(lpExtraTooltipLeaveTimerRef.current)
        lpExtraTooltipLeaveTimerRef.current = null
      }
      if (lpExtraTooltipShowTimerRef.current) {
        clearTimeout(lpExtraTooltipShowTimerRef.current)
        lpExtraTooltipShowTimerRef.current = null
      }
      lpExtraTooltipShowTimerRef.current = setTimeout(() => {
        const { x, y } = lpExtraPointerRef.current
        const { left, top } = listUrlTooltipPositionFromPointer(x, y)
        setLpExtraRichTooltipState({ left, top, lines })
      }, 500)
    },
    []
  )

  const handleLpExtraMouseMove = useCallback((e: MouseEvent<HTMLElement>) => {
    lpExtraPointerRef.current = { x: e.clientX, y: e.clientY }
  }, [])

  const handleLpExtraMouseLeave = useCallback(() => {
    if (lpExtraTooltipShowTimerRef.current) {
      clearTimeout(lpExtraTooltipShowTimerRef.current)
      lpExtraTooltipShowTimerRef.current = null
    }
    lpExtraTooltipLeaveTimerRef.current = setTimeout(() => {
      setLpExtraRichTooltipState(null)
    }, 150)
  }, [])

  const lpExtraHoverHandlers = useMemo<LpExtraHoverHandlers>(
    () => ({
      onEnter: handleLpExtraMouseEnter,
      onMove: handleLpExtraMouseMove,
      onLeave: handleLpExtraMouseLeave,
    }),
    [handleLpExtraMouseEnter, handleLpExtraMouseMove, handleLpExtraMouseLeave]
  )

  const closeLightbox = useCallback(() => setLightbox(null), [])
  const closeRawSourceLightbox = useCallback(() => setRawSourceLightbox(null), [])
  useEffect(() => {
    const active = lightbox || rawSourceLightbox
    if (!active) return
    const onKey = (e) => { if (e.key === 'Escape') { closeLightbox(); closeRawSourceLightbox() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, rawSourceLightbox, closeLightbox, closeRawSourceLightbox])

  useEffect(() => {
    if (lightbox || rawSourceLightbox) {
      setListUrlTooltipState(null)
      setLpExtraRichTooltipState(null)
    }
  }, [lightbox, rawSourceLightbox])

  useEffect(() => () => {
    if (listUrlTooltipShowTimerRef.current) clearTimeout(listUrlTooltipShowTimerRef.current)
    if (listUrlTooltipLeaveTimerRef.current) clearTimeout(listUrlTooltipLeaveTimerRef.current)
    if (lpExtraTooltipShowTimerRef.current) clearTimeout(lpExtraTooltipShowTimerRef.current)
    if (lpExtraTooltipLeaveTimerRef.current) clearTimeout(lpExtraTooltipLeaveTimerRef.current)
  }, [])

  useEffect(() => () => {
    if (galleryClickTimeoutRef.current) clearTimeout(galleryClickTimeoutRef.current)
  }, [])

  const hasThumbnails = useMemo(
    () => Array.isArray(data) && data.some((row) => row && row.itemType === 'littlePrinceItem' && (row.thumbnailUrl || (row.itemUrl && String(row.itemUrl).trim()))),
    [data]
  )
  const hasResults = Array.isArray(data) && data.length > 0
  const listTextColumns = useMemo(
    () => (hideTroveInList ? textColumns.filter((c) => c.id !== 'trove') : textColumns),
    [hideTroveInList]
  )
  const extraFieldColumns = useMemo(() => {
    if (viewMode !== 'list' || !visibleExtraFieldKeys || visibleExtraFieldKeys.length === 0) {
      return []
    }
    return visibleExtraFieldKeys.map((jsonKey) => ({
      id: `extra:${jsonKey}`,
      accessorFn: (row: SearchResultRow) => {
        const ex = extraFieldsFromRow(row)
        return ex?.[jsonKey]
      },
      header: formatLittlePrinceFieldLabel(jsonKey),
      enableSorting: false,
      cell: (info: { getValue: () => unknown }) => {
        const v = info.getValue()
        const text = formatLittlePrinceExtraValue(v)
        if (!text) {
          return ''
        }
        return <span className="search-grid-extra-cell" title={text}>{text}</span>
      },
      size: 140,
      minSize: 48,
      maxSize: 520,
    }))
  }, [viewMode, visibleExtraFieldKeys])
  const baseColumns = useMemo(
    () => [thumbnailColumnDef((payload) => {
      setLightbox(payload)
    }, isMobile, setRawSourceLightbox, hasThumbnails, lpExtraHoverHandlers), ...listTextColumns, ...extraFieldColumns],
    [hasThumbnails, isMobile, listTextColumns, lpExtraHoverHandlers, extraFieldColumns]
  )
  const columns = useMemo(
    () => (showScoreColumn ? [...baseColumns, scoreColumn] : baseColumns),
    [baseColumns, showScoreColumn]
  )
  const sorting = useMemo(
    () => (sortBy ? [{ id: sortBy, desc: sortDir === 'desc' }] : []),
    [sortBy, sortDir]
  )

  const table = useReactTable({
    data: data ?? [],
    columns,
    state: {
      sorting,
      globalFilter,
    },
    onSortingChange: (updater) => {
      if (typeof updater !== 'function' || !onSortChange) return
      const next = updater(sorting)
      if (next.length > 0) {
        onSortChange(next[0].id, next[0].desc ? 'desc' : 'asc')
      } else {
        onSortChange(null, 'asc')
      }
    },
    onGlobalFilterChange: setGlobalFilter,
    manualSorting: true,
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
    defaultColumn: { minSize: 40, maxSize: 1200 },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const columnSizeVars = useMemo(() => {
    const headers = table.getFlatHeaders()
    const vars: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i]
      vars[`--header-${header.id}-size`] = `${header.getSize()}px`
      vars[`--col-${header.column.id}-size`] = `${header.column.getSize()}px`
    }
    return vars
  }, [table.getState().columnSizingInfo, table.getState().columnSizing])

  const filteredRowsForGallery = useMemo(() => {
    const rows = data ?? []
    const q = (globalFilter || '').trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => {
      const title = (row?.title ?? '').toLowerCase()
      const trove = (row?.trove ?? '').toLowerCase()
      return title.includes(q) || trove.includes(q)
    })
  }, [data, globalFilter])

  const showGallery = viewMode === 'gallery'
  const [showBackToTop, setShowBackToTop] = useState(false)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [backToTopCenterX, setBackToTopCenterX] = useState<number | null>(null)
  const scrollContainerRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    const el = gridRef.current
    const scrollContainer = (el?.closest('.main') ?? null) as HTMLElement | null
    scrollContainerRef.current = scrollContainer
    const threshold = 200
    const getScrollTop = () => (scrollContainer ? scrollContainer.scrollTop : window.scrollY)
    const onScroll = () => setShowBackToTop(getScrollTop() > threshold)
    onScroll()
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', onScroll, { passive: true })
      return () => scrollContainer.removeEventListener('scroll', onScroll)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const updateCenter = () => {
      const rect = el.getBoundingClientRect()
      setBackToTopCenterX(rect.left + rect.width / 2)
    }
    updateCenter()
    const ro = new ResizeObserver(updateCenter)
    ro.observe(el)
    window.addEventListener('resize', updateCenter)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updateCenter)
    }
  }, [showGallery])

  return (
    <div className="search-results-grid" ref={gridRef}>
      {urlTooltipState && showGallery && (
        <div
          className={`search-results-gallery-url-tooltip search-results-gallery-url-tooltip--centered${urlTooltipState.above ? ' search-results-gallery-url-tooltip--above' : ' search-results-gallery-url-tooltip--below'}`}
          style={{
            ['--tooltip-start-x' as string]: `${urlTooltipState.startX}px`,
            ['--tooltip-start-y' as string]: `${urlTooltipState.startY}px`,
            ['--tooltip-end-x' as string]: `${urlTooltipState.endX}px`,
            ['--tooltip-end-y' as string]: `${urlTooltipState.endY}px`,
          }}
          onMouseEnter={() => {
            if (urlTooltipLeaveTimerRef.current) {
              clearTimeout(urlTooltipLeaveTimerRef.current)
              urlTooltipLeaveTimerRef.current = null
            }
          }}
          onMouseLeave={() => setUrlTooltipState(null)}
        >
          Open{' '}
          <a
            href={urlTooltipState.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {urlTooltipState.url}
          </a>
        </div>
      )}
      {listUrlTooltipState && !showGallery && (
        <div
          className="search-results-list-url-tooltip"
          style={{
            left: listUrlTooltipState.left,
            top: listUrlTooltipState.top,
          }}
          onMouseEnter={() => {
            if (listUrlTooltipLeaveTimerRef.current) {
              clearTimeout(listUrlTooltipLeaveTimerRef.current)
              listUrlTooltipLeaveTimerRef.current = null
            }
          }}
          onMouseLeave={() => setListUrlTooltipState(null)}
        >
          <a
            href={listUrlTooltipState.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            {listUrlTooltipState.url}
          </a>
        </div>
      )}
      {lpExtraRichTooltipState && (
        <div
          className="search-results-lp-extra-tooltip"
          style={{
            left: lpExtraRichTooltipState.left,
            top: lpExtraRichTooltipState.top,
          }}
          onMouseEnter={() => {
            if (lpExtraTooltipLeaveTimerRef.current) {
              clearTimeout(lpExtraTooltipLeaveTimerRef.current)
              lpExtraTooltipLeaveTimerRef.current = null
            }
          }}
          onMouseLeave={() => setLpExtraRichTooltipState(null)}
        >
          <LittlePrinceExtraLinesRich lines={lpExtraRichTooltipState.lines} />
        </div>
      )}
      {rawSourceLightbox && (() => {
        const rawSourceContent = (
          <div
            className="search-raw-source-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Raw source"
            onClick={closeRawSourceLightbox}
          >
            <button type="button" className="search-thumb-lightbox-close" onClick={closeRawSourceLightbox} aria-label="Close">×</button>
            <div className="search-raw-source-lightbox-content" onClick={(e) => e.stopPropagation()}>
              {rawSourceLightbox.title && (
                <div className="search-thumb-lightbox-title">
                  {rawSourceLightbox.title}
                </div>
              )}
              <pre className="search-raw-source-lightbox-pre">{rawSourceDisplay(rawSourceLightbox.rawSourceItem)}</pre>
            </div>
            <div className="search-raw-source-lightbox-footer" onClick={(e) => e.stopPropagation()}>
              <div className="search-thumb-lightbox-raw-wrap">
                <span className="search-thumb-lightbox-raw-btn search-thumb-lightbox-raw-btn--label" aria-hidden="true">RAW</span>
              </div>
            </div>
          </div>
        )
        return isMobile && typeof document !== 'undefined'
          ? createPortal(rawSourceContent, document.body)
          : rawSourceContent
      })()}
      {lightbox && (() => {
        const lpExtraLines = formatLittlePrinceExtraLines(extraFieldsFromLightboxPayload(lightbox) ?? undefined)
        const hasLpExtra = lpExtraLines.length > 0
        const hasLightboxImage = Boolean(lightbox.imageUrl && String(lightbox.imageUrl).trim())
        const desktopLpExtraBesideImage = !isMobile && hasLpExtra && hasLightboxImage

        const lightboxContent = (
          <div
            className="search-thumb-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label="Image full size"
            onClick={closeLightbox}
          >
            <button type="button" className="search-thumb-lightbox-close" onClick={closeLightbox} aria-label="Close">×</button>
            <div
              className={
                desktopLpExtraBesideImage
                  ? 'search-thumb-lightbox-content search-thumb-lightbox-content--lp-extra-beside-image'
                  : 'search-thumb-lightbox-content'
              }
              onClick={(e) => e.stopPropagation()}
            >
              {lightbox.title && (
                <div className="search-thumb-lightbox-title">
                  {lightbox.title}
                </div>
              )}
              {(() => {
                const typeLabel = formatItemTypeForLightbox(lightbox.itemType)
                const troveLabel = lightbox.trove != null ? String(lightbox.trove).trim() : ''
                if (!typeLabel && !troveLabel) return null
                return (
                  <div className="search-thumb-lightbox-description">
                    {typeLabel && troveLabel ? (
                      <>
                        {'A '}
                        <strong>{typeLabel}</strong>
                        {" from the '"}
                        <strong>{troveLabel}</strong>
                        {"' trove"}
                      </>
                    ) : typeLabel ? (
                      <strong>{typeLabel}</strong>
                    ) : (
                      <>
                        <strong>{troveLabel}</strong>
                        {' trove'}
                      </>
                    )}
                  </div>
                )
              })()}
              {desktopLpExtraBesideImage ? (
                <div className="search-thumb-lightbox-media-panel">
                  <div className="search-thumb-lightbox-media-panel-image">
                    <img src={lightbox.imageUrl!} alt="" />
                  </div>
                  <div className="search-thumb-lightbox-media-panel-extra">
                    <div className="search-results-lp-extra-tooltip search-results-lp-extra-tooltip--in-lightbox search-results-lp-extra-tooltip--in-lightbox--beside-image">
                      <LittlePrinceExtraLinesRich lines={lpExtraLines} />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {hasLpExtra ? (
                    <div className="search-results-lp-extra-tooltip search-results-lp-extra-tooltip--in-lightbox">
                      <LittlePrinceExtraLinesRich lines={lpExtraLines} />
                    </div>
                  ) : null}
                  {hasLightboxImage ? <img src={lightbox.imageUrl!} alt="" /> : null}
                </>
              )}
            </div>
            <div className="search-thumb-lightbox-footer" onClick={(e) => e.stopPropagation()}>
              <div className="search-thumb-lightbox-footer-main">
                {Array.isArray(lightbox.imageUrls) &&
                  lightbox.imageUrls.map((imgUrl) => (
                    <a
                      key={imgUrl}
                      href={imgUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="search-thumb-lightbox-thumb"
                      aria-label="Open image"
                    >
                      <img src={imgUrl} alt="" />
                    </a>
                  ))}
                {Array.isArray(lightbox.pdfs) &&
                  (lightbox.pdfs ?? []).map((url, idx) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="search-thumb-file-link">
                      {(lightbox.pdfs?.length ?? 0) > 1 ? `PDF ${idx + 1}` : 'PDF'}
                    </a>
                  ))}
                {Array.isArray(lightbox.ebooks) &&
                  lightbox.ebooks.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="search-thumb-file-link">
                      {(/\.epub(\?|$)/i.test(url) ? 'EPUB' : 'MOBI')}
                    </a>
                  ))}
                {Array.isArray(lightbox.videos) &&
                  lightbox.videos.map((url) => {
                    const ext = (url.match(/\.([a-z0-9]+)(\?|$)/i) || [])[1] || 'video'
                    return (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="search-thumb-file-link">
                        {ext.toUpperCase()}
                      </a>
                    )
                  })}
                {Array.isArray(lightbox.audios) &&
                  lightbox.audios.map((url) => {
                    const ext = (url.match(/\.([a-z0-9]+)(\?|$)/i) || [])[1] || 'audio'
                    return (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="search-thumb-file-link">
                        {ext.toUpperCase()}
                      </a>
                    )
                  })}
                {Array.isArray(lightbox.otherFiles) &&
                  lightbox.otherFiles.map((url) => {
                    const ext = (url.match(/\.([a-z0-9]+)(\?|$)/i) || [])[1] || 'file'
                    return (
                      <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="search-thumb-file-link">
                        {ext.toUpperCase()}
                      </a>
                    )
                  })}
                {lightbox.itemUrl && (
                  <a href={lightbox.itemUrl} target="_blank" rel="noopener noreferrer" className="search-thumb-file-link">
                    Link
                  </a>
                )}
              </div>
              <div className="search-thumb-lightbox-raw-wrap">
                {(lightbox.rawSourceItem != null && lightbox.rawSourceItem !== '') && (
                  <button
                    type="button"
                    className="search-thumb-lightbox-raw-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeLightbox()
                      setRawSourceLightbox({ title: lightbox.title ?? '', rawSourceItem: rawSourceDisplay(lightbox.rawSourceItem) })
                    }}
                    aria-label="View raw source"
                  >
                    RAW
                  </button>
                )}
              </div>
            </div>
          </div>
        )
        return isMobile && typeof document !== 'undefined'
          ? createPortal(lightboxContent, document.body)
          : lightboxContent
      })()}
      {hasResults && (
        <div className="grid-toolbar">
          <div className="grid-filter-wrap">
            <input
              type="search"
              placeholder="Filter this page"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setGlobalFilter('') } }}
              className="grid-filter-input"
            />
            {globalFilter && (
              <button
                type="button"
                className="grid-filter-clear"
                onClick={() => setGlobalFilter('')}
                aria-label="Clear filter"
              >
                ×
              </button>
            )}
          </div>
          {afterFilterSlot}
        </div>
      )}
      {showGallery ? (
        <div className="search-results-gallery">
          {filteredRowsForGallery.length === 0 ? (
            <p className="search-results-gallery-empty">{globalFilter ? 'No rows match the filter.' : 'No items.'}</p>
          ) : (
            filteredRowsForGallery.map((row, idx) => {
              const payload = getLightboxPayload(row)
              const thumbUrl = row?.thumbnailUrl
              const thumbIsPlaceholder = isPlaceholderThumb(thumbUrl)
              const itemUrl = row?.itemUrl && String(row.itemUrl).trim() ? row.itemUrl.trim() : null
              const hasImage = thumbUrl && !thumbIsPlaceholder && row?.itemType === 'littlePrinceItem'
              const showLinkIcon = row?.itemType === 'littlePrinceItem' && (!thumbUrl || thumbIsPlaceholder)
              const title = row?.title ?? ''
              const trove = row?.trove ?? ''
              const files = Array.isArray(row?.files) ? row.files : []
              const pdfs = files.filter((u) => typeof u === 'string' && /\.pdf(\?|$)/i.test(u))
              const audios = files.filter((u) => typeof u === 'string' && /\.(mp3|m4a|wav|ogg|flac|aac|wma)(\?|$)/i.test(u))
              const videos = files.filter((u) => typeof u === 'string' && /\.(mp4|webm|mov|avi|mkv|m4v|ogv|wmv)(\?|$)/i.test(u))
              const hasPdf = pdfs.length > 0
              const textFiles = files.filter((u) => typeof u === 'string' && /\.(mobi|epub|txt|doc|docx|rtf|odt)(\?|$)/i.test(u))
              const hasTextNotPdf = textFiles.length > 0
              const hasAudio = audios.length > 0
              const hasVideo = videos.length > 0
              const openSashFile = (e, url) => {
                e.preventDefault()
                e.stopPropagation()
                if (url) window.open(url, '_blank', 'noopener,noreferrer')
              }
              const isPdf = (u) => typeof u === 'string' && /\.pdf(\?|$)/i.test(u)
              const isAudio = (u) => typeof u === 'string' && /\.(mp3|m4a|wav|ogg|flac|aac|wma)(\?|$)/i.test(u)
              const isVideo = (u) => typeof u === 'string' && /\.(mp4|webm|mov|avi|mkv|m4v|ogv|wmv)(\?|$)/i.test(u)
              const otherFileExts = new Set()
              files.forEach((u) => {
                if (typeof u !== 'string' || isPdf(u) || isAudio(u) || isVideo(u)) return
                const m = u.match(/\.([a-z0-9]+)(\?|$)/i)
                if (m) otherFileExts.add(m[1].toUpperCase())
              })
              const otherFileTypesList = [...otherFileExts].sort()
              const galleryLinkIcon = (
                <span className="search-results-gallery-card-link-icon" aria-hidden="true">
                  <PopOutIcon className="search-results-gallery-card-link-icon-img" />
                </span>
              )
              const rawSourceItem = row?.rawSourceItem
              const openRawSource = (e) => {
                e.preventDefault()
                e.stopPropagation()
                if (galleryClickTimeoutRef.current) {
                  clearTimeout(galleryClickTimeoutRef.current)
                  galleryClickTimeoutRef.current = null
                }
                setLightbox(null)
                setRawSourceLightbox({ title, rawSourceItem: rawSourceDisplay(rawSourceItem) })
              }
              const showUrlTooltip = payload?.itemUrl && !payload?.imageUrl
              const rowExtras = extraFieldsFromRow(row)
              const lpLines = formatLittlePrinceExtraLines(rowExtras ?? undefined)
              const lpExtraPlain = formatLittlePrinceExtraTooltip(rowExtras ?? undefined)
              const galleryCardTitle =
                showUrlTooltip
                  ? undefined
                  : lpLines.length > 0
                    ? undefined
                    : payload
                      ? 'View full size'
                      : undefined
              const galleryAriaLabel = payload
                ? showUrlTooltip
                  ? `Open ${payload.itemUrl}`
                  : lpExtraPlain || 'View full size'
                : undefined
              const handleUrlTooltipEnter = (e) => {
                if (!showUrlTooltip) return
                setLpExtraRichTooltipState(null)
                if (urlTooltipLeaveTimerRef.current) {
                  clearTimeout(urlTooltipLeaveTimerRef.current)
                  urlTooltipLeaveTimerRef.current = null
                }
                if (urlTooltipShowTimerRef.current) {
                  clearTimeout(urlTooltipShowTimerRef.current)
                  urlTooltipShowTimerRef.current = null
                }
                const cardEl = e.currentTarget
                urlTooltipShowTimerRef.current = setTimeout(() => {
                  const anchor = getUrlTooltipAnchor(cardEl, gridRef.current, isMobile)
                  setUrlTooltipState({
                    url: payload.itemUrl ?? '',
                    ...anchor,
                  })
                }, 500)
              }
              const handleUrlTooltipLeave = () => {
                if (urlTooltipShowTimerRef.current) {
                  clearTimeout(urlTooltipShowTimerRef.current)
                  urlTooltipShowTimerRef.current = null
                }
                urlTooltipLeaveTimerRef.current = setTimeout(() => setUrlTooltipState(null), 150)
              }
              return (
                <div
                  key={row.id ?? idx}
                  className="search-results-gallery-card-wrap"
                  onMouseEnter={
                    showUrlTooltip
                      ? handleUrlTooltipEnter
                      : lpLines.length > 0
                        ? (e) => handleLpExtraMouseEnter(lpLines, e)
                        : undefined
                  }
                  onMouseMove={showUrlTooltip ? undefined : lpLines.length > 0 ? handleLpExtraMouseMove : undefined}
                  onMouseLeave={showUrlTooltip ? handleUrlTooltipLeave : lpLines.length > 0 ? handleLpExtraMouseLeave : undefined}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    className={`search-results-gallery-card${hideTroveInGallery ? ' search-results-gallery-card--title-wraps' : ''}`}
                    onClick={() => {
                      const now = Date.now()
                      const rowId = row.id ?? idx
                      const last = galleryLastClickRef.current
                      const isDoubleClick = last.rowId === rowId && (now - last.time) < 400
                      galleryLastClickRef.current = { rowId, time: now }

                      if (isDoubleClick) {
                        if (galleryClickTimeoutRef.current) {
                          clearTimeout(galleryClickTimeoutRef.current)
                          galleryClickTimeoutRef.current = null
                        }
                        setLightbox(null)
                        setRawSourceLightbox({ title: title ?? '', rawSourceItem: rawSourceDisplay(rawSourceItem) })
                        return
                      }

                      if (galleryClickTimeoutRef.current) {
                        clearTimeout(galleryClickTimeoutRef.current)
                        galleryClickTimeoutRef.current = null
                      }
                      const next = { ...payload, title }
                      galleryClickTimeoutRef.current = setTimeout(() => {
                        galleryClickTimeoutRef.current = null
                        setLightbox(next)
                      }, 400)
                    }}
                    onDoubleClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      openRawSource(e)
                    }}
                    title={galleryCardTitle}
                    aria-label={galleryAriaLabel}
                  >
                  <span className="search-results-gallery-card-image">
                    {hasImage ? (
                      <img src={typeof thumbUrl === 'string' ? thumbUrl : ''} alt="" loading="lazy" />
                    ) : showLinkIcon ? (
                      galleryLinkIcon
                    ) : (
                      <span className="search-results-gallery-card-placeholder" aria-hidden="true">
                        {typeof title === 'string' && title ? title.charAt(0).toUpperCase() : '?'}
                      </span>
                    )}
                    {showGalleryDecorations && showPdfSashInGallery && hasPdf && (
                      <span
                        className="search-results-gallery-card-pdf-sash"
                        role="button"
                        tabIndex={0}
                        aria-label="Open PDF"
                        onClick={(e) => openSashFile(e, pdfs[0])}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSashFile(e, pdfs[0]) } }}
                      >
                        <img src="/pdf.svg" alt="" />
                      </span>
                    )}
                    {showGalleryDecorations && showPdfSashInGallery && hasTextNotPdf && !hasPdf && (
                      <span
                        className="search-results-gallery-card-pdf-sash"
                        role="button"
                        tabIndex={0}
                        aria-label="Open file"
                        onClick={(e) => openSashFile(e, textFiles[0])}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSashFile(e, textFiles[0]) } }}
                      >
                        <img src="/book.svg" alt="" />
                      </span>
                    )}
                    {showGalleryDecorations && showPdfSashInGallery && hasAudio && (
                      <span
                        className="search-results-gallery-card-audio-sash"
                        role="button"
                        tabIndex={0}
                        aria-label="Open audio"
                        onClick={(e) => openSashFile(e, audios[0])}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSashFile(e, audios[0]) } }}
                      >
                        <img src="/audio.png" alt="" />
                      </span>
                    )}
                    {showGalleryDecorations && showPdfSashInGallery && hasVideo && (
                      <span
                        className="search-results-gallery-card-video-sash"
                        role="button"
                        tabIndex={0}
                        aria-label="Open video"
                        onClick={(e) => openSashFile(e, videos[0])}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSashFile(e, videos[0]) } }}
                      >
                        <img src="/video.svg" alt="" />
                      </span>
                    )}
                  </span>
                  {showGalleryDecorations && otherFileTypesList.length > 0 && (
                    <span className="search-results-gallery-card-other-filetypes" aria-hidden="true">
                      {otherFileTypesList.join(', ')}
                    </span>
                  )}
                  <span className="search-results-gallery-card-title">{title || '\u00A0'}</span>
                  {!hideTroveInGallery && <span className="search-results-gallery-card-trove">{trove || '\u00A0'}</span>}
                  <button
                    type="button"
                    className="search-results-gallery-card-raw-btn"
                    onClick={(e) => { e.stopPropagation(); openRawSource(e) }}
                    title="View raw source"
                    aria-label="View raw source"
                  >
                    {'{…}'}
                  </button>
                </div>
                </div>
              )
            })
          )}
        </div>
      ) : (
      <div className="grid-wrapper">
        <table
          className={`grid-table${isMobile ? ' grid-table--mobile' : ''}`}
          style={{
            ...columnSizeVars,
            width: isMobile ? '100%' : ('max(100%, ' + table.getTotalSize() + 'px)'),
          }}
        >
          <colgroup>
            {table.getFlatHeaders().map((header) => (
              <col
                key={header.id}
                style={{ width: `var(--header-${header.id}-size)` }}
              />
            ))}
          </colgroup>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={`col-${header.column.id} ${header.column.getCanSort() ? 'sortable' : ''}`}
                    style={{ width: `var(--header-${header.id}-size)` }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span className="grid-th-content">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.id !== 'thumb' && (
                        <span className="sort-indicator">
                          {({ asc: ' ↑', desc: ' ↓' } as Record<string, string>)[String(header.column.getIsSorted())] ?? ''}
                        </span>
                      )}
                    </span>
                    {header.column.getCanResize() && (
                      <div
                        className={`grid-col-resizer ${header.column.getIsResizing() ? 'is-resizing' : ''}`}
                        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); header.getResizeHandler()(e) }}
                        onTouchStart={(e) => { e.preventDefault(); header.getResizeHandler()(e) }}
                        onDoubleClick={() => header.column.resetSize()}
                        onClick={(e) => e.stopPropagation()}
                        role="separator"
                        aria-orientation="vertical"
                        aria-label="Resize column"
                      />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="grid-empty">
                  {globalFilter ? 'No rows match the filter.' : 'No items.'}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => {
                const rowData = row.original
                const listItemUrl =
                  rowData?.itemUrl && String(rowData.itemUrl).trim() ? String(rowData.itemUrl).trim() : null
                const listRowLpLines =
                  !listItemUrl
                    ? formatLittlePrinceExtraLines(extraFieldsFromRow(rowData) ?? undefined)
                    : []
                const handleRowClick = () => {
                  const now = Date.now()
                  const rowId = row.id
                  const last = tableRowLastClickRef.current
                  const isDoubleClick = last.rowId === rowId && (now - last.time) < 300
                  tableRowLastClickRef.current = { rowId, time: now }
                  if (isDoubleClick) {
                    if (galleryClickTimeoutRef.current) {
                      clearTimeout(galleryClickTimeoutRef.current)
                      galleryClickTimeoutRef.current = null
                    }
                    const lb = rowToLightboxPayload(rowData)
                    if (lb) setLightbox(lb)
                  }
                }
                const handleListUrlTooltipMove = listItemUrl
                  ? (e: MouseEvent<HTMLTableRowElement>) => {
                    listUrlPointerRef.current = { x: e.clientX, y: e.clientY }
                  }
                  : undefined
                const handleListUrlTooltipEnter = listItemUrl
                  ? (e: MouseEvent<HTMLTableRowElement>) => {
                    setLpExtraRichTooltipState(null)
                    listUrlPointerRef.current = { x: e.clientX, y: e.clientY }
                    if (listUrlTooltipLeaveTimerRef.current) {
                      clearTimeout(listUrlTooltipLeaveTimerRef.current)
                      listUrlTooltipLeaveTimerRef.current = null
                    }
                    if (listUrlTooltipShowTimerRef.current) {
                      clearTimeout(listUrlTooltipShowTimerRef.current)
                      listUrlTooltipShowTimerRef.current = null
                    }
                    listUrlTooltipShowTimerRef.current = setTimeout(() => {
                      const { x, y } = listUrlPointerRef.current
                      const { left, top } = listUrlTooltipPositionFromPointer(x, y)
                      setListUrlTooltipState({
                        url: listItemUrl,
                        left,
                        top,
                      })
                    }, 500)
                  }
                  : undefined
                const handleListUrlTooltipLeave = listItemUrl
                  ? () => {
                    if (listUrlTooltipShowTimerRef.current) {
                      clearTimeout(listUrlTooltipShowTimerRef.current)
                      listUrlTooltipShowTimerRef.current = null
                    }
                    listUrlTooltipLeaveTimerRef.current = setTimeout(() => {
                      setListUrlTooltipState(null)
                    }, 150)
                  }
                  : undefined
                return (
                  <tr
                    key={row.id}
                    className="grid-row-double-clickable"
                    onClick={handleRowClick}
                    onMouseEnter={
                      listItemUrl
                        ? handleListUrlTooltipEnter
                        : listRowLpLines.length > 0
                          ? (e) => handleLpExtraMouseEnter(listRowLpLines, e)
                          : undefined
                    }
                    onMouseMove={
                      listItemUrl
                        ? handleListUrlTooltipMove
                        : listRowLpLines.length > 0
                          ? handleLpExtraMouseMove
                          : undefined
                    }
                    onMouseLeave={
                      listItemUrl
                        ? handleListUrlTooltipLeave
                        : listRowLpLines.length > 0
                          ? handleLpExtraMouseLeave
                          : undefined
                    }
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className={`col-${cell.column.id}`}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      )}
      {showBackToTop && (
        <button
          type="button"
          className="back-to-top-btn"
          style={backToTopCenterX != null ? { left: backToTopCenterX } : undefined}
          onClick={() => {
            const sc = scrollContainerRef.current
            if (sc && 'scrollTo' in sc) sc.scrollTo({ top: 0, behavior: 'smooth' })
            else window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          aria-label="Back to top"
          title="Back to top"
        >
          <span aria-hidden="true">▲</span>
        </button>
      )}
    </div>
  )
}
