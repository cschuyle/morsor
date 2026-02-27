import { useMemo, useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { SearchResultsGrid } from './SearchResultsGrid'
import { DuplicateResultsView } from './DuplicateResultsView'
import { getApiAuthHeaders } from './apiAuth'
import { getCsrfToken } from './getCsrfToken'
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
  const [searchMode, setSearchMode] = useState('search')
  const [primaryTroveId, setPrimaryTroveId] = useState('')
  const [primaryTroveFilter, setPrimaryTroveFilter] = useState('')
  const [duplicatesTroveTab, setDuplicatesTroveTab] = useState('primary')
  const [duplicatesResult, setDuplicatesResult] = useState(null)
  const [duplicatesPage, setDuplicatesPage] = useState(0)
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
    if (searchMode !== 'search') return
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
  }, [searchMode, selectedTroveIds])

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

  function fetchDuplicates(pageNum) {
    const q = queryRef.current.trim() || '*'
    if (!primaryTroveId.trim()) {
      setDuplicatesResult({ total: 0, page: 0, size: 50, rows: [] })
      return
    }
    if (selectedTroveIds.size === 0) {
      setDuplicatesResult({ total: 0, page: 0, size: 50, rows: [] })
      return
    }
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    setSearching(true)
    setSearchError(null)
    const params = new URLSearchParams({
      primaryTrove: primaryTroveId.trim(),
      query: q,
      page: String(pageNum),
      size: '50',
      maxMatches: '20',
    })
    selectedTroveIds.forEach((id) => params.append('compareTrove', id))
    fetch(`/api/search/duplicates?${params}`, { credentials: 'include', headers: { ...getApiAuthHeaders() }, signal: controller.signal })
      .then((res) => {
        if (res.status === 401) { window.location.href = '/login'; return Promise.reject() }
        if (!res.ok) throw new Error(res.statusText)
        return res.json()
      })
      .then((data) => {
        setDuplicatesResult(data)
        setDuplicatesPage(pageNum)
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setSearchError(err.message)
      })
      .finally(() => setSearching(false))
  }

  function handleSearch(e) {
    e?.preventDefault()
    if (searchMode === 'duplicates') {
      if (!primaryTroveId.trim()) return
      if (selectedTroveIds.size === 0) return
      if (primaryTroveId && selectedTroveIds.has(primaryTroveId)) {
        setSearchError('Primary trove cannot be in compare list. Remove it from compare troves.')
        return
      }
      setSearchError(null)
      setSearchResult(null)
      fetchDuplicates(0)
      return
    }
    if (!query.trim()) {
      setSearchResult({ count: 0, results: [], page: 0, size: pageSize })
      return
    }
    setSearchError(null)
    setDuplicatesResult(null)
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

  const primaryTrovesFiltered = useMemo(() => {
    const q = primaryTroveFilter.trim().toLowerCase()
    if (!q) return troves
    return troves.filter(
      (t) =>
        (t.name && t.name.toLowerCase().includes(q)) ||
        (t.id && t.id.toLowerCase().includes(q))
    )
  }, [troves, primaryTroveFilter])

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
            <div className="trove-picker-panel">
              {searchMode === 'duplicates' ? (
                <>
                  <div className="trove-picker-tabs" role="tablist" aria-label="Trove selection">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={duplicatesTroveTab === 'primary'}
                      className={`trove-picker-tab ${duplicatesTroveTab === 'primary' ? 'trove-picker-tab--active' : ''}`}
                      onClick={() => setDuplicatesTroveTab('primary')}
                    >
                      Primary
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={duplicatesTroveTab === 'compare'}
                      className={`trove-picker-tab ${duplicatesTroveTab === 'compare' ? 'trove-picker-tab--active' : ''}`}
                      onClick={() => setDuplicatesTroveTab('compare')}
                    >
                      Compare
                    </button>
                  </div>
                  {duplicatesTroveTab === 'primary' && (
                    <div className="primary-trove-select-wrap" role="tabpanel">
                      <label htmlFor="primary-trove-filter">Filter by name</label>
                      <input
                        id="primary-trove-filter"
                        type="text"
                        value={primaryTroveFilter}
                        onChange={(e) => setPrimaryTroveFilter(e.target.value)}
                        placeholder="Filter by name…"
                        className="sidebar-trove-filter-input primary-trove-filter-input"
                        aria-label="Filter primary troves by name"
                      />
                      <ul className="primary-trove-list" aria-label="Primary trove options">
                        {primaryTrovesFiltered.map((t) => (
                          <li key={t.id}>
                            <button
                              type="button"
                              className={`primary-trove-option ${primaryTroveId === t.id ? 'primary-trove-option--selected' : ''}`}
                              onClick={() => setPrimaryTroveId(t.id)}
                              aria-pressed={primaryTroveId === t.id}
                            >
                              {t.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {duplicatesTroveTab === 'compare' && (
                    <div role="tabpanel">
                      <p className="trove-picker-summary" aria-live="polite">
                        {selectedTroveIds.size === 0
                          ? 'Select at least one compare trove'
                          : `${selectedTroveIds.size} selected`}
                      </p>
                      <div className="trove-picker-actions">
                        <button
                          type="button"
                          className="trove-picker-clear"
                          onClick={clearTroves}
                          aria-label="Clear selection"
                        >
                          Clear
                        </button>
                      </div>
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
                          placeholder="Filter compare troves…"
                          className="sidebar-trove-filter-input"
                          aria-label="Filter compare troves by name"
                        />
                        <span className="search-query-actions">
                          <button
                            type="button"
                            className="search-query-btn"
                            title="Clear filter"
                            onClick={() => setTroveFilter('')}
                            aria-label="Clear filter"
                          >
                            ×
                          </button>
                        </span>
                      </div>
                      <ul className="trove-list">
                        {selectedTroves.map((t) => (
                          <li
                            key={t.id}
                            className={`trove-item trove-item--selected ${searchResult != null && t.resultCount > 0 ? 'trove-item--has-results' : ''}`}
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
                            className={`trove-item ${selectedTroveIds.has(t.id) ? 'trove-item--selected' : ''} ${searchResult != null && t.resultCount > 0 ? 'trove-item--has-results' : ''}`}
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
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h2 className="trove-picker-heading">Troves</h2>
                  <p className="trove-picker-summary" aria-live="polite">
                    {selectedTroveIds.size === 0
                      ? 'All troves will be searched'
                      : `${selectedTroveIds.size} of ${troves.length} selected`}
                  </p>
                  <div className="trove-picker-actions">
                    <button
                      type="button"
                      className="trove-picker-clear"
                      onClick={clearTroves}
                      aria-label="Clear selection"
                    >
                      Clear
                    </button>
                  </div>
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
              placeholder={searchMode === 'duplicates' ? 'Filter compare troves…' : 'Filter troves…'}
              className="sidebar-trove-filter-input"
              aria-label={searchMode === 'duplicates' ? 'Filter compare troves by name' : 'Filter troves by name'}
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
                className={`trove-item trove-item--selected ${searchResult != null && t.resultCount > 0 ? 'trove-item--has-results' : ''}`}
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
                className={`trove-item ${selectedTroveIds.has(t.id) ? 'trove-item--selected' : ''} ${searchResult != null && t.resultCount > 0 ? 'trove-item--has-results' : ''}`}
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
                </>
              )}
            </div>
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
            <div className="search-mode-toggle" role="tablist" aria-label="Search mode">
              <button
                type="button"
                role="tab"
                aria-selected={searchMode === 'search'}
                className={searchMode === 'search' ? 'active' : ''}
                onClick={() => { setSearchMode('search'); setDuplicatesResult(null) }}
              >
                Search
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={searchMode === 'duplicates'}
                className={searchMode === 'duplicates' ? 'active' : ''}
                onClick={() => { setSearchMode('duplicates'); setSearchResult(null) }}
              >
                Find duplicates
              </button>
            </div>
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
                  {searching ? 'Searching…' : 'Go!'}
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
            {searchMode === 'duplicates' && duplicatesResult == null && !searching && (
              <p className="search-count search-count-detail">
                Select <strong>primary trove</strong> and at least one <strong>compare trove</strong>. Use query <strong>*</strong> for all items, or type a filter.
              </p>
            )}
            {searchMode === 'duplicates' && searching && (
              <div className="duplicates-search-loading" aria-live="polite">
                <span className="search-spinner" aria-hidden="true" />
                <span>Finding duplicates…</span>
              </div>
            )}
            {searchMode === 'duplicates' && duplicatesResult != null && !searching && (() => {
              const total = duplicatesResult.total ?? 0
              const pageNum = duplicatesResult.page ?? 0
              const size = duplicatesResult.size ?? 50
              const rows = Array.isArray(duplicatesResult.rows) ? duplicatesResult.rows : []
              const totalPages = size > 0 ? Math.ceil(total / size) : 0
              return (
                <>
                  <p className="search-count search-count-detail">
                    {total} primary item{total !== 1 ? 's' : ''} with possible duplicates.
                    {totalPages > 1 && ` Page ${pageNum + 1} of ${totalPages}.`}
                  </p>
                  {totalPages > 1 && (
                    <nav className="pagination" aria-label="Duplicate results pages">
                      <button
                        type="button"
                        className="pagination-btn"
                        disabled={pageNum <= 0 || searching}
                        onClick={() => fetchDuplicates(pageNum - 1)}
                        aria-label="Previous page"
                      >
                        ←
                      </button>
                      <span className="pagination-info">
                        {pageNum + 1} / {totalPages}
                      </span>
                      <button
                        type="button"
                        className="pagination-btn"
                        disabled={pageNum >= totalPages - 1 || searching}
                        onClick={() => fetchDuplicates(pageNum + 1)}
                        aria-label="Next page"
                      >
                        →
                      </button>
                    </nav>
                  )}
                  <DuplicateResultsView rows={rows} />
                </>
              )
            })()}
            {searchMode === 'search' && searchResult != null && (() => {
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
                    {count} item{count !== 1 ? 's' : ''} in {trovesWithResults} out of {trovesInScope} {scopeLabel}.
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
        <button
          type="button"
          className="app-footer-link app-footer-logout-btn"
          onClick={() => {
            const token = getCsrfToken()
            const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
            if (token) headers['X-XSRF-TOKEN'] = token
            fetch('/logout', { method: 'POST', credentials: 'include', headers })
              .then(() => { window.location.href = '/login' })
              .catch(() => { window.location.href = '/login' })
          }}
        >
          Log Out
        </button>
        <Link to="/mobile" className="app-footer-link">Mobile</Link>
        {message && <p className="backend-message" data-status={message === 'Status: Backend is up' ? 'up' : 'down'}>{message}</p>}
      </footer>
    </>
  )
}

export default App
