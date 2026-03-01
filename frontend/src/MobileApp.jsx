import { useState, useEffect, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { getApiAuthHeaders } from './apiAuth'
import { getCsrfToken } from './getCsrfToken'
import { queryCache } from './queryCache'
import { formatCount, formatCacheBytes } from './formatCount'
import { SearchResultsGrid } from './SearchResultsGrid'
import { DuplicateResultsView } from './DuplicateResultsView'
import { UniquesResultsView } from './UniquesResultsView'
import './MobileApp.css'

const MOBILE_PAGE_SIZE = 25
const DUP_UNIQUES_PAGE_SIZE = 50

function MobileApp() {
  const [troves, setTroves] = useState([])
  const [searchMode, setSearchMode] = useState('search') // 'search' | 'duplicates' | 'uniques'
  const [selectedTroveIds, setSelectedTroveIds] = useState(() => new Set())
  const [primaryTroveId, setPrimaryTroveId] = useState('')
  const [compareTroveIds, setCompareTroveIds] = useState(() => new Set())
  const [trovePickerSubTab, setTrovePickerSubTab] = useState('primary') // 'primary' | 'compare' when dup/uniques
  const [query, setQuery] = useState('')
  const [searchResult, setSearchResult] = useState(null)
  const [searchSortBy, setSearchSortBy] = useState(null)
  const [searchSortDir, setSearchSortDir] = useState('asc')
  const [searching, setSearching] = useState(false)
  const [page, setPage] = useState(0)
  const [duplicatesResult, setDuplicatesResult] = useState(null)
  const [duplicatesSortBy, setDuplicatesSortBy] = useState(null)
  const [duplicatesSortDir, setDuplicatesSortDir] = useState('asc')
  const [duplicatesPage, setDuplicatesPage] = useState(0)
  const [uniquesResult, setUniquesResult] = useState(null)
  const [uniquesPage, setUniquesPage] = useState(0)
  const [uniquesSortBy, setUniquesSortBy] = useState(null)
  const [uniquesSortDir, setUniquesSortDir] = useState('asc')
  const [showTrovePicker, setShowTrovePicker] = useState(false)
  const [trovePickerFilter, setTrovePickerFilter] = useState('')
  const [searchError, setSearchError] = useState(null)
  const [statusMessage, setStatusMessage] = useState('')
  const queryRef = useRef(query)
  const skipSearchRef = useRef(true)
  const abortRef = useRef(null)
  queryRef.current = query

  const isDupOrUniques = searchMode === 'duplicates' || searchMode === 'uniques'

  function refreshStatusMessage() {
    fetch('/api/status', { credentials: 'include', headers: { ...getApiAuthHeaders() } })
      .then((res) => { if (res.status === 401) { window.location.href = '/login'; return }; return res.json() })
      .then((data) => {
        if (!data) return
        const base = data.status === 'UP' ? 'Status: Backend is up' : `Status: Backend: ${data.status}`
        const cache = data.cache
        const cacheMsg = cache != null && typeof cache.entries === 'number' && typeof cache.estimatedBytes === 'number'
          ? ` · Cache: ${formatCount(cache.entries)} entries, ~${formatCacheBytes(cache.estimatedBytes)}`
          : ''
        setStatusMessage(base + cacheMsg)
      })
      .catch(() => setStatusMessage('Status: Backend unreachable'))
  }

  function fetchSearch(pageNum, sortByOverride = null, sortDirOverride = null) {
    const q = queryRef.current.trim()
    if (!q) {
      setSearchResult({ count: 0, results: [], page: 0, size: MOBILE_PAGE_SIZE })
      return
    }
    const sortBy = sortByOverride ?? searchSortBy
    const sortDir = sortDirOverride ?? searchSortDir
    if (sortByOverride != null || sortDirOverride != null) {
      setSearchSortBy(sortBy || null)
      setSearchSortDir(sortDir)
    }
    const params = new URLSearchParams({
      query: q,
      page: String(pageNum),
      size: String(MOBILE_PAGE_SIZE),
    })
    selectedTroveIds.forEach((id) => params.append('trove', id))
    if (sortBy) {
      params.set('sortBy', sortBy)
      params.set('sortDir', sortDir)
    }
    const url = `/api/search?${params}`
    const cached = queryCache.get(url)
    if (cached) {
      setSearchResult(cached)
      return
    }
    setSearching(true)
    fetch(url, { credentials: 'include', headers: { ...getApiAuthHeaders() } })
      .then((res) => {
        if (res.status === 401) { window.location.href = '/login'; return Promise.reject() }
        return res.ok ? res.json() : Promise.reject(new Error(res.statusText))
      })
      .then((data) => {
        queryCache.set(url, data)
        setSearchResult(data)
        refreshStatusMessage()
      })
      .catch(() => setSearchResult({ count: 0, results: [], page: 0, size: MOBILE_PAGE_SIZE }))
      .finally(() => setSearching(false))
  }

  function fetchDuplicates(pageNum) {
    const q = queryRef.current.trim() || '*'
    if (!primaryTroveId.trim()) {
      setDuplicatesResult({ total: 0, page: 0, size: DUP_UNIQUES_PAGE_SIZE, rows: [] })
      return
    }
    if (compareTroveIds.size === 0) {
      setDuplicatesResult({ total: 0, page: 0, size: DUP_UNIQUES_PAGE_SIZE, rows: [] })
      return
    }
    const params = new URLSearchParams({
      primaryTrove: primaryTroveId.trim(),
      query: q,
      page: String(pageNum),
      size: String(DUP_UNIQUES_PAGE_SIZE),
      maxMatches: '20',
    })
    compareTroveIds.forEach((id) => params.append('compareTrove', id))
    const url = `/api/search/duplicates?${params}`
    const cached = queryCache.get(url)
    if (cached) {
      setDuplicatesResult(cached)
      setDuplicatesPage(pageNum)
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setSearching(true)
    setSearchError(null)
    fetch(url, { credentials: 'include', headers: { ...getApiAuthHeaders() }, signal: controller.signal })
      .then((res) => {
        if (res.status === 401) { window.location.href = '/login'; return Promise.reject() }
        return res.ok ? res.json() : Promise.reject(new Error(res.statusText))
      })
      .then((data) => {
        queryCache.set(url, data)
        setDuplicatesResult(data)
        setDuplicatesPage(pageNum)
        refreshStatusMessage()
      })
      .catch((err) => { if (err.name !== 'AbortError') setSearchError(err.message) })
      .finally(() => setSearching(false))
  }

  function fetchUniques(pageNum, sortByOverride = null, sortDirOverride = null) {
    const q = queryRef.current.trim() || '*'
    if (!primaryTroveId.trim()) {
      setUniquesResult({ total: 0, page: 0, size: DUP_UNIQUES_PAGE_SIZE, results: [] })
      return
    }
    if (compareTroveIds.size === 0) {
      setUniquesResult({ total: 0, page: 0, size: DUP_UNIQUES_PAGE_SIZE, results: [] })
      return
    }
    const sortBy = sortByOverride ?? uniquesSortBy
    const sortDir = sortDirOverride ?? uniquesSortDir
    if (sortByOverride != null || sortDirOverride != null) {
      setUniquesSortBy(sortBy || null)
      setUniquesSortDir(sortDir)
    }
    const params = new URLSearchParams({
      primaryTrove: primaryTroveId.trim(),
      query: q,
      page: String(pageNum),
      size: String(DUP_UNIQUES_PAGE_SIZE),
    })
    if (sortBy) {
      params.set('sortBy', sortBy)
      params.set('sortDir', sortDir)
    }
    compareTroveIds.forEach((id) => params.append('compareTrove', id))
    const url = `/api/search/uniques?${params}`
    const cached = queryCache.get(url)
    if (cached) {
      setUniquesResult(cached)
      setUniquesPage(pageNum)
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setSearching(true)
    setSearchError(null)
    fetch(url, { credentials: 'include', headers: { ...getApiAuthHeaders() }, signal: controller.signal })
      .then((res) => {
        if (res.status === 401) { window.location.href = '/login'; return Promise.reject() }
        return res.ok ? res.json() : Promise.reject(new Error(res.statusText))
      })
      .then((data) => {
        queryCache.set(url, data)
        setUniquesResult(data)
        setUniquesPage(pageNum)
        refreshStatusMessage()
      })
      .catch((err) => { if (err.name !== 'AbortError') setSearchError(err.message) })
      .finally(() => setSearching(false))
  }

  useEffect(() => {
    refreshStatusMessage()
  }, [])

  useEffect(() => {
    if (!showTrovePicker) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setShowTrovePicker(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showTrovePicker])

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
    if (searchMode !== 'search') return
    if (skipSearchRef.current) {
      skipSearchRef.current = false
      return
    }
    const t = setTimeout(() => fetchSearch(0), 300)
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

  function setPrimary(id) {
    setPrimaryTroveId(id)
    setCompareTroveIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  function toggleCompare(id) {
    if (searchMode === 'uniques' && id === primaryTroveId) return
    setCompareTroveIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearTroves() {
    if (isDupOrUniques) {
      setPrimaryTroveId('')
      setCompareTroveIds(new Set())
    } else {
      setSelectedTroveIds(new Set())
    }
  }

  function handleOnlyClick(troveId) {
    if (!query.trim()) {
      queryRef.current = '*'
      setQuery('*')
    }
    if (isDupOrUniques) {
      setPrimaryTroveId(troveId)
      setCompareTroveIds(new Set())
      setShowTrovePicker(false)
    } else {
      setSelectedTroveIds(new Set([troveId]))
      setPage(0)
      setShowTrovePicker(false)
    }
  }

  function handleSearch(e) {
    e?.preventDefault()
    setSearchError(null)
    if (searchMode === 'duplicates') {
      if (!primaryTroveId.trim()) return
      if (compareTroveIds.size === 0) return
      setUniquesResult(null)
      fetchDuplicates(0)
      setDuplicatesPage(0)
      return
    }
    if (searchMode === 'uniques') {
      if (!primaryTroveId.trim()) return
      if (compareTroveIds.size === 0) return
      if (compareTroveIds.has(primaryTroveId)) {
        setSearchError('Primary trove cannot be in compare list.')
        return
      }
      setDuplicatesResult(null)
      fetchUniques(0)
      setUniquesPage(0)
      return
    }
    if (!query.trim()) return
    setDuplicatesResult(null)
    setUniquesResult(null)
    fetchSearch(0)
    setPage(0)
  }

  function goToPage(nextPage) {
    fetchSearch(nextPage)
    setPage(nextPage)
  }

  const sortedDuplicateRows = useMemo(() => {
    const raw = Array.isArray(duplicatesResult?.rows) ? duplicatesResult.rows : []
    if (!duplicatesSortBy) return raw
    const maxScore = (row) => {
      if (!row?.matches?.length) return 0
      return Math.max(...row.matches.map((m) => (typeof m?.score === 'number' ? m.score : 0)))
    }
    const dir = duplicatesSortDir === 'desc' ? -1 : 1
    return [...raw].sort((a, b) => {
      let cmp = 0
      if (duplicatesSortBy === 'title') {
        const ta = (a.primary?.title ?? '').toLowerCase()
        const tb = (b.primary?.title ?? '').toLowerCase()
        cmp = ta.localeCompare(tb, undefined, { sensitivity: 'base' })
      } else if (duplicatesSortBy === 'trove') {
        const ta = (a.primary?.trove ?? a.primary?.troveId ?? '').toLowerCase()
        const tb = (b.primary?.trove ?? b.primary?.troveId ?? '').toLowerCase()
        cmp = ta.localeCompare(tb, undefined, { sensitivity: 'base' })
      } else if (duplicatesSortBy === 'score') {
        cmp = maxScore(a) - maxScore(b)
      }
      return dir * cmp
    })
  }, [duplicatesResult?.rows, duplicatesSortBy, duplicatesSortDir])

  const results = searchResult?.results ?? []
  const count = searchResult?.count ?? 0
  const totalPages = Math.ceil(count / MOBILE_PAGE_SIZE) || 0
  const troveLabel = isDupOrUniques
    ? (primaryTroveId
        ? <><strong>Primary:</strong> {troves.find((t) => t.id === primaryTroveId)?.name ?? primaryTroveId} · {compareTroveIds.size === 1 && compareTroveIds.has(primaryTroveId) ? <strong>Self-compare</strong> : <><strong>Compare:</strong> {formatCount(compareTroveIds.size)}</>}</>
        : 'Set primary & compare troves')
    : (selectedTroveIds.size === 0 ? 'All troves' : `${formatCount(selectedTroveIds.size)} trove${selectedTroveIds.size !== 1 ? 's' : ''}`)
  const filteredTroves = troves.filter((t) => {
    const q = trovePickerFilter.trim().toLowerCase()
    return !q || (t.name && t.name.toLowerCase().includes(q))
  })

  return (
    <div className="mobile-app">
      <header className="mobile-header">
        <Link to="/mobile" className="mobile-brand">Morsor</Link>
        <Link to="/mobile/about" className="mobile-nav-link">About</Link>
      </header>

      <main className="mobile-main">
        <div className="mobile-mode-tabs" role="tablist" aria-label="Search mode">
          <button
            type="button"
            role="tab"
            aria-selected={searchMode === 'search'}
            className={`mobile-mode-tab ${searchMode === 'search' ? 'mobile-mode-tab--active' : ''}`}
            onClick={() => {
              setSearchMode('search')
              setSearchResult(null)
              setDuplicatesResult(null)
              setUniquesResult(null)
            }}
          >
            Search
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={searchMode === 'duplicates'}
            className={`mobile-mode-tab ${searchMode === 'duplicates' ? 'mobile-mode-tab--active' : ''}`}
            onClick={() => {
              setSearchMode('duplicates')
              setSearchResult(null)
              setUniquesResult(null)
            }}
          >
            Duplicates
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={searchMode === 'uniques'}
            className={`mobile-mode-tab ${searchMode === 'uniques' ? 'mobile-mode-tab--active' : ''}`}
            onClick={() => {
              setSearchMode('uniques')
              setSearchResult(null)
              setDuplicatesResult(null)
            }}
          >
            Uniques
          </button>
        </div>

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
                  if (searchMode === 'duplicates') {
                    if (primaryTroveId.trim() && compareTroveIds.size > 0) {
                      setUniquesResult(null)
                      fetchDuplicates(0)
                    }
                  } else if (searchMode === 'uniques') {
                    if (primaryTroveId.trim() && compareTroveIds.size > 0 && !compareTroveIds.has(primaryTroveId)) {
                      setDuplicatesResult(null)
                      fetchUniques(0)
                    }
                  } else {
                    fetchSearch(0)
                  }
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
                  setDuplicatesResult(null)
                  setUniquesResult(null)
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

        {searchError && <p className="mobile-search-error" role="alert">{searchError}</p>}
        {((searchMode === 'search' && searchResult?.warning) || (searchMode === 'duplicates' && duplicatesResult?.warning) || (searchMode === 'uniques' && uniquesResult?.warning)) && (
          <p className="search-cache-warning" role="status">
            {(searchMode === 'search' && searchResult?.warning) || (searchMode === 'duplicates' && duplicatesResult?.warning) || (searchMode === 'uniques' && uniquesResult?.warning)}
          </p>
        )}

        {isDupOrUniques && !duplicatesResult && !uniquesResult && !searching && (
          <p className="mobile-search-hint">Select primary trove and at least one compare trove. Use * for all items.</p>
        )}
        {isDupOrUniques && searching && (
          <div className="mobile-search-loading" aria-live="polite" aria-busy="true">
            <span className="mobile-search-spinner" aria-hidden="true" />
          </div>
        )}

        <div className="mobile-troves-row">
          <span className="mobile-troves-label">
            {searchMode === 'search' && searchResult != null && count > 0 && (
              <>{formatCount(count)} item{count !== 1 ? 's' : ''} · </>
            )}
            {searchMode === 'duplicates' && duplicatesResult != null && (duplicatesResult.total ?? 0) > 0 && (
              <>{formatCount(duplicatesResult.total)} dups · </>
            )}
            {searchMode === 'uniques' && uniquesResult != null && (uniquesResult.total ?? 0) > 0 && (
              <>{formatCount(uniquesResult.total)} uniques · </>
            )}
            {troveLabel}
          </span>
          {searchMode === 'search' && searchResult != null && totalPages > 1 && (
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
                {formatCount(page + 1)} / {formatCount(totalPages)}
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
          {searchMode === 'duplicates' && duplicatesResult != null && (() => {
            const total = duplicatesResult.total ?? 0
            const size = duplicatesResult.size ?? DUP_UNIQUES_PAGE_SIZE
            const totalDupPages = size > 0 ? Math.ceil(total / size) : 0
            return totalDupPages > 1 && (
              <nav className="mobile-pagination" aria-label="Duplicate pages">
                <button type="button" className="mobile-page-btn" disabled={duplicatesPage <= 0 || searching} onClick={() => fetchDuplicates(duplicatesPage - 1)} aria-label="Previous">‹</button>
                <span className="mobile-page-info">{formatCount(duplicatesPage + 1)} / {formatCount(totalDupPages)}</span>
                <button type="button" className="mobile-page-btn" disabled={duplicatesPage >= totalDupPages - 1 || searching} onClick={() => fetchDuplicates(duplicatesPage + 1)} aria-label="Next">›</button>
              </nav>
            )
          })()}
          {searchMode === 'uniques' && uniquesResult != null && (() => {
            const total = uniquesResult.total ?? 0
            const size = uniquesResult.size ?? DUP_UNIQUES_PAGE_SIZE
            const totalUniqPages = size > 0 ? Math.ceil(total / size) : 0
            return totalUniqPages > 1 && (
              <nav className="mobile-pagination" aria-label="Uniques pages">
                <button type="button" className="mobile-page-btn" disabled={uniquesPage <= 0 || searching} onClick={() => fetchUniques(uniquesPage - 1)} aria-label="Previous">‹</button>
                <span className="mobile-page-info">{formatCount(uniquesPage + 1)} / {formatCount(totalUniqPages)}</span>
                <button type="button" className="mobile-page-btn" disabled={uniquesPage >= totalUniqPages - 1 || searching} onClick={() => fetchUniques(uniquesPage + 1)} aria-label="Next">›</button>
              </nav>
            )
          })()}
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
          <div className={`mobile-trove-picker${isDupOrUniques ? ' mobile-trove-picker--with-tabs' : ''}`}>
            {isDupOrUniques && (
              <div className="mobile-primary-compare-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={trovePickerSubTab === 'primary'}
                  className={`mobile-primary-compare-tab ${trovePickerSubTab === 'primary' ? 'mobile-primary-compare-tab--active' : ''}`}
                  onClick={() => setTrovePickerSubTab('primary')}
                >
                  Primary
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={trovePickerSubTab === 'compare'}
                  className={`mobile-primary-compare-tab ${trovePickerSubTab === 'compare' ? 'mobile-primary-compare-tab--active' : ''}`}
                  onClick={() => setTrovePickerSubTab('compare')}
                >
                  Compare
                </button>
              </div>
            )}
            <div className="mobile-trove-filter-row">
              <div className="mobile-trove-filter-wrap">
                <input
                  type="text"
                  value={trovePickerFilter}
                  onChange={(e) => setTrovePickerFilter(e.target.value)}
                  placeholder="Filter by trove name"
                  className="mobile-trove-picker-filter"
                  aria-label="Filter troves by name"
                />
                <button
                  type="button"
                  className="mobile-trove-filter-clear"
                  title="Clear filter"
                  onClick={() => setTrovePickerFilter('')}
                  aria-label="Clear filter"
                >
                  ×
                </button>
              </div>
              <button type="button" onClick={() => setShowTrovePicker(false)} className="mobile-trove-picker-done">
                Done
              </button>
            </div>
            <button type="button" onClick={clearTroves} className="mobile-trove-clear">Clear all</button>
            <ul className="mobile-trove-list">
              {isDupOrUniques && trovePickerSubTab === 'primary'
                ? filteredTroves.map((t) => (
                    <li key={t.id} className="mobile-trove-item">
                      <label className="mobile-trove-label">
                        <input
                          type="radio"
                          name="mobile-primary-trove"
                          checked={primaryTroveId === t.id}
                          onChange={() => setPrimary(t.id)}
                        />
                        <span>{t.name}</span>
                      </label>
                      <button type="button" className="mobile-trove-only-link" onClick={(e) => { e.preventDefault(); setPrimary(t.id); setShowTrovePicker(false) }} aria-label={`Set primary: ${t.name}`}>only</button>
                    </li>
                  ))
                : isDupOrUniques && trovePickerSubTab === 'compare'
                  ? (searchMode === 'uniques' ? filteredTroves.filter((t) => t.id !== primaryTroveId) : filteredTroves).map((t) => (
                      <li key={t.id} className="mobile-trove-item">
                        <label className="mobile-trove-label">
                          <input
                            type="checkbox"
                            checked={compareTroveIds.has(t.id)}
                            onChange={() => toggleCompare(t.id)}
                          />
                          <span>{t.name}</span>
                        </label>
                      </li>
                    ))
                  : filteredTroves.map((t) => (
                      <li key={t.id} className="mobile-trove-item">
                        <label className="mobile-trove-label">
                          <input type="checkbox" checked={selectedTroveIds.has(t.id)} onChange={() => toggleTrove(t.id)} />
                          <span>{t.name}</span>
                        </label>
                        <button type="button" className="mobile-trove-only-link" onClick={(e) => { e.preventDefault(); handleOnlyClick(t.id) }} aria-label={`Search only ${t.name}`} title="Select only this trove">only</button>
                      </li>
                    ))
              }
            </ul>
          </div>
        )}

        {searchMode === 'search' && searchResult != null && (
          <>
            {results.length === 0 && query.trim() && !searching && (
              <p className="mobile-no-results">No items.</p>
            )}
            {results.length > 0 && (
              <div className="mobile-search-results-grid">
                <SearchResultsGrid
                  data={results}
                  sortBy={searchSortBy}
                  sortDir={searchSortDir}
                  onSortChange={(col, dir) => fetchSearch(0, col, dir)}
                />
              </div>
            )}
          </>
        )}

        {searchMode === 'duplicates' && duplicatesResult != null && !searching && (
          <div className="mobile-dup-uniques-results">
            <DuplicateResultsView
              rows={sortedDuplicateRows}
              sortBy={duplicatesSortBy}
              sortDir={duplicatesSortDir}
              onSortChange={(col, dir) => {
                setDuplicatesSortBy(col)
                setDuplicatesSortDir(dir)
              }}
            />
          </div>
        )}

        {searchMode === 'uniques' && uniquesResult != null && !searching && (
          <div className="mobile-dup-uniques-results">
            <UniquesResultsView
              results={Array.isArray(uniquesResult.results) ? uniquesResult.results : []}
              sortBy={uniquesSortBy}
              sortDir={uniquesSortDir}
              onSortChange={(col, dir) => fetchUniques(0, col, dir)}
            />
          </div>
        )}
      </main>

      <footer className="mobile-footer">
        {statusMessage && (
          <p className="mobile-status-message" role="status">{statusMessage}</p>
        )}
        <div className="mobile-footer-row">
          <Link to="/" className="mobile-footer-link" onClick={() => sessionStorage.setItem('morsorPreferDesktop', 'true')}>Desktop site</Link>
          <button
            type="button"
            className="mobile-footer-link mobile-footer-logout-btn"
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
        </div>
      </footer>
    </div>
  )
}

export default MobileApp
