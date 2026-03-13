import { useState, useEffect } from 'react'
import type { UniqueResultRow, SearchResultRow } from './types'

interface UniquesResultsViewProps {
  results?: UniqueResultRow[]
  sortBy?: string | null
  sortDir?: 'asc' | 'desc'
  onSortChange?: ((columnId: string, direction: 'asc' | 'desc') => void) | null
}

/**
 * Renders "find uniques" results: items in primary trove that have no match in compare troves.
 * Each result has item (SearchResult), score (nearest-miss), and nearMisses (top possible duplicates).
 * sortBy / sortDir / onSortChange: optional column sort (title, trove, score).
 */
export function UniquesResultsView({ results = [], sortBy = null, sortDir = 'asc', onSortChange }: UniquesResultsViewProps) {
  const [dialogRow, setDialogRow] = useState<number | null>(null)

  useEffect(() => {
    if (dialogRow == null) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDialogRow(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dialogRow])

  const handleSort = (columnId: string) => {
    if (!onSortChange) return
    const nextDir = sortBy === columnId && sortDir === 'asc' ? 'desc' as const : 'asc' as const
    onSortChange(columnId, nextDir)
  }

  if (!results.length) {
    return (
      <p className="duplicate-results-empty">No unique items. Every primary item has a match in the compare troves.</p>
    )
  }

  const nearMisses = dialogRow != null ? (results[dialogRow]?.nearMisses ?? []) : []
  const primaryItem = dialogRow != null ? (results[dialogRow]?.item ?? results[dialogRow]) as SearchResultRow | undefined : undefined
  const primaryTitle = primaryItem?.title ?? ''

  return (
    <div className="duplicate-results uniques-results">
      <table className="duplicate-results-table">
        <thead>
          <tr>
            <th
              className={`col-title ${onSortChange ? 'sortable' : ''}`}
              onClick={onSortChange ? () => handleSort('title') : undefined}
            >
              Title
              {sortBy === 'title' && <span className="sort-indicator">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>}
            </th>
            <th
              className={`col-trove ${onSortChange ? 'sortable' : ''}`}
              onClick={onSortChange ? () => handleSort('trove') : undefined}
            >
              Trove
              {sortBy === 'trove' && <span className="sort-indicator">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>}
            </th>
            <th
              className={`col-score ${onSortChange ? 'sortable' : ''}`}
              onClick={onSortChange ? () => handleSort('score') : undefined}
            >
              Score
              {sortBy === 'score' && <span className="sort-indicator">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>}
            </th>
            <th className="col-uniques-help" aria-label="Possible duplicates" />
          </tr>
        </thead>
        <tbody>
          {results.map((row, idx) => {
            const item = (row?.item ?? row) as SearchResultRow | undefined
            const score = typeof row?.score === 'number' ? row.score : null
            return (
              <tr key={idx} className="duplicate-row-primary">
                <td className="col-title">{item?.title ?? '—'}</td>
                <td className="col-trove">{item?.trove ?? item?.troveId ?? ''}</td>
                <td className="col-score">{score != null ? score.toFixed(2) : '—'}</td>
                <td className="col-uniques-help">
                  <button
                    type="button"
                    className="uniques-help-btn"
                    onClick={() => setDialogRow(idx)}
                    title="Show top possible duplicates"
                    aria-label="Show top possible duplicates"
                  >
                    ?
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {dialogRow != null && (
        <div className="uniques-dialog-backdrop" onClick={() => setDialogRow(null)}>
          <div className="uniques-dialog" role="dialog" aria-modal="true" aria-labelledby="uniques-dialog-title" onClick={(e) => e.stopPropagation()}>
            <div className="uniques-dialog-header">
              <h3 id="uniques-dialog-title" className="uniques-dialog-title">Possible duplicates (top 5)</h3>
              <button
                type="button"
                className="uniques-dialog-close"
                onClick={() => setDialogRow(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {primaryTitle && <p className="uniques-dialog-primary">For: {primaryTitle}</p>}
            <ul className="uniques-dialog-list">
              {nearMisses.map((m, i) => {
                const r = (m?.result ?? m) as SearchResultRow | undefined
                const s = typeof m?.score === 'number' ? m.score : null
                return (
                  <li key={i} className="uniques-dialog-item">
                    <span className="uniques-dialog-item-title">{r?.title ?? '—'}</span>
                    <span className="uniques-dialog-item-meta">
                      {r?.trove ?? r?.troveId ?? ''}
                      {s != null && ` · ${s.toFixed(2)}`}
                    </span>
                  </li>
                )
              })}
            </ul>
            {nearMisses.length === 0 && (
              <p className="uniques-dialog-empty">No similar items found in compare troves.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
