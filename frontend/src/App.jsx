import { useMemo, useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { SearchResultsGrid } from './SearchResultsGrid'
import './App.css'

function App() {
  const [message, setMessage] = useState('')
  const [troves, setTroves] = useState([])
  const [selectedTroveIds, setSelectedTroveIds] = useState(() => new Set())
  const [query, setQuery] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searchError, setSearchError] = useState(null)
  const [searching, setSearching] = useState(false)
  const [pageSize, setPageSize] = useState(500)
  const [troveFilter, setTroveFilter] = useState('')
  const queryRef = useRef(query)
  const skipCheckboxSearchRef = useRef(true)
  const abortControllerRef = useRef(null)
  const PAGE_SIZE_OPTIONS = [10, 25, 100, 500, 1000, 5000, 10000]
  queryRef.current = query

  function fetchSearch(pageNum, sizeOverride = null) {
    const size = sizeOverride ?? pageSize
    const q = queryRef.current
    if (!q.trim()) {
      setSearchResult({ count: 0, results: [], page: 0, size })
      return
    }
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    setSearching(true)
    setSearchError(null)
    const params = new URLSearchParams({
      query: q.trim(),
      page: String(pageNum),
      size: String(size),
    })
    selectedTroveIds.forEach((id) => params.append('trove', id))
    fetch(`/api/search?${params}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText)
        return res.json()
      })
      .then(setSearchResult)
      .catch((err) => {
        if (err.name !== 'AbortError') setSearchError(err.message)
      })
      .finally(() => setSearching(false))
  }

  useEffect(() => {
    fetch('/actuator/health')
      .then((res) => res.json())
      .then((data) => setMessage(data.status === 'UP' ? 'Status: Backend is up' : `Status: Backend: ${data.status}`))
      .catch(() => setMessage('Status: Backend unreachable'))
  }, [])

  useEffect(() => {
    fetch('/api/troves')
      .then((res) => (res.ok ? res.json() : Promise.resolve([])))
      .then((data) => Array.isArray(data) ? data : [])
      .then(setTroves)
      .catch(() => setTroves([]))
  }, [])

  useEffect(() => {
    if (skipCheckboxSearchRef.current) {
      skipCheckboxSearchRef.current = false
      return
    }
    const t = setTimeout(() => {
      const q = queryRef.current
      if (!q.trim()) {
        setSearchResult({ count: 0, results: [], page: 0, size: pageSize })
        return
      }
      fetchSearch(0)
    }, 400)
    return () => clearTimeout(t)
  }, [selectedTroveIds])

  function toggleTrove(id) {
    setSelectedTroveIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllTroves() {
    setSelectedTroveIds(new Set(troves.map((t) => t.id)))
  }

  function clearTroves() {
    setSelectedTroveIds(new Set())
  }

  function cancelSearch() {
    abortControllerRef.current?.abort()
  }

  function handleSearch(e) {
    e?.preventDefault()
    if (!query.trim()) {
      setSearchResult({ count: 0, results: [], page: 0, size: pageSize })
      return
    }
    fetchSearch(0)
  }

  function handlePageSizeChange(e) {
    const newSize = Number(e.target.value)
    setPageSize(newSize)
    if (searchResult != null && query.trim()) fetchSearch(0, newSize)
  }

  function goToPage(nextPage) {
    fetchSearch(nextPage)
  }

  const { withHits, noHits } = useMemo(() => {
    const hasResults = searchResult?.results != null && Array.isArray(searchResult.results)
    const troveCounts = searchResult?.troveCounts != null && typeof searchResult.troveCounts === 'object'
      ? searchResult.troveCounts
      : null
    const withCounts = troves.map((t) => ({
      ...t,
      resultCount: hasResults
        ? (troveCounts != null ? (troveCounts[t.id] ?? 0) : searchResult.results.filter((r) => r.troveId === t.id).length)
        : 0,
    }))
    if (!hasResults) {
      let all = [...withCounts].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      )
      const filterLower = troveFilter.trim().toLowerCase()
      if (filterLower) {
        const matches = (t) =>
          (t.name && t.name.toLowerCase().includes(filterLower)) ||
          (t.id && t.id.toLowerCase().includes(filterLower))
        all = all.filter(matches)
      }
      return { withHits: [], noHits: all }
    }
    let withHitsList = withCounts
      .filter((t) => t.resultCount > 0)
      .sort((a, b) => b.resultCount - a.resultCount)
    let noHitsList = withCounts
      .filter((t) => t.resultCount === 0)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    const filterLower = troveFilter.trim().toLowerCase()
    if (filterLower) {
      const matches = (t) =>
        (t.name && t.name.toLowerCase().includes(filterLower)) ||
        (t.id && t.id.toLowerCase().includes(filterLower))
      withHitsList = withHitsList.filter(matches)
      noHitsList = noHitsList.filter(matches)
    }
    return { withHits: withHitsList, noHits: noHitsList }
  }, [troves, searchResult, troveFilter])

  return (
    <>
      <h1 className="app-title">
        <span className="search-title-brand">Morsor</span> <span className="sidebar-title-note">More lists than you needed</span>
      </h1>
      <div className="app-layout">
        <aside className="sidebar">
          <h2 className="sidebar-title">Troves <span className="sidebar-title-note">(Select none = search all)</span></h2>
          <div className="sidebar-trove-filter-wrap">
            <input
              type="text"
              value={troveFilter}
              onChange={(e) => setTroveFilter(e.target.value)}
              placeholder="Filter troves…"
              className="sidebar-trove-filter-input"
              aria-label="Filter troves by name"
            />
            <span className="search-query-actions">
              <button
                type="button"
                className="search-query-btn"
                title="Clear"
                onClick={() => {
                  clearTroves()
                  setTroveFilter('')
                }}
                aria-label="Clear selection and filter"
              >
                ×
              </button>
            </span>
          </div>
          <ul className="trove-list">
            {withHits.map((t) => (
              <li key={t.id} className="trove-item trove-item--has-results">
                <label className="trove-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedTroveIds.has(t.id)}
                    onChange={() => toggleTrove(t.id)}
                  />
                  <span className="trove-name">
                    {t.name} ({searchResult != null ? `${t.resultCount}/${t.count}` : t.count})
                  </span>
                </label>
              </li>
            ))}
            {withHits.length > 0 && noHits.length > 0 && (
              <li className="trove-list-separator" aria-hidden="true">
                <hr className="sidebar-separator" />
              </li>
            )}
            {noHits.map((t) => (
              <li key={t.id} className="trove-item">
                <label className="trove-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedTroveIds.has(t.id)}
                    onChange={() => toggleTrove(t.id)}
                  />
                  <span className="trove-name">
                    {t.name} ({searchResult != null ? `${t.resultCount}/${t.count}` : t.count})
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </aside>
        <main className="main">
          <section className="card search-section">
            <h2 className="search-section-title">Query Console</h2>
            <form onSubmit={handleSearch} className="search-form">
              <div className="search-form-row">
                <div className="search-query-wrap">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g. Greek, Prince, Albanian — or * for all"
                    className="search-query-input"
                    aria-label="Query"
                  />
                  <span className="search-query-actions">
                    <button
                      type="button"
                      className="search-query-btn"
                      title="Search all (*)"
                      onClick={() => {
                        setQuery('*')
                        queryRef.current = '*'
                        fetchSearch(0)
                      }}
                    >
                      *
                    </button>
                    <button
                      type="button"
                      className="search-query-btn"
                      title="Clear"
                      onClick={() => {
                        setQuery('')
                        setSearchResult({ count: 0, results: [], page: 0, size: pageSize })
                      }}
                    >
                      ×
                    </button>
                  </span>
                </div>
                <button type="submit" disabled={searching} className="search-submit-btn" aria-label="Search" title="Search">
                  {searching ? 'Searching…' : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
                  )}
                </button>
                {searching && (
                  <>
                    <span className="search-spinner" aria-hidden="true" />
                    <button type="button" className="search-cancel" onClick={cancelSearch}>
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </form>
            {searchError && <p className="search-error">{searchError}</p>}
            {searchResult != null && (() => {
              const results = Array.isArray(searchResult.results) ? searchResult.results : []
              const hasQuery = query.trim() !== ''
              if (!hasQuery) {
                return (
                  <>
                    <p className="search-count search-count-detail">
                      Enter a query to search. Optionally, select troves.
                    </p>
                    <SearchResultsGrid data={results} />
                  </>
                )
              }
              const count = typeof searchResult.count === 'number' ? searchResult.count : 0
              const pageNum = typeof searchResult.page === 'number' ? searchResult.page : 0
              const size = typeof searchResult.size === 'number' ? searchResult.size : pageSize
              const totalPages = size > 0 ? Math.ceil(count / size) : 0
              const troveCounts = searchResult.troveCounts != null && typeof searchResult.troveCounts === 'object'
                ? searchResult.troveCounts
                : null
              const trovesWithResults =
                troveCounts != null
                  ? Object.keys(troveCounts).length
                  : new Set(results.map((r) => r.troveId).filter(Boolean)).size
              const trovesInScope =
                selectedTroveIds.size > 0 ? selectedTroveIds.size : troves.length
              const scopeLabel =
                selectedTroveIds.size > 0 ? 'selected troves' : 'troves'
              const from = count === 0 ? 0 : pageNum * size + 1
              const to = Math.min((pageNum + 1) * size, count)
              return (
                <>
                  <p className="search-count search-count-detail">
                    {count} result{count !== 1 ? 's' : ''} in {trovesWithResults} out of {trovesInScope} {scopeLabel}.
                    {totalPages > 1 && ` Showing ${from}–${to}.`}
                  </p>
                  <div className="search-results-options">
                    <label className="page-size-label">
                      Page size
                      <select
                        value={pageSize}
                        onChange={handlePageSizeChange}
                        className="page-size-select"
                        disabled={searching}
                      >
                        {PAGE_SIZE_OPTIONS.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    {totalPages > 1 && (() => {
                      const maxShow = 5
                      let start = Math.max(0, pageNum - Math.floor(maxShow / 2))
                      let end = Math.min(totalPages, start + maxShow)
                      if (end - start < maxShow) start = Math.max(0, end - maxShow)
                      const pageNumbers = []
                      for (let i = start; i < end; i++) pageNumbers.push(i)
                      return (
                        <nav className="pagination" aria-label="Search results pages">
                          <span className="pagination-info">
                            Page {pageNum + 1} of {totalPages}
                          </span>
                          <button
                            type="button"
                            className="pagination-btn"
                            disabled={pageNum <= 0 || searching}
                            onClick={() => goToPage(pageNum - 1)}
                            aria-label="Previous page"
                          >
                            ←
                          </button>
                          <span className="pagination-nums">
                            {start > 0 && (
                              <>
                                <button
                                  type="button"
                                  className={`pagination-btn pagination-num ${0 === pageNum ? 'pagination-num--current' : ''}`}
                                  disabled={searching}
                                  onClick={() => goToPage(0)}
                                  aria-label="Page 1"
                                  aria-current={0 === pageNum ? 'page' : undefined}
                                >
                                  1
                                </button>
                                <span className="pagination-ellipsis" aria-hidden="true">…</span>
                              </>
                            )}
                            {pageNumbers.map((i) => (
                              <button
                                key={i}
                                type="button"
                                className={`pagination-btn pagination-num ${i === pageNum ? 'pagination-num--current' : ''}`}
                                disabled={searching}
                                onClick={() => goToPage(i)}
                                aria-label={`Page ${i + 1}`}
                                aria-current={i === pageNum ? 'page' : undefined}
                              >
                                {i + 1}
                              </button>
                            ))}
                            {end < totalPages && (
                              <>
                                <span className="pagination-ellipsis" aria-hidden="true">…</span>
                                <button
                                  type="button"
                                  className={`pagination-btn pagination-num ${totalPages - 1 === pageNum ? 'pagination-num--current' : ''}`}
                                  disabled={searching}
                                  onClick={() => goToPage(totalPages - 1)}
                                  aria-label={`Page ${totalPages}`}
                                  aria-current={totalPages - 1 === pageNum ? 'page' : undefined}
                                >
                                  {totalPages}
                                </button>
                              </>
                            )}
                          </span>
                          <button
                            type="button"
                            className="pagination-btn"
                            disabled={pageNum >= totalPages - 1 || searching}
                            onClick={() => goToPage(pageNum + 1)}
                            aria-label="Next page"
                          >
                            →
                          </button>
                        </nav>
                      )
                    })()}
                  </div>
                  <SearchResultsGrid data={results} />
                </>
              )
            })()}
          </section>
        </main>
      </div>
      <hr className="backend-status-divider" />
      <footer className="app-footer">
        <Link to="/about" className="app-footer-link">About</Link>
        {message && <p className="backend-message" data-status={message === 'Status: Backend is up' ? 'up' : 'down'}>{message}</p>}
      </footer>
    </>
  )
}

export default App
