import { useMemo, useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { SearchResultsGrid } from './SearchResultsGrid'
import { getApiAuthHeaders } from './apiAuth'
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
  const [showFilter, setShowFilter] = useState('all')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sortBy, setSortBy] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const queryRef = useRef(query)
  const skipCheckboxSearchRef = useRef(true)
  const abortControllerRef = useRef(null)
  const PAGE_SIZE_OPTIONS = [10, 25, 100, 500, 1000, 5000, 10000]
  queryRef.current = query

  function fetchSearch(pageNum, sizeOverride = null, troveIdsOverride = null, sortByOverride = null, sortDirOverride = null) {
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
    const troveIds = troveIdsOverride ?? selectedTroveIds
    const nextSortBy = sortByOverride !== undefined && sortByOverride !== null ? sortByOverride : sortBy
    const nextSortDir = sortDirOverride !== undefined && sortDirOverride !== null ? sortDirOverride : sortDir
    const params = new URLSearchParams({
      query: q.trim(),
      page: String(pageNum),
      size: String(size),
    })
    troveIds.forEach((id) => params.append('trove', id))
    if (sortByOverride !== undefined || sortDirOverride !== undefined) {
      setSortBy(nextSortBy || null)
      setSortDir(nextSortDir)
    }
    if (nextSortBy) {
      params.set('sortBy', nextSortBy)
      params.set('sortDir', nextSortDir)
    }
    fetch(`/api/search?${params}`, { credentials: 'include', headers: { ...getApiAuthHeaders() }, signal: controller.signal })
      .then((res) => {
        if (res.status === 401) { window.location.href = '/login'; return Promise.reject() }
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
    fetch('/actuator/health', { credentials: 'include', headers: { ...getApiAuthHeaders() } })
      .then((res) => { if (res.status === 401) { window.location.href = '/login'; return }; return res.json() })
      .then((data) => data && setMessage(data.status === 'UP' ? 'Status: Backend is up' : `Status: Backend: ${data.status}`))
      .catch(() => setMessage('Status: Backend unreachable'))
  }, [])

  useEffect(() => {
    fetch('/api/troves', { credentials: 'include', headers: { ...getApiAuthHeaders() } })
      .then((res) => {
        if (res.status === 401) { window.location.href = '/login'; return null }
        return res.ok ? res.json() : Promise.resolve([])
      })
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

  function selectOnlyTrove(id) {
    setSelectedTroveIds(new Set([id]))
  }

  function handleOnlyClick(troveId) {
    selectOnlyTrove(troveId)
    if (!query.trim()) {
      queryRef.current = '*'
      setQuery('*')
      fetchSearch(0, null, new Set([troveId]))
    }
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

  function handleGridSortChange(newSortBy, newSortDir) {
    const pageNum = searchResult != null && typeof searchResult.page === 'number' ? searchResult.page : 0
    fetchSearch(pageNum, null, null, newSortBy, newSortDir)
  }

  const { selected: selectedTroves, notSelected: notSelectedTroves } = useMemo(() => {
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
    const filterLower = troveFilter.trim().toLowerCase()
    const textMatches = (t) =>
      !filterLower ||
      (t.name && t.name.toLowerCase().includes(filterLower)) ||
      (t.id && t.id.toLowerCase().includes(filterLower))
    let filtered = withCounts.filter(textMatches)
    if (showFilter === 'selected') {
      filtered = filtered.filter((t) => selectedTroveIds.has(t.id))
    } else if (showFilter === 'notSelected') {
      filtered = filtered.filter((t) => !selectedTroveIds.has(t.id))
    }
    const sortByName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    const selected = filtered.filter((t) => selectedTroveIds.has(t.id)).sort(sortByName)
    const notSelected = filtered.filter((t) => !selectedTroveIds.has(t.id)).sort(sortByName)
    return { selected, notSelected }
  }, [troves, searchResult, troveFilter, showFilter, selectedTroveIds])

  return (
    <>
      <h1 className="app-title">
        <span className="search-title-brand">Morsor</span> <span className="sidebar-title-note">More lists than you needed</span>
      </h1>
      <div className="app-layout">
        <div className={`sidebar-wrapper ${sidebarOpen ? 'sidebar-wrapper--open' : ''}`}>
          <aside className="sidebar">
            <h2 className="sidebar-title">Troves <span className="sidebar-title-note">(<button type="button" className="sidebar-title-link" onClick={clearTroves}>clear selections</button> to search all)</span></h2>
          <p className="sidebar-selection-message" aria-live="polite">
            {selectedTroveIds.size === 0
              ? 'All troves will be searched'
              : `${selectedTroveIds.size} of ${troves.length} troves selected`}
          </p>
          <div className="sidebar-show-wrap">
            <label className="sidebar-show-label">
              Show
              <select
                value={showFilter}
                onChange={(e) => setShowFilter(e.target.value)}
                className="sidebar-show-select"
                aria-label="Show troves: all, selected, or not selected"
              >
                <option value="all">All</option>
                <option value="selected">Selected</option>
                <option value="notSelected">Not Selected</option>
              </select>
            </label>
          </div>
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
                title="Clear filter"
                onClick={() => setTroveFilter('')}
                aria-label="Clear trove filter"
              >
                ×
              </button>
            </span>
          </div>
          <ul className="trove-list">
            {selectedTroves.map((t) => (
              <li
                key={t.id}
                className={`trove-item ${searchResult != null && t.resultCount > 0 ? 'trove-item--has-results' : ''}`}
              >
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
                {(selectedTroveIds.size !== 1 || !selectedTroveIds.has(t.id)) && (
                  <button
                    type="button"
                    className="trove-only-link"
                    onClick={(e) => { e.preventDefault(); handleOnlyClick(t.id) }}
                    aria-label={`Search only ${t.name}`}
                    title="Select only this trove"
                  >
                    only
                  </button>
                )}
              </li>
            ))}
            {selectedTroves.length > 0 && notSelectedTroves.length > 0 && (
              <li className="trove-list-separator" aria-hidden="true">
                <hr className="sidebar-separator" />
              </li>
            )}
            {notSelectedTroves.map((t) => (
              <li
                key={t.id}
                className={`trove-item ${searchResult != null && t.resultCount > 0 ? 'trove-item--has-results' : ''}`}
              >
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
                {(selectedTroveIds.size !== 1 || !selectedTroveIds.has(t.id)) && (
                  <button
                    type="button"
                    className="trove-only-link"
                    onClick={(e) => { e.preventDefault(); handleOnlyClick(t.id) }}
                    aria-label={`Search only ${t.name}`}
                    title="Select only this trove"
                  >
                    only
                  </button>
                )}
              </li>
            ))}
          </ul>
          </aside>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? (
              <span aria-hidden="true">‹</span>
            ) : (
              <span aria-hidden="true">›</span>
            )}
          </button>
        </div>
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
                    <SearchResultsGrid
                      data={results}
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSortChange={handleGridSortChange}
                    />
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
                  <SearchResultsGrid
                    data={results}
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSortChange={handleGridSortChange}
                  />
                </>
              )
            })()}
          </section>
        </main>
      </div>
      <hr className="backend-status-divider" />
      <footer className="app-footer">
        <Link to="/about" className="app-footer-link">About</Link>
        <Link to="/mobile" className="app-footer-link">Mobile</Link>
        {message && <p className="backend-message" data-status={message === 'Status: Backend is up' ? 'up' : 'down'}>{message}</p>}
      </footer>
    </>
  )
}

export default App
