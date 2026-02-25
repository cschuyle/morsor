import { useMemo, useState, useEffect, useRef } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
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
      .then((data) => setMessage(data.status === 'UP' ? 'Backend is up' : `Backend: ${data.status}`))
      .catch(() => setMessage('Backend unreachable'))
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
    const withCounts = troves.map((t) => ({
      ...t,
      resultCount: hasResults
        ? searchResult.results.filter((r) => r.troveId === t.id).length
        : 0,
    }))
    if (!hasResults) {
      const all = [...withCounts].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      )
      return { withHits: [], noHits: all }
    }
    const withHitsList = withCounts
      .filter((t) => t.resultCount > 0)
      .sort((a, b) => b.resultCount - a.resultCount)
    const noHitsList = withCounts
      .filter((t) => t.resultCount === 0)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    return { withHits: withHitsList, noHits: noHitsList }
  }, [troves, searchResult])

  return (
    <>
      <div className="app-header">
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Morsor</h1>
      {message && <p className="backend-message" data-status={message === 'Backend is up' ? 'up' : 'down'}>{message}</p>}

      <div className="app-layout">
        <aside className="sidebar">
          <h2 className="sidebar-title">Troves</h2>
          <p className="sidebar-hint">Select none = search all</p>
          <div className="sidebar-actions">
            <button type="button" className="sidebar-link" onClick={selectAllTroves}>
              Select all
            </button>
            <span className="sidebar-sep">·</span>
            <button type="button" className="sidebar-link" onClick={clearTroves}>
              Clear
            </button>
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
            <h2>Search</h2>
            <form onSubmit={handleSearch}>
              <label>
                Query
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. Greek, Prince, Albanian — or * for all"
                />
              </label>
              <div className="search-submit-row">
                <button type="submit" disabled={searching}>
                  {searching ? 'Searching…' : 'Search'}
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
              const trovesWithResults = new Set(
                results.map((r) => r.troveId).filter(Boolean)
              ).size
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
                  </div>
                  {totalPages > 1 && (
                    <nav className="pagination" aria-label="Search results pages">
                      <button
                        type="button"
                        className="pagination-btn"
                        disabled={pageNum <= 0 || searching}
                        onClick={() => goToPage(pageNum - 1)}
                      >
                        Previous
                      </button>
                      <span className="pagination-info">
                        Page {pageNum + 1} of {totalPages}
                      </span>
                      <button
                        type="button"
                        className="pagination-btn"
                        disabled={pageNum >= totalPages - 1 || searching}
                        onClick={() => goToPage(pageNum + 1)}
                      >
                        Next
                      </button>
                    </nav>
                  )}
                  <SearchResultsGrid data={results} />
                </>
              )
            })()}
          </section>
        </main>
      </div>
    </>
  )
}

export default App
