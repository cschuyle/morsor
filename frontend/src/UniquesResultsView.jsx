/**
 * Renders "find uniques" results: items in primary trove that have no match in compare troves.
 * Each result has item (SearchResult) and score (nearest-miss uniqueness score).
 * sortBy / sortDir / onSortChange: optional column sort (title, trove, score).
 */
export function UniquesResultsView({ results = [], sortBy = null, sortDir = 'asc', onSortChange }) {
  const handleSort = (columnId) => {
    if (!onSortChange) return
    const nextDir = sortBy === columnId && sortDir === 'asc' ? 'desc' : 'asc'
    onSortChange(columnId, nextDir)
  }

  if (!results.length) {
    return (
      <p className="duplicate-results-empty">No unique items. Every primary item has a match in the compare troves.</p>
    )
  }
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
          </tr>
        </thead>
        <tbody>
          {results.map((row, idx) => {
            const item = row?.item ?? row
            const score = typeof row?.score === 'number' ? row.score : null
            return (
              <tr key={idx} className="duplicate-row-primary">
                <td className="col-title">{item?.title ?? '—'}</td>
                <td className="col-trove">{item?.trove ?? item?.troveId ?? ''}</td>
                <td className="col-score">{score != null ? score.toFixed(2) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
