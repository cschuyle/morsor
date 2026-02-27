import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { getApiAuthHeaders } from './apiAuth'
import './MobileApp.css'

const MOBILE_PAGE_SIZE = 25

function MobileApp() {
  const [troves, setTroves] = useState([])
  const [selectedTroveIds, setSelectedTroveIds] = useState(() => new Set())
  const [query, setQuery] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searching, setSearching] = useState(false)
  const [page, setPage] = useState(0)
  const [showTrovePicker, setShowTrovePicker] = useState(false)
  const queryRef = useRef(query)
  const skipSearchRef = useRef(true)
  queryRef.current = query

  function fetchSearch(pageNum) {
    const q = queryRef.current.trim()
    if (!q) {
      setSearchResult({ count: 0, results: [], page: 0, size: MOBILE_PAGE_SIZE })
      return
    }
    setSearching(true)
    const params = new URLSearchParams({
      query: q,
      page: String(pageNum),
      size: String(MOBILE_PAGE_SIZE),
    })
    selectedTroveIds.forEach((id) => params.append('trove', id))
    fetch(`/api/search?${params}`, { credentials: 'include', headers: { ...getApiAuthHeaders() } })
      .then((res) => {
        if (res.status === 401) { window.location.href = '/login'; return Promise.reject() }
        return res.ok ? res.json() : Promise.reject(new Error(res.statusText))
      })
      .then(setSearchResult)
      .catch(() => setSearchResult({ count: 0, results: [], page: 0, size: MOBILE_PAGE_SIZE }))
      .finally(() => setSearching(false))
  }

  useEffect(() => {
    fetch('/api/troves', { credentials: 'include', headers: { ...getApiAuthHeaders() } })
      .then((res) => {
        if (res.status === 401) { window.location.href = '/login'; return null }
        return res.ok ? res.json() : Promise.resolve([])
      })
      .then((data) => (Array.isArray(data) ? data : []))
      .then(setTroves)
      .catch(() => setTroves([]))
  }, [])

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false
      return
    }
    const t = setTimeout(() => fetchSearch(0), 300)
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

  function clearTroves() {
    setSelectedTroveIds(new Set())
  }

  function handleOnlyClick(troveId) {
    if (!query.trim()) {
      queryRef.current = '*'
      setQuery('*')
    }
    setSelectedTroveIds(new Set([troveId]))
    setPage(0)
    setShowTrovePicker(false)
  }

  function handleSearch(e) {
    e?.preventDefault()
    if (!query.trim()) return
    fetchSearch(0)
    setPage(0)
  }

  function goToPage(nextPage) {
    fetchSearch(nextPage)
    setPage(nextPage)
  }

  const results = searchResult?.results ?? []
  const count = searchResult?.count ?? 0
  const totalPages = Math.ceil(count / MOBILE_PAGE_SIZE) || 0
  const troveLabel = selectedTroveIds.size === 0 ? 'All troves' : `${selectedTroveIds.size} trove${selectedTroveIds.size !== 1 ? 's' : ''}`

  return (
    <div className="mobile-app">
      <header className="mobile-header">
        <Link to="/mobile" className="mobile-brand">Morsor</Link>
        <Link to="/mobile/about" className="mobile-nav-link">About</Link>
      </header>

      <main className="mobile-main">
        <form onSubmit={handleSearch} className="mobile-search-form">
          <div className="mobile-search-query-wrap">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. Greek, Prince, Albanian — or * for all"
              className="mobile-search-input"
              autoCapitalize="off"
              autoCorrect="off"
              aria-label="Query"
            />
            <span className="mobile-search-query-actions">
              <button
                type="button"
                className="mobile-search-query-btn"
                title="Search all (*)"
                onClick={() => {
                  setQuery('*')
                  queryRef.current = '*'
                  setPage(0)
                  fetchSearch(0)
                }}
              >
                *
              </button>
              <button
                type="button"
                className="mobile-search-query-btn"
                title="Clear"
                onClick={() => {
                  setQuery('')
                  setSearchResult({ count: 0, results: [], page: 0, size: MOBILE_PAGE_SIZE })
                }}
              >
                ×
              </button>
            </span>
          </div>
          <button type="submit" className="mobile-search-btn" disabled={searching} aria-label="Search">
            {searching ? '…' : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            )}
          </button>
        </form>

        <div className="mobile-troves-row">
          <span className="mobile-troves-label">
            {searchResult != null && count > 0 && (
              <>{count} item{count !== 1 ? 's' : ''} · </>
            )}
            {troveLabel}
          </span>
          {searchResult != null && totalPages > 1 && (
            <nav className="mobile-pagination" aria-label="Pages">
              <button
                type="button"
                className="mobile-page-btn"
                disabled={page <= 0 || searching}
                onClick={() => goToPage(page - 1)}
                aria-label="Previous page"
              >
                ‹
              </button>
              <span className="mobile-page-info">
                {page + 1} / {totalPages}
              </span>
              <button
                type="button"
                className="mobile-page-btn"
                disabled={page >= totalPages - 1 || searching}
                onClick={() => goToPage(page + 1)}
                aria-label="Next page"
              >
                ›
              </button>
            </nav>
          )}
          <button
            type="button"
            className="mobile-troves-btn"
            onClick={() => setShowTrovePicker((v) => !v)}
            aria-expanded={showTrovePicker}
          >
            Troves?
          </button>
        </div>

        {showTrovePicker && (
          <div className="mobile-trove-picker">
            <div className="mobile-trove-picker-header">
              <span>Select troves</span>
              <button type="button" onClick={() => setShowTrovePicker(false)} className="mobile-trove-picker-done">
                Done
              </button>
            </div>
            <button type="button" onClick={clearTroves} className="mobile-trove-clear">Clear all</button>
            <ul className="mobile-trove-list">
              {troves.map((t) => (
                <li key={t.id} className="mobile-trove-item">
                  <label className="mobile-trove-label">
                    <input
                      type="checkbox"
                      checked={selectedTroveIds.has(t.id)}
                      onChange={() => toggleTrove(t.id)}
                    />
                    <span>{t.name}</span>
                  </label>
                  <button
                    type="button"
                    className="mobile-trove-only-link"
                    onClick={(e) => { e.preventDefault(); handleOnlyClick(t.id) }}
                    aria-label={`Search only ${t.name}`}
                    title="Select only this trove"
                  >
                    only
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {searchResult != null && (
          <>
            {results.length === 0 && query.trim() && !searching && (
              <p className="mobile-no-results">No items.</p>
            )}
            <ul className="mobile-result-list">
              {results.map((r) => (
                <li key={r.id} className="mobile-result-card">
                  <span className="mobile-result-title">{r.title || '—'}</span>
                  {selectedTroveIds.size !== 1 && (
                    <span className="mobile-result-trove">{r.trove || r.troveId || ''}</span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </main>

      <footer className="mobile-footer">
        <Link to="/" className="mobile-footer-link">Desktop site</Link>
      </footer>
    </div>
  )
}

export default MobileApp
