import { Fragment } from 'react'
import type { DuplicateRow } from './types'

const WORD_RE = /\b\w+\b/g

function getPrimaryWords(primaryTitle: string): Set<string> {
  const lower = (primaryTitle ?? '').toLowerCase()
  const words = lower.match(WORD_RE) ?? []
  return new Set(words)
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

interface DuplicateResultsViewProps {
  rows?: DuplicateRow[]
  sortBy?: string | null
  sortDir?: 'asc' | 'desc'
  onSortChange?: ((columnId: string, direction: 'asc' | 'desc') => void) | null
}

/**
 * Renders duplicate-finder results: each row has one primary item and N match rows (different style).
 * sortBy / sortDir / onSortChange: optional column sort (title, trove, score). Sorting uses primary row only.
 */
export function DuplicateResultsView({ rows = [], sortBy = null, sortDir = 'asc', onSortChange }: DuplicateResultsViewProps) {
  const handleSort = (columnId: string) => {
    if (!onSortChange) return
    const nextDir = sortBy === columnId && sortDir === 'asc' ? 'desc' as const : 'asc' as const
    onSortChange(columnId, nextDir)
  }

  if (!rows.length) {
    return (
      <p className="duplicate-results-empty">No duplicate rows. Try a different query or trove selection.</p>
    )
  }
  return (
    <div className="duplicate-results">
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
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => {
            const maxScore = (row.matches ?? []).reduce((best, m) => {
              const s = typeof m?.score === 'number' ? m.score : -Infinity
              return s > best ? s : best
            }, -Infinity)
            const primaryScore = maxScore === -Infinity ? '—' : maxScore.toFixed(2)
            return (
            <Fragment key={rowIdx}>
              <tr className="duplicate-row-primary">
                <td className="col-title">{row.primary?.title ?? '—'}</td>
                <td className="col-trove">{row.primary?.trove ?? row.primary?.troveId ?? ''}</td>
                <td className="col-score" aria-label="Primary item (max match score)">{primaryScore}</td>
              </tr>
              {(row.matches ?? []).filter((m) => String(m.result?.id ?? '') !== String(row.primary?.id ?? '')).map((m, matchIdx) => {
                const primaryWords = getPrimaryWords(row.primary?.title ?? '')
                return (
                <tr key={matchIdx} className="duplicate-row-match">
                  <td className="col-title">{titleWithExtraHighlight(m.result?.title ?? '—', primaryWords)}</td>
                  <td className="col-trove">{m.result?.trove ?? m.result?.troveId ?? ''}</td>
                  <td className="col-score">{typeof m.score === 'number' ? m.score.toFixed(2) : '—'}</td>
                </tr>
              )
              })}
            </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
