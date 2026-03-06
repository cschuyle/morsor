import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table'
import './SearchResultsGrid.css'

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

function thumbnailColumnDef(onThumbnailClick) {
  return {
    id: 'thumb',
    accessorKey: 'thumbnailUrl',
    header: '',
    cell: (info) => {
      const row = info.row.original
      const url = info.getValue()
      const itemType = row?.itemType
      const largeUrl = row?.largeImageUrl
      const files = Array.isArray(row?.files) ? row.files : []
      const pdfs = files.filter((u) => typeof u === 'string' && /\.pdf(\?|$)/i.test(u))
      const imageUrls = files.filter((u) => typeof u === 'string' && /\.(jpe?g|png|gif|webp|tiff?|bmp|svg)(\?|$)/i.test(u))
      const ebooks = files.filter((u) => typeof u === 'string' && /\.(mobi|epub)(\?|$)/i.test(u))
      const videos = files.filter((u) => typeof u === 'string' && /\.(mp4|m4v|avi|mov|mkv|webm|wmv|flv)(\?|$)/i.test(u))
      const audios = files.filter((u) => typeof u === 'string' && /\.(mp3|m4a|wav|ogg|flac|aac|wma)(\?|$)/i.test(u))
      const known = new Set([...pdfs, ...imageUrls, ...ebooks, ...videos, ...audios])
      const otherFiles = files.filter((u) => typeof u === 'string' && !known.has(u))
      if (!url || itemType !== 'littlePrinceItem') return <span aria-hidden="true">&nbsp;</span>
      return (
        <button
          type="button"
          className="search-thumb-btn"
          onClick={() => (largeUrl || pdfs.length > 0 || imageUrls.length > 0 || ebooks.length > 0 || videos.length > 0 || audios.length > 0 || otherFiles.length > 0) && onThumbnailClick({ imageUrl: largeUrl, pdfs, imageUrls, ebooks, videos, audios, otherFiles })}
          aria-label="View full size"
        >
          {largeUrl && (
            <span className="search-thumb-pop-icon" aria-hidden="true">↗</span>
          )}
          <img
            src={url}
            alt=""
            className="search-thumb"
            loading="lazy"
          />
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

export function SearchResultsGrid({ data, sortBy = null, sortDir = 'asc', onSortChange, showScoreColumn = false, afterFilterSlot = null }) {
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
    () => Array.isArray(data) && data.some((row) => row && row.thumbnailUrl && row.itemType === 'littlePrinceItem'),
    [data]
  )
  const baseColumns = useMemo(
    () => (hasThumbnails ? [thumbnailColumnDef(setLightbox), ...textColumns] : textColumns),
    [hasThumbnails]
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

  return (
    <div className="search-results-grid">
      {lightbox && (
        <div
          className="search-thumb-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Image full size"
          onClick={closeLightbox}
        >
          <button type="button" className="search-thumb-lightbox-close" onClick={closeLightbox} aria-label="Close">×</button>
          <div className="search-thumb-lightbox-content" onClick={(e) => e.stopPropagation()}>
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
          </div>
        </div>
      )}
      <div className="grid-toolbar">
        <input
          type="search"
          placeholder="Filter this page"
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="grid-filter-input"
        />
        {afterFilterSlot}
      </div>
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
    </div>
  )
}
