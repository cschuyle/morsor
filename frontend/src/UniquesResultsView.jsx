/**
 * Renders "find uniques" results: items in primary trove that have no match in compare troves.
 * Simple table of primary items (same row style as duplicate primary rows).
 */
export function UniquesResultsView({ results = [] }) {
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
            <th className="col-title">Title</th>
            <th className="col-trove">Trove</th>
          </tr>
        </thead>
        <tbody>
          {results.map((row, idx) => (
            <tr key={idx} className="duplicate-row-primary">
              <td className="col-title">{row?.title ?? '—'}</td>
              <td className="col-trove">{row?.trove ?? row?.troveId ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
