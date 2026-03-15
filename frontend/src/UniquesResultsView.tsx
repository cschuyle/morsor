import { Fragment, useState, useEffect } from 'react'
import type { UniqueResultRow, SearchResultRow } from './types'
import { rawSourceDisplay } from './SearchResultsGrid'

const WORD_RE = /\b[\w']+\b/g

function getWordsFromTitles(nearMisses: Array<{ result?: SearchResultRow; score?: number }>): Set<string> {
  const set = new Set<string>()
  for (const m of nearMisses ?? []) {
    const title = (m?.result as SearchResultRow | undefined)?.title ?? ''
    const words = title.toLowerCase().match(WORD_RE) ?? []
    words.forEach((w) => set.add(w))
  }
  return set
}

function getWordsFromTitle(title: string): Set<string> {
  const words = (title ?? '').toLowerCase().match(WORD_RE) ?? []
  return new Set(words)
}

function titleWithMatchHighlight(title: string, highlightWords: Set<string>): React.ReactNode {
  if (!title) return '—'
  const segments = title.split(/(\b[\w']+\b)/g)
  return segments.map((seg, i) => {
    if (seg.length > 0 && /^[\w']+$/.test(seg) && highlightWords.has(seg.toLowerCase())) {
      return <span key={i} className="uniques-word-in-near-miss">{seg}</span>
    }
    return seg
  })
}

function titleWithExtraHighlight(matchTitle: string, primaryWords: Set<string>): React.ReactNode {
  if (!matchTitle) return '—'
  const segments = matchTitle.split(/(\b[\w']+\b)/g)
  return segments.map((seg, i) => {
    if (seg.length > 0 && /^[\w']+$/.test(seg) && !primaryWords.has(seg.toLowerCase())) {
      return <span key={i} className="dup-match-word-not-in-primary">{seg}</span>
    }
    return seg
  })
}

interface UniquesResultsViewProps {
  results?: UniqueResultRow[]
  sortBy?: string | null
  sortDir?: 'asc' | 'desc'
  onSortChange?: ((columnId: string, direction: 'asc' | 'desc') => void) | null
  onOpenRawSource?: (payload: { title: string; rawSourceItem: string }) => void
}

/**
 * Renders "find uniques" results: items in primary trove that have no match in compare troves.
 * Each result has item (SearchResult), score (nearest-miss), and nearMisses (top possible duplicates).
 * sortBy / sortDir / onSortChange: optional column sort (title, trove, score).
 */
export function UniquesResultsView({ results = [], sortBy = null, sortDir = 'asc', onSortChange, onOpenRawSource }: UniquesResultsViewProps) {
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
            const nearMisses = row?.nearMisses ?? []
            const nearMissWords = getWordsFromTitles(nearMisses)
            const primaryWords = getWordsFromTitle(item?.title ?? '')
            return (
              <Fragment key={idx}>
                <tr
                  className="duplicate-row-primary"
                  onClick={onOpenRawSource ? () => {
                    onOpenRawSource({ title: item?.title ?? '', rawSourceItem: rawSourceDisplay(item?.rawSourceItem) })
                  } : undefined}
                  title={onOpenRawSource ? 'Click to view raw source' : undefined}
                >
                  <td className="col-title">{titleWithMatchHighlight(item?.title ?? '—', nearMissWords)}</td>
                  <td className="col-trove">{item?.trove ?? item?.troveId ?? ''}</td>
                  <td className="col-score">{score != null ? score.toFixed(2) : '—'}</td>
                  <td className="col-uniques-help">
                    <button
                      type="button"
                      className="uniques-help-btn"
                      onClick={(e) => { e.stopPropagation(); setDialogRow(idx) }}
                      title="Show top possible duplicates"
                      aria-label="Show top possible duplicates"
                    >
                      ?
                    </button>
                  </td>
                </tr>
                {nearMisses.map((m, matchIdx) => {
                  const r = (m?.result ?? m) as SearchResultRow | undefined
                  const s = typeof m?.score === 'number' ? m.score : null
                  return (
                    <tr
                      key={matchIdx}
                      className="duplicate-row-match"
                      onClick={onOpenRawSource ? () => {
                        onOpenRawSource({ title: r?.title ?? '', rawSourceItem: rawSourceDisplay(r?.rawSourceItem) })
                      } : undefined}
                      title={onOpenRawSource ? 'Click to view raw source' : undefined}
                    >
                      <td className="col-title">{titleWithExtraHighlight(r?.title ?? '—', primaryWords)}</td>
                      <td className="col-trove">{r?.trove ?? r?.troveId ?? ''}</td>
                      <td className="col-score">{s != null ? s.toFixed(2) : '—'}</td>
                      <td className="col-uniques-help" />
                    </tr>
                  )
                })}
              </Fragment>
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
