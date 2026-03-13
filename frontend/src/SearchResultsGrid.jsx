import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table'
import './SearchResultsGrid.css'

const AMAZON_PLACEHOLDER_THUMB = 'https://m.media-amazon.com/images/I/01RmK+J4pJL._SS135_.gif'

function isPlaceholderThumb(url) {
  if (!url || !String(url).trim()) return false
  const u = String(url).trim()
  return u === AMAZON_PLACEHOLDER_THUMB || u.includes('/no_image')
}

function PopOutIcon({ className }) {
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
  },
  {
    id: 'trove',
    accessorKey: 'trove',
    header: 'Trove',
    cell: (info) => info.getValue(),
  },
]

function getLightboxPayload(row) {
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
  return { imageUrl, pdfs, imageUrls, ebooks, videos, audios, otherFiles, itemUrl }
}

function getFileTypeTooltip(pdfs, imageUrls, ebooks, videos, audios, otherFiles, itemUrl, hasLargeImage) {
  const labels = new Set()
  if (itemUrl && hasLargeImage) labels.add('URL')
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

function thumbnailColumnDef(onThumbnailClick, allowThumbnailFallbackLightbox = false) {
  return {
    id: 'thumb',
    accessorKey: 'thumbnailUrl',
    header: '',
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
      if (!isLittlePrince || (!url && !itemUrl)) return <span aria-hidden="true">&nbsp;</span>
      const fileTypeTooltip = getFileTypeTooltip(pdfs, imageUrls, ebooks, videos, audios, otherFiles, itemUrl, !!largeUrl)
      const payload = { imageUrl: lightboxImageUrl, title: row?.title ?? '', pdfs, imageUrls, ebooks, videos, audios, otherFiles, itemUrl, isFallbackThumbnail }
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
          title={fileTypeTooltip ?? undefined}
          onClick={() => canClick && onThumbnailClick(payload)}
          aria-label={showLinkIconOnly ? 'Open link' : 'View full size'}
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
}

export function SearchResultsGrid({ data, sortBy = null, sortDir = 'asc', onSortChange, showScoreColumn = false, afterFilterSlot = null, viewMode = 'list', hideTroveInGallery = false, showPdfSashInGallery = false, showGalleryDecorations = true, allowThumbnailFallbackLightbox = false }) {
  const [globalFilter, setGlobalFilter] = useState('')
  const [lightbox, setLightbox] = useState(null)

  const closeLightbox = useCallback(() => setLightbox(null), [])
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e) => { if (e.key === 'Escape') closeLightbox() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox, closeLightbox])

  const hasThumbnails = useMemo(
    () => Array.isArray(data) && data.some((row) => row && row.itemType === 'littlePrinceItem' && (row.thumbnailUrl || (row.itemUrl && String(row.itemUrl).trim()))),
    [data]
  )
  const baseColumns = useMemo(
    () => (hasThumbnails ? [thumbnailColumnDef((payload) => {
      if (payload.itemUrl && !payload.imageUrl) {
        window.open(payload.itemUrl, '_blank', 'noopener,noreferrer')
        return
      }
      setLightbox(payload)
    }, allowThumbnailFallbackLightbox), ...textColumns] : textColumns),
    [hasThumbnails, allowThumbnailFallbackLightbox]
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
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

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
  const gridRef = useRef(null)
  const [backToTopCenterX, setBackToTopCenterX] = useState(null)
  const scrollContainerRef = useRef(null)
  useEffect(() => {
    const el = gridRef.current
    const scrollContainer = el?.closest('.main') ?? null
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
      {lightbox && (
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
              lightbox.pdfs.map((url, idx) => (
                <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="search-thumb-file-link">
                  {lightbox.pdfs.length > 1 ? `PDF ${idx + 1}` : 'PDF'}
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
                URL
              </a>
            )}
          </div>
        </div>
      )}
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
              const hasPdf = files.some((u) => typeof u === 'string' && /\.pdf(\?|$)/i.test(u))
              const hasTextNotPdf = files.some((u) => typeof u === 'string' && /\.(mobi|epub|txt|doc|docx|rtf|odt)(\?|$)/i.test(u))
              const hasAudio = files.some((u) => typeof u === 'string' && /\.(mp3|m4a|wav|ogg|flac|aac|wma)(\?|$)/i.test(u))
              const hasVideo = files.some((u) => typeof u === 'string' && /\.(mp4|webm|mov|avi|mkv|m4v|ogv|wmv)(\?|$)/i.test(u))
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
              return (
                <button
                  key={row.id ?? idx}
                  type="button"
                  className={`search-results-gallery-card${hideTroveInGallery ? ' search-results-gallery-card--title-wraps' : ''}`}
                  onClick={() => {
                    if (!payload) return
                    const next = { ...payload, title }
                    if (next.itemUrl && !next.imageUrl) {
                      window.open(next.itemUrl, '_blank', 'noopener,noreferrer')
                      return
                    }
                    setLightbox(next)
                  }}
                  disabled={!payload}
                  title={payload ? 'View full size' : title}
                >
                  <span className="search-results-gallery-card-image">
                    {hasImage ? (
                      <img src={thumbUrl} alt="" loading="lazy" />
                    ) : showLinkIcon ? (
                      galleryLinkIcon
                    ) : (
                      <span className="search-results-gallery-card-placeholder" aria-hidden="true">
                        {title ? title.charAt(0).toUpperCase() : '?'}
                      </span>
                    )}
                    {showGalleryDecorations && showPdfSashInGallery && hasPdf && (
                      <span className="search-results-gallery-card-pdf-sash" aria-hidden="true">
                        <img src="/pdf.svg" alt="" />
                      </span>
                    )}
                    {showGalleryDecorations && showPdfSashInGallery && hasTextNotPdf && !hasPdf && (
                      <span className="search-results-gallery-card-pdf-sash" aria-hidden="true">
                        <img src="/book.svg" alt="" />
                      </span>
                    )}
                    {showGalleryDecorations && showPdfSashInGallery && hasAudio && (
                      <span className="search-results-gallery-card-audio-sash" aria-hidden="true">
                        <img src="/audio.png" alt="" />
                      </span>
                    )}
                    {showGalleryDecorations && showPdfSashInGallery && hasVideo && (
                      <span className="search-results-gallery-card-video-sash" aria-hidden="true">
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
                </button>
              )
            })
          )}
        </div>
      ) : (
      <div className="grid-wrapper">
        <table className="grid-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={`col-${header.column.id} ${header.column.getCanSort() ? 'sortable' : ''}`}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    <span className="sort-indicator">
                      {{
                        asc: ' ↑',
                        desc: ' ↓',
                      }[header.column.getIsSorted()] ?? ''}
                    </span>
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
              table.getRowModel().rows.map((row) => (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={`col-${cell.column.id}`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
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
            if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' })
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
