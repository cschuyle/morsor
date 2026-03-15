import { useState, useMemo, useEffect, useCallback, useRef, type ReactNode } from 'react'
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
  allowThumbnailFallbackLightbox?: boolean
  isMobile?: boolean
}

const AMAZON_PLACEHOLDER_THUMB = 'https://m.media-amazon.com/images/I/01RmK+J4pJL._SS135_.gif'

function isPlaceholderThumb(url: unknown): boolean {
  if (!url || !String(url).trim()) return false
  const u = String(url).trim()
  return u === AMAZON_PLACEHOLDER_THUMB || u.includes('/no_image')
}

function PopOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="currentColor" aria-hidden="true">
      <path d="M27,33H5a2,2,0,0,1-2-2V9A2,2,0,0,1,5,7H15V9H5V31H27V21h2V31A2,2,0,0,1,27,33Z" />
      <path d="M18,3a1,1,0,0,0,0,2H29.59L15.74,18.85a1,1,0,1,0,1.41,1.41L31,6.41V18a1,1,0,0,0,2,0V3Z" />
    </svg>
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

function getLightboxPayload(row: SearchResultRow | undefined | null) {
  if (!row) return null
  const files = Array.isArray(row.files) ? row.files : []
  const pdfs = files.filter((u) => typeof u === 'string' && /\.pdf(\?|$)/i.test(u))
  const imageUrls = files.filter((u) => typeof u === 'string' && /\.(jpe?g|png|gif|webp|tiff?|bmp|svg)(\?|$)/i.test(u))
  const ebooks = files.filter((u) => typeof u === 'string' && /\.(mobi|epub)(\?|$)/i.test(u))
  const videos = files.filter((u) => typeof u === 'string' && /\.(mp4|m4v|avi|mov|mkv|webm|wmv|flv)(\?|$)/i.test(u))
  const audios = files.filter((u) => typeof u === 'string' && /\.(mp3|m4a|wav|ogg|flac|aac|wma)(\?|$)/i.test(u))
  const known = new Set([...pdfs, ...imageUrls, ...ebooks, ...videos, ...audios])
  const otherFiles = files.filter((u) => typeof u === 'string' && !known.has(u))
  const imageUrl = row.largeImageUrl || (imageUrls.length > 0 ? imageUrls[0] : null)
  const itemUrl = row.itemUrl && String(row.itemUrl).trim() ? row.itemUrl.trim() : null
  const hasContent = imageUrl || itemUrl || pdfs.length > 0 || imageUrls.length > 0 || ebooks.length > 0 || videos.length > 0 || audios.length > 0 || otherFiles.length > 0
  if (!hasContent) return null
  return { imageUrl, pdfs, imageUrls, ebooks, videos, audios, otherFiles, itemUrl, rawSourceItem: row.rawSourceItem }
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

function thumbnailColumnDef(
  onThumbnailClick: (payload: LightboxPayload) => void,
  allowThumbnailFallbackLightbox = false,
  isMobile = false,
  setRawSourceLightbox: ((state: { title: string; rawSourceItem: string } | null) => void) | null = null,
  hasThumbnails = true
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
      const fallbackThumbUrl = !thumbIsPlaceholder && url ? String(url).trim() : null
      const lightboxImageUrl = largeUrl || (allowThumbnailFallbackLightbox ? fallbackThumbUrl : null)
      const isFallbackThumbnail = !!(!largeUrl && lightboxImageUrl && fallbackThumbUrl)
      const showLinkIconInsteadOfThumb = isLittlePrince && (!url || thumbIsPlaceholder)
      const showLinkIconOnly = isLittlePrince && !url && itemUrl
      const hasThumbnailImage = url && !showLinkIconInsteadOfThumb
      const rawSourceItem = row?.rawSourceItem
      if (!isLittlePrince || (!url && !itemUrl)) return <span aria-hidden="true">&nbsp;</span>
      const fileTypeTooltip = getFileTypeTooltip(pdfs, imageUrls, ebooks, videos, audios, otherFiles, itemUrl, !!largeUrl)
      const payload = { imageUrl: lightboxImageUrl, title: row?.title ?? '', pdfs, imageUrls, ebooks, videos, audios, otherFiles, itemUrl, isFallbackThumbnail, rawSourceItem }
      const canClick = lightboxImageUrl || itemUrl || pdfs.length > 0 || imageUrls.length > 0 || ebooks.length > 0 || videos.length > 0 || audios.length > 0 || otherFiles.length > 0
      const linkIcon = (
        <span className="search-thumb-link-icon" aria-hidden="true">
          <PopOutIcon className="search-thumb-link-icon-img" />
        </span>
      )
      return (
        <button
          type="button"
          className="search-thumb-btn"
          title={fileTypeTooltip ?? (hasThumbnailImage || showLinkIconOnly ? 'View full size' : undefined)}
          onClick={() => canClick && onThumbnailClick(payload)}
          aria-label={showLinkIconOnly ? 'Open link' : (fileTypeTooltip ?? 'View full size')}
        >
          {largeUrl && url && !thumbIsPlaceholder && (
            <span className="search-thumb-pop-icon" aria-hidden="true">↗</span>
          )}
          {showLinkIconInsteadOfThumb ? (
            linkIcon
          ) : url ? (
            <img
              src={url}
              alt=""
              className="search-thumb"
              loading="lazy"
            />
          ) : null}
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

export function SearchResultsGrid({ data, sortBy = null, sortDir = 'asc', onSortChange, showScoreColumn = false, afterFilterSlot = null, viewMode = 'list', hideTroveInGallery = false, hideTroveInList = false, showPdfSashInGallery = false, showGalleryDecorations = true, allowThumbnailFallbackLightbox = false, isMobile = false }: SearchResultsGridProps) {
  const [globalFilter, setGlobalFilter] = useState('')
  const [lightbox, setLightbox] = useState<LightboxPayload | null>(null)
  const [rawSourceLightbox, setRawSourceLightbox] = useState<{ title: string; rawSourceItem: string } | null>(null)
  const galleryClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const galleryLastClickRef = useRef<{ rowId: string | number | null; time: number }>({ rowId: null, time: 0 })
  const tableRowLastClickRef = useRef<{ rowId: string | number | null; time: number }>({ rowId: null, time: 0 })
  const [urlTooltipState, setUrlTooltipState] = useState<{ startX: number; startY: number; endX: number; endY: number; above: boolean; url: string } | null>(null)
  const urlTooltipLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const urlTooltipShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const closeLightbox = useCallback(() => setLightbox(null), [])
  const closeRawSourceLightbox = useCallback(() => setRawSourceLightbox(null), [])
  useEffect(() => {
    const active = lightbox || rawSourceLightbox
    if (!active) return
    const onKey = (e) => { if (e.key === 'Escape') { closeLightbox(); closeRawSourceLightbox() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, rawSourceLightbox, closeLightbox, closeRawSourceLightbox])

  useEffect(() => () => {
    if (galleryClickTimeoutRef.current) clearTimeout(galleryClickTimeoutRef.current)
  }, [])

  const hasThumbnails = useMemo(
    () => Array.isArray(data) && data.some((row) => row && row.itemType === 'littlePrinceItem' && (row.thumbnailUrl || (row.itemUrl && String(row.itemUrl).trim()))),
    [data]
  )
  const listTextColumns = useMemo(
    () => (hideTroveInList ? textColumns.filter((c) => c.id !== 'trove') : textColumns),
    [hideTroveInList]
  )
  const baseColumns = useMemo(
    () => [thumbnailColumnDef((payload) => {
      if (payload.itemUrl && !payload.imageUrl) {
        window.open(payload.itemUrl, '_blank', 'noopener,noreferrer')
        return
      }
      setLightbox(payload)
    }, allowThumbnailFallbackLightbox, isMobile, setRawSourceLightbox, hasThumbnails), ...listTextColumns],
    [hasThumbnails, allowThumbnailFallbackLightbox, isMobile, listTextColumns]
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
        const lightboxContent = (
          <div
            className={`search-thumb-lightbox${lightbox?.isFallbackThumbnail ? ' search-thumb-lightbox--thumb-fallback' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label="Image full size"
            onClick={closeLightbox}
          >
            <button type="button" className="search-thumb-lightbox-close" onClick={closeLightbox} aria-label="Close">×</button>
            <div className="search-thumb-lightbox-content" onClick={(e) => e.stopPropagation()}>
              {lightbox.title && (
                <div className="search-thumb-lightbox-title">
                  {lightbox.title}
                </div>
              )}
              {lightbox.imageUrl && (
                <img src={lightbox.imageUrl} alt="" />
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
              const handleUrlTooltipEnter = (e) => {
                if (!showUrlTooltip) return
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
                  const cardRect = cardEl.getBoundingClientRect()
                  const startX = cardRect.left + cardRect.width / 2
                  const startY = cardRect.top + cardRect.height / 2

                  const gridEl = gridRef.current
                  const tooltipApproxHalfHeight = 24
                  let clampedEndX = startX
                  let endY
                  let above

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

                      let endYCandidate
                      let useAbove = false

                      if (viewportHeight > 0) {
                        const preferredAboveCenterY = cardRect.top - tooltipApproxHalfHeight - marginAbove
                        const tooltipTopIfAbove = preferredAboveCenterY - tooltipApproxHalfHeight

                        if (tooltipTopIfAbove >= viewportTopMargin) {
                          endYCandidate = preferredAboveCenterY
                          useAbove = true
                        } else {
                          // Place tooltip just below the card: gapBelow between card bottom and tooltip top
                          const preferredBelowCenterY = cardRect.bottom + tooltipApproxHalfHeight + gapBelow
                          endYCandidate = preferredBelowCenterY
                        }

                        const minCenterY = viewportTopOffset + tooltipApproxHalfHeight + viewportTopMargin
                        const maxCenterY = viewportTopOffset + viewportHeight - tooltipApproxHalfHeight - viewportBottomMargin
                        endY = Math.min(Math.max(endYCandidate, minCenterY), maxCenterY)
                        above = useAbove
                      } else {
                        // Fallback if viewport height is unavailable
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
                    // Fallback if gridRef is missing
                    const viewportTopMargin = 8
                    const viewportBottomMargin = 8
                    const marginAbove = 60
                    const gapBelow = 4

                    const preferredAboveCenterY = cardRect.top - tooltipApproxHalfHeight - marginAbove
                    const tooltipTopIfAbove = preferredAboveCenterY - tooltipApproxHalfHeight

                    let endYCandidate
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

                  setUrlTooltipState({
                    url: payload.itemUrl ?? '',
                    startX,
                    startY,
                    endX: clampedEndX,
                    endY,
                    above,
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
                  onMouseEnter={showUrlTooltip ? handleUrlTooltipEnter : undefined}
                  onMouseLeave={showUrlTooltip ? handleUrlTooltipLeave : undefined}
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

                      if (!payload) return
                      if (galleryClickTimeoutRef.current) {
                        clearTimeout(galleryClickTimeoutRef.current)
                        galleryClickTimeoutRef.current = null
                      }
                      const next = { ...payload, title }
                      if (next.itemUrl && !next.imageUrl) {
                        window.open(next.itemUrl, '_blank', 'noopener,noreferrer')
                        return
                      }
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
                    title={payload && !showUrlTooltip ? 'View full size' : undefined}
                    aria-label={payload ? (showUrlTooltip ? `Open ${payload.itemUrl}` : 'View full size') : undefined}
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
                style={{ width: header.column.id === 'title' ? '100%' : `var(--header-${header.id}-size)` }}
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
                    style={{ width: header.column.id === 'title' ? '100%' : `var(--header-${header.id}-size)` }}
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
                const rawSourceItem = rowData?.rawSourceItem
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
                    setRawSourceLightbox({ title: rowData?.title ?? '', rawSourceItem: rawSourceDisplay(rawSourceItem) })
                  }
                }
                return (
                  <tr
                    key={row.id}
                    className="grid-row-double-clickable"
                    onClick={handleRowClick}
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
