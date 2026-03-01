import { useMemo, useState, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { SearchResultsGrid } from './SearchResultsGrid'
import { DuplicateResultsView } from './DuplicateResultsView'
import { UniquesResultsView } from './UniquesResultsView'
import { getApiAuthHeaders } from './apiAuth'
import { getCsrfToken } from './getCsrfToken'
import { queryCache } from './queryCache'
import { formatCount, formatCacheBytes } from './formatCount'
import './App.css'

function App() {
  const [message, setMessage] = useState('')
  const [troves, setTroves] = useState([])
  const [searchSelectedTroveIds, setSearchSelectedTroveIds] = useState(() => new Set())
  const [dupCompareTroveIds, setDupCompareTroveIds] = useState(() => new Set())
  const [uniqCompareTroveIds, setUniqCompareTroveIds] = useState(() => new Set())
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
  const [searchParams, setSearchParams] = useSearchParams()
  const searchMode = (() => {
    const m = searchParams.get('mode')
    return (m === 'duplicates' || m === 'uniques') ? m : 'search'
  })()
  const [dupPrimaryTroveId, setDupPrimaryTroveId] = useState('')
  const [uniqPrimaryTroveId, setUniqPrimaryTroveId] = useState('')
  const [primaryTroveFilter, setPrimaryTroveFilter] = useState('')
  const selectedTroveIds = searchMode === 'search' ? searchSelectedTroveIds : searchMode === 'duplicates' ? dupCompareTroveIds : uniqCompareTroveIds
  const setSelectedTroveIds = searchMode === 'search' ? setSearchSelectedTroveIds : searchMode === 'duplicates' ? setDupCompareTroveIds : setUniqCompareTroveIds
  const primaryTroveId = searchMode === 'duplicates' ? dupPrimaryTroveId : uniqPrimaryTroveId
  const setPrimaryTroveId = searchMode === 'duplicates' ? setDupPrimaryTroveId : setUniqPrimaryTroveId
  const [duplicatesTroveTab, setDuplicatesTroveTab] = useState('primary')
  const [duplicatesResult, setDuplicatesResult] = useState(null)
  const [duplicatesPage, setDuplicatesPage] = useState(0)
  const [duplicatesSortBy, setDuplicatesSortBy] = useState(null)
  const [duplicatesSortDir, setDuplicatesSortDir] = useState('asc')
  const [uniquesResult, setUniquesResult] = useState(null)
  const [uniquesPage, setUniquesPage] = useState(0)
  const [uniquesSortBy, setUniquesSortBy] = useState(null)
  const [uniquesSortDir, setUniquesSortDir] = useState('asc')
  const queryRef = useRef(query)
  const skipCheckboxSearchRef = useRef(true)
  const abortControllerRef = useRef(null)
  const PAGE_SIZE_OPTIONS = [10, 25, 100, 500, 1000, 5000, 10000]
  queryRef.current = query

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
        setMessage(base + cacheMsg)
      })
      .catch(() => setMessage('Status: Backend unreachable'))
  }

  function fetchSearch(pageNum, sizeOverride = null, troveIdsOverride = null, sortByOverride = null, sortDirOverride = null) {
    const size = sizeOverride ?? pageSize
    const q = queryRef.current
    if (!q.trim()) {
      setSearchResult({ count: 0, results: [], page: 0, size })
      return
    }
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
    const url = `/api/search?${params}`
    const cached = queryCache.get(url)
    if (cached) {
      setSearchResult(cached)
      return
    }
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    setSearching(true)
    setSearchError(null)
    fetch(url, { credentials: 'include', headers: { ...getApiAuthHeaders() }, signal: controller.signal })
      .then((res) => {
        if (res.status === 401) { window.location.href = '/login'; return Promise.reject() }
        if (!res.ok) throw new Error(res.statusText)
        return res.json()
      })
      .then((data) => {
        queryCache.set(url, data)
        setSearchResult(data)
        refreshStatusMessage()
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setSearchError(err.message)
      })
      .finally(() => setSearching(false))
  }

  useEffect(() => {
    refreshStatusMessage()
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

  // Restore query and trove selection from URL (bookmark / back button).
  // Restore raw param values so pasted URLs are preserved even before troves have loaded.
  useEffect(() => {
    const q = searchParams.get('q')
    setQuery(q != null ? q : '')
    const mode = searchParams.get('mode')
    if (mode !== 'duplicates' && mode !== 'uniques') {
      setSearchSelectedTroveIds(new Set(searchParams.getAll('trove')))
    } else if (mode === 'duplicates') {
      setDupPrimaryTroveId(searchParams.get('primary') ?? '')
      setDupCompareTroveIds(new Set(searchParams.getAll('compare')))
    } else {
      setUniqPrimaryTroveId(searchParams.get('primary') ?? '')
      setUniqCompareTroveIds(new Set(searchParams.getAll('compare')))
    }
  }, [searchParams])

  function buildSearchParams(mode, q, searchTroves, dupPrimary, dupCompare, uniqPrimary, uniqCompare) {
    const next = new URLSearchParams()
    if (mode !== 'search') next.set('mode', mode)
    const qTrim = (q ?? '').trim()
    if (qTrim) next.set('q', qTrim)
    if (mode === 'search') {
      searchTroves.forEach((id) => next.append('trove', id))
    } else if (mode === 'duplicates') {
      if (dupPrimary) next.set('primary', dupPrimary)
      dupCompare.forEach((id) => next.append('compare', id))
    } else {
      if (uniqPrimary) next.set('primary', uniqPrimary)
      uniqCompare.forEach((id) => next.append('compare', id))
    }
    return next
  }

  // Persist current tab, query, and trove selection to URL (bookmarkable).
  // Skip overwriting when the URL has primary/compare but state is still empty (pasted URL, URL→state not applied yet).
  useEffect(() => {
    const urlHasPrimaryOrCompare = searchParams.get('primary') || searchParams.getAll('compare').length > 0
    const stateHasNone = !primaryTroveId && (searchMode === 'duplicates' ? !dupCompareTroveIds.size : !uniqCompareTroveIds.size)
    if (urlHasPrimaryOrCompare && stateHasNone) return
    const next = buildSearchParams(
      searchMode,
      query,
      searchSelectedTroveIds,
      dupPrimaryTroveId,
      dupCompareTroveIds,
      uniqPrimaryTroveId,
      uniqCompareTroveIds
    )
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [query, searchMode, searchSelectedTroveIds, primaryTroveId, dupCompareTroveIds, uniqCompareTroveIds])

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
    const params = new URLSearchParams({
      primaryTrove: primaryTroveId.trim(),
      query: q,
      page: String(pageNum),
      size: '50',
      maxMatches: '20',
    })
    selectedTroveIds.forEach((id) => params.append('compareTrove', id))
    const url = `/api/search/duplicates?${params}`
    const cached = queryCache.get(url)
    if (cached) {
      setDuplicatesResult(cached)
      setDuplicatesPage(pageNum)
      return
    }
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    setSearching(true)
    setSearchError(null)
    fetch(url, { credentials: 'include', headers: { ...getApiAuthHeaders() }, signal: controller.signal })
      .then((res) => {
        if (res.status === 401) { window.location.href = '/login'; return Promise.reject() }
        if (!res.ok) throw new Error(res.statusText)
        return res.json()
      })
      .then((data) => {
        queryCache.set(url, data)
        setDuplicatesResult(data)
        setDuplicatesPage(pageNum)
        refreshStatusMessage()
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setSearchError(err.message)
      })
      .finally(() => setSearching(false))
  }

  function fetchUniques(pageNum, sortByOverride = null, sortDirOverride = null) {
    const q = queryRef.current.trim() || '*'
    if (!primaryTroveId.trim()) {
      setUniquesResult({ total: 0, page: 0, size: 50, results: [] })
      return
    }
    if (selectedTroveIds.size === 0) {
      setUniquesResult({ total: 0, page: 0, size: 50, results: [] })
      return
    }
    const sortBy = sortByOverride !== undefined && sortByOverride !== null ? sortByOverride : uniquesSortBy
    const sortDir = sortDirOverride !== undefined && sortDirOverride !== null ? sortDirOverride : uniquesSortDir
    if (sortByOverride != null || sortDirOverride != null) {
      setUniquesSortBy(sortBy || null)
      setUniquesSortDir(sortDir)
    }
    const params = new URLSearchParams({
      primaryTrove: primaryTroveId.trim(),
      query: q,
      page: String(pageNum),
      size: '50',
    })
    if (sortBy) {
      params.set('sortBy', sortBy)
      params.set('sortDir', sortDir)
    }
    selectedTroveIds.forEach((id) => params.append('compareTrove', id))
    const url = `/api/search/uniques?${params}`
    const cached = queryCache.get(url)
    if (cached) {
      setUniquesResult(cached)
      setUniquesPage(pageNum)
      return
    }
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    setSearching(true)
    setSearchError(null)
    fetch(url, { credentials: 'include', headers: { ...getApiAuthHeaders() }, signal: controller.signal })
      .then((res) => {
        if (res.status === 401) { window.location.href = '/login'; return Promise.reject() }
        if (!res.ok) throw new Error(res.statusText)
        return res.json()
      })
      .then((data) => {
        queryCache.set(url, data)
        setUniquesResult(data)
        setUniquesPage(pageNum)
        refreshStatusMessage()
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
      setSearchError(null)
      setSearchResult(null)
      setUniquesResult(null)
      fetchDuplicates(0)
      return
    }
    if (searchMode === 'uniques') {
      if (!primaryTroveId.trim()) return
      if (selectedTroveIds.size === 0) return
      if (primaryTroveId && selectedTroveIds.has(primaryTroveId)) {
        setSearchError('Primary trove cannot be in compare list. Remove it from compare troves.')
        return
      }
      setSearchError(null)
      setSearchResult(null)
      setDuplicatesResult(null)
      fetchUniques(0)
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

  return (
    <>
      <h1 className="app-title">
        <span className="search-title-brand">Morsor</span> <span className="sidebar-title-note">More lists than you needed</span>
      </h1>
      <div className="app-layout">
        <div className={`sidebar-wrapper ${sidebarOpen ? 'sidebar-wrapper--open' : ''}`}>
          <aside className="sidebar">
            <div className="trove-picker-panel">
              {(searchMode === 'duplicates' || searchMode === 'uniques') ? (
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
                  {duplicatesTroveTab === 'primary' && (() => {
                    const primarySelectedTrove = primaryTrovesFiltered.find((t) => t.id === primaryTroveId)
                    const primaryNotSelectedTroves = primaryTrovesFiltered.filter((t) => t.id !== primaryTroveId)
                    return (
                      <div className="primary-trove-select-wrap" role="tabpanel">
                        <div className="primary-trove-summary-row">
                          <p className="trove-picker-summary primary-trove-summary-text" aria-live="polite">
                            {primaryTroveId
                              ? (primarySelectedTrove?.name ?? primaryTroveId)
                              : 'Select primary trove'}
                          </p>
                          {primaryTroveId && (
                            <button
                              type="button"
                              className="trove-picker-clear"
                              onClick={() => setPrimaryTroveId('')}
                              aria-label="Clear Primary"
                            >
                              Clear Primary
                            </button>
                          )}
                        </div>
                        <div className="sidebar-trove-filter-wrap">
                          <input
                            id="primary-trove-filter"
                            type="text"
                            value={primaryTroveFilter}
                            onChange={(e) => setPrimaryTroveFilter(e.target.value)}
                            placeholder="Filter by name…"
                            className="sidebar-trove-filter-input primary-trove-filter-input"
                            aria-label="Filter primary troves by name"
                          />
                          <span className="search-query-actions">
                            <button
                              type="button"
                              className="search-query-btn"
                              title="Clear filter"
                              onClick={() => setPrimaryTroveFilter('')}
                              aria-label="Clear filter"
                            >
                              ×
                            </button>
                          </span>
                        </div>
                        <ul className="trove-list primary-trove-list" aria-label="Primary trove options">
                          {primarySelectedTrove && (
                            <li
                              key={primarySelectedTrove.id}
                              className="trove-item trove-item--selected"
                            >
                              <label className="trove-checkbox trove-radio">
                                <input
                                  type="radio"
                                  name="primary-trove"
                                  value={primarySelectedTrove.id}
                                  checked={true}
                                  onChange={() => setPrimaryTroveId(primarySelectedTrove.id)}
                                />
                                <span className="trove-name">
                                  {primarySelectedTrove.name} ({formatCount(primarySelectedTrove.count)})
                                </span>
                              </label>
                            </li>
                          )}
                          {primarySelectedTrove && primaryNotSelectedTroves.length > 0 && (
                            <li className="trove-list-separator" aria-hidden="true">
                              <hr className="sidebar-separator" />
                            </li>
                          )}
                          {primaryNotSelectedTroves.map((t) => (
                            <li key={t.id} className="trove-item">
                              <label className="trove-checkbox trove-radio">
                                <input
                                  type="radio"
                                  name="primary-trove"
                                  value={t.id}
                                  checked={primaryTroveId === t.id}
                                  onChange={() => setPrimaryTroveId(t.id)}
                                />
                                <span className="trove-name">
                                  {t.name} ({formatCount(t.count)})
                                </span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  })()}
                  {duplicatesTroveTab === 'compare' && (
                    <div role="tabpanel">
                      <div className="compare-trove-summary-row">
                        <p className="trove-picker-summary compare-trove-summary-text" aria-live="polite">
                          {selectedTroveIds.size === 0
                            ? 'Select at least one compare trove'
                            : `${formatCount(selectedTroveIds.size)} selected`}
                        </p>
                        <button
                          type="button"
                          className="trove-picker-clear"
                          onClick={clearTroves}
                          aria-label="Clear Comparison troves"
                        >
                          Clear Comparison troves
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
                                {t.name} ({searchResult != null ? `${formatCount(t.resultCount)}/${formatCount(t.count)}` : formatCount(t.count)})
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
                                {t.name} ({searchResult != null ? `${formatCount(t.resultCount)}/${formatCount(t.count)}` : formatCount(t.count)})
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
                  <div className="search-trove-summary-row">
                    <p className="trove-picker-summary search-trove-summary-text" aria-live="polite">
                      {selectedTroveIds.size === 0
                        ? 'All troves will be searched'
                        : `${formatCount(selectedTroveIds.size)} of ${formatCount(troves.length)} selected`}
                    </p>
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
                    {t.name} ({searchResult != null ? `${formatCount(t.resultCount)}/${formatCount(t.count)}` : formatCount(t.count)})
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
                    {t.name} ({searchResult != null ? `${formatCount(t.resultCount)}/${formatCount(t.count)}` : formatCount(t.count)})
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
                onClick={() => {
                  setSearchParams(buildSearchParams('search', query, searchSelectedTroveIds, dupPrimaryTroveId, dupCompareTroveIds, uniqPrimaryTroveId, uniqCompareTroveIds), { replace: true })
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
                className={searchMode === 'duplicates' ? 'active' : ''}
                onClick={() => {
                  const dupEmpty = !dupPrimaryTroveId && !dupCompareTroveIds.size
                  if (dupEmpty && (uniqPrimaryTroveId || uniqCompareTroveIds.size)) {
                    setDupPrimaryTroveId(uniqPrimaryTroveId)
                    setDupCompareTroveIds(new Set(uniqCompareTroveIds))
                    setSearchParams(buildSearchParams('duplicates', query, searchSelectedTroveIds, uniqPrimaryTroveId, uniqCompareTroveIds, uniqPrimaryTroveId, uniqCompareTroveIds), { replace: true })
                  } else {
                    setSearchParams(buildSearchParams('duplicates', query, searchSelectedTroveIds, dupPrimaryTroveId, dupCompareTroveIds, uniqPrimaryTroveId, uniqCompareTroveIds), { replace: true })
                  }
                  setSearchResult(null)
                  setUniquesResult(null)
                }}
              >
                Find duplicates
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={searchMode === 'uniques'}
                className={searchMode === 'uniques' ? 'active' : ''}
                onClick={() => {
                  const uniqEmpty = !uniqPrimaryTroveId && !uniqCompareTroveIds.size
                  if (uniqEmpty && (dupPrimaryTroveId || dupCompareTroveIds.size)) {
                    setUniqPrimaryTroveId(dupPrimaryTroveId)
                    setUniqCompareTroveIds(new Set(dupCompareTroveIds))
                    setSearchParams(buildSearchParams('uniques', query, searchSelectedTroveIds, dupPrimaryTroveId, dupCompareTroveIds, dupPrimaryTroveId, dupCompareTroveIds), { replace: true })
                  } else {
                    setSearchParams(buildSearchParams('uniques', query, searchSelectedTroveIds, dupPrimaryTroveId, dupCompareTroveIds, uniqPrimaryTroveId, uniqCompareTroveIds), { replace: true })
                  }
                  setSearchResult(null)
                  setDuplicatesResult(null)
                }}
              >
                Find uniques
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
                        if (searchMode === 'duplicates') {
                          if (primaryTroveId.trim() && selectedTroveIds.size > 0) {
                            setUniquesResult(null)
                            fetchDuplicates(0)
                          }
                        } else if (searchMode === 'uniques') {
                          if (primaryTroveId.trim() && selectedTroveIds.size > 0 && !selectedTroveIds.has(primaryTroveId)) {
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
                      className="search-query-btn"
                      title="Clear"
                      onClick={() => {
                        setQuery('')
                        setSearchResult({ count: 0, results: [], page: 0, size: pageSize })
                        setDuplicatesResult(null)
                        setUniquesResult(null)
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
            {(searchMode === 'search' && searchResult?.warning) || (searchMode === 'duplicates' && duplicatesResult?.warning) || (searchMode === 'uniques' && uniquesResult?.warning) ? (
              <p className="search-cache-warning" role="status">
                {(searchMode === 'search' && searchResult?.warning) || (searchMode === 'duplicates' && duplicatesResult?.warning) || (searchMode === 'uniques' && uniquesResult?.warning)}
              </p>
            ) : null}
            {(searchMode === 'duplicates' || searchMode === 'uniques') && duplicatesResult == null && uniquesResult == null && !searching && (
              <p className="search-count search-count-detail">
                Select <strong>primary trove</strong> and at least one <strong>compare trove</strong>. Use query <strong>*</strong> for all items, or type a filter.
              </p>
            )}
            {(searchMode === 'duplicates' || searchMode === 'uniques') && searching && (
              <div className="duplicates-search-loading" aria-live="polite">
                <span className="search-spinner" aria-hidden="true" />
                <span>{searchMode === 'duplicates' ? 'Finding duplicates…' : 'Finding uniques…'}</span>
              </div>
            )}
            {searchMode === 'duplicates' && duplicatesResult != null && !searching && (() => {
              const total = duplicatesResult.total ?? 0
              const pageNum = duplicatesResult.page ?? 0
              const size = duplicatesResult.size ?? 50
              const rows = sortedDuplicateRows
              const totalPages = size > 0 ? Math.ceil(total / size) : 0
              const primaryName = troves.find((t) => t.id === primaryTroveId)?.name ?? primaryTroveId
              const compareNamesList = [...selectedTroveIds].map((id) => troves.find((t) => t.id === id)?.name ?? id).join(', ')
              const compareDisplay = compareNamesList.length < 50 ? compareNamesList : `${selectedTroveIds.size} troves`
              const compareSummary = selectedTroveIds.size === 1 && selectedTroveIds.has(primaryTroveId) ? <strong>Self-compare</strong> : <><strong>Compare:</strong> {compareDisplay}</>
              return (
                <>
                  <p className="search-count search-count-detail">
                    <><strong>Primary:</strong> {primaryName} · {compareSummary}. </>{formatCount(total)} {selectedTroveIds.size === 1 && selectedTroveIds.has(primaryTroveId) ? '' : 'primary '}item{total !== 1 ? 's' : ''} with possible duplicates.
                  </p>
                  {totalPages > 1 && (() => {
                    const maxShow = 5
                    let start = Math.max(0, pageNum - Math.floor(maxShow / 2))
                    let end = Math.min(totalPages, start + maxShow)
                    if (end - start < maxShow) start = Math.max(0, end - maxShow)
                    const pageNumbers = []
                    for (let i = start; i < end; i++) pageNumbers.push(i)
                    return (
                      <nav className="pagination" aria-label="Duplicate results pages">
                        <span className="pagination-info">
                          Page {formatCount(pageNum + 1)} of {formatCount(totalPages)}
                        </span>
                        <button
                          type="button"
                          className="pagination-btn"
                          disabled={pageNum <= 0 || searching}
                          onClick={() => fetchDuplicates(pageNum - 1)}
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
                                onClick={() => fetchDuplicates(0)}
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
                              onClick={() => fetchDuplicates(i)}
                              aria-label={`Page ${formatCount(i + 1)}`}
                              aria-current={i === pageNum ? 'page' : undefined}
                            >
                              {formatCount(i + 1)}
                            </button>
                          ))}
                          {end < totalPages && (
                            <>
                              <span className="pagination-ellipsis" aria-hidden="true">…</span>
                              <button
                                type="button"
                                className={`pagination-btn pagination-num ${totalPages - 1 === pageNum ? 'pagination-num--current' : ''}`}
                                disabled={searching}
                                onClick={() => fetchDuplicates(totalPages - 1)}
                                aria-label={`Page ${formatCount(totalPages)}`}
                                aria-current={totalPages - 1 === pageNum ? 'page' : undefined}
                              >
                                {formatCount(totalPages)}
                              </button>
                            </>
                          )}
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
                    )
                  })()}
                  <DuplicateResultsView
                    rows={rows}
                    sortBy={duplicatesSortBy}
                    sortDir={duplicatesSortDir}
                    onSortChange={(col, dir) => {
                      setDuplicatesSortBy(col)
                      setDuplicatesSortDir(dir)
                    }}
                  />
                </>
              )
            })()}
            {searchMode === 'uniques' && uniquesResult != null && !searching && (() => {
              const total = uniquesResult.total ?? 0
              const pageNum = uniquesResult.page ?? 0
              const size = uniquesResult.size ?? 50
              const results = Array.isArray(uniquesResult.results) ? uniquesResult.results : []
              const totalPages = size > 0 ? Math.ceil(total / size) : 0
              const primaryName = troves.find((t) => t.id === primaryTroveId)?.name ?? primaryTroveId
              const compareNamesList = [...selectedTroveIds].map((id) => troves.find((t) => t.id === id)?.name ?? id).join(', ')
              const compareDisplay = compareNamesList.length < 50 ? compareNamesList : `${selectedTroveIds.size} troves`
              const compareSummary = selectedTroveIds.size === 1 && selectedTroveIds.has(primaryTroveId) ? <strong>Self-compare</strong> : <><strong>Compare:</strong> {compareDisplay}</>
              return (
                <>
                  <p className="search-count search-count-detail">
                    <><strong>Primary:</strong> {primaryName} · {compareSummary}. </>{formatCount(total)} item{total !== 1 ? 's' : ''}{selectedTroveIds.size === 1 && selectedTroveIds.has(primaryTroveId) ? ' ' : ' in primary '}with no match in compare troves.
                  </p>
                  {totalPages > 1 && (() => {
                    const maxShow = 5
                    let start = Math.max(0, pageNum - Math.floor(maxShow / 2))
                    let end = Math.min(totalPages, start + maxShow)
                    if (end - start < maxShow) start = Math.max(0, end - maxShow)
                    const pageNumbers = []
                    for (let i = start; i < end; i++) pageNumbers.push(i)
                    return (
                      <nav className="pagination" aria-label="Uniques results pages">
                        <span className="pagination-info">
                          Page {formatCount(pageNum + 1)} of {formatCount(totalPages)}
                        </span>
                        <button
                          type="button"
                          className="pagination-btn"
                          disabled={pageNum <= 0 || searching}
                          onClick={() => fetchUniques(pageNum - 1)}
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
                                onClick={() => fetchUniques(0)}
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
                              onClick={() => fetchUniques(i)}
                              aria-label={`Page ${formatCount(i + 1)}`}
                              aria-current={i === pageNum ? 'page' : undefined}
                            >
                              {formatCount(i + 1)}
                            </button>
                          ))}
                          {end < totalPages && (
                            <>
                              <span className="pagination-ellipsis" aria-hidden="true">…</span>
                              <button
                                type="button"
                                className={`pagination-btn pagination-num ${totalPages - 1 === pageNum ? 'pagination-num--current' : ''}`}
                                disabled={searching}
                                onClick={() => fetchUniques(totalPages - 1)}
                                aria-label={`Page ${formatCount(totalPages)}`}
                                aria-current={totalPages - 1 === pageNum ? 'page' : undefined}
                              >
                                {formatCount(totalPages)}
                              </button>
                            </>
                          )}
                        </span>
                        <button
                          type="button"
                          className="pagination-btn"
                          disabled={pageNum >= totalPages - 1 || searching}
                          onClick={() => fetchUniques(pageNum + 1)}
                          aria-label="Next page"
                        >
                          →
                        </button>
                      </nav>
                    )
                  })()}
                  <UniquesResultsView
                    results={results}
                    sortBy={uniquesSortBy}
                    sortDir={uniquesSortDir}
                    onSortChange={(col, dir) => fetchUniques(0, col, dir)}
                  />
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
                    {formatCount(count)} item{count !== 1 ? 's' : ''} in {formatCount(trovesWithResults)} out of {formatCount(trovesInScope)} {scopeLabel}.
                    {totalPages > 1 && ` Showing ${formatCount(from)}–${formatCount(to)}.`}
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
                            {formatCount(n)}
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
                            Page {formatCount(pageNum + 1)} of {formatCount(totalPages)}
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
                                aria-label={`Page ${formatCount(i + 1)}`}
                                aria-current={i === pageNum ? 'page' : undefined}
                              >
                                {formatCount(i + 1)}
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
                                  aria-label={`Page ${formatCount(totalPages)}`}
                                  aria-current={totalPages - 1 === pageNum ? 'page' : undefined}
                                >
                                  {formatCount(totalPages)}
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
        <Link to="/mobile" className="app-footer-link" onClick={() => sessionStorage.removeItem('morsorPreferDesktop')}>Mobile</Link>
        {message && <p className="backend-message" data-status={message.startsWith('Status: Backend is up') ? 'up' : 'down'}>{message}</p>}
      </footer>
    </>
  )
}

export default App
