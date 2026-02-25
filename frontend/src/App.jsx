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
  const queryRef = useRef(query)
  const skipCheckboxSearchRef = useRef(true)
  queryRef.current = query

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
        setSearchResult({ count: 0, results: [] })
        return
      }
      setSearching(true)
      setSearchError(null)
      const params = new URLSearchParams({ query: q.trim() })
      selectedTroveIds.forEach((id) => params.append('trove', id))
      fetch(`/api/search?${params}`)
        .then((res) => {
          if (!res.ok) throw new Error(res.statusText)
          return res.json()
        })
        .then(setSearchResult)
        .catch((err) => setSearchError(err.message))
        .finally(() => setSearching(false))
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

  function handleSearch(e) {
    e?.preventDefault()
    if (!query.trim()) {
      setSearchResult({ count: 0, results: [] })
      return
    }
    setSearching(true)
    setSearchError(null)
    setSearchResult(null)
    const params = new URLSearchParams({ query: query.trim() })
    selectedTroveIds.forEach((id) => params.append('trove', id))
    fetch(`/api/search?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText)
        return res.json()
      })
      .then(setSearchResult)
      .catch((err) => setSearchError(err.message))
      .finally(() => setSearching(false))
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
              <button type="submit" disabled={searching}>
                {searching ? 'Searching…' : 'Search'}
              </button>
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
              const count = typeof searchResult.count === 'number' ? searchResult.count : results.length
              const trovesWithResults = new Set(
                results.map((r) => r.troveId).filter(Boolean)
              ).size
              const trovesInScope =
                selectedTroveIds.size > 0 ? selectedTroveIds.size : troves.length
              const scopeLabel =
                selectedTroveIds.size > 0 ? 'selected troves' : 'troves'
              return (
                <>
                  <p className="search-count search-count-detail">
                    {count} result{count !== 1 ? 's' : ''} in {trovesWithResults} out of {trovesInScope} {scopeLabel}.
                  </p>
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
