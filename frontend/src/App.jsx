import { useMemo, useState, useEffect, useRef } from 'react'
import { Link, useSearchParams, useLocation } from 'react-router-dom'
import { SearchResultsGrid } from './SearchResultsGrid'
import { DuplicateResultsView } from './DuplicateResultsView'
import { UniquesResultsView } from './UniquesResultsView'
import { getApiAuthHeaders } from './apiAuth'
import { getCsrfToken } from './getCsrfToken'
import { performLogout } from './performLogout'
import { queryCache } from './queryCache'
import { formatCount, formatCacheBytes } from './formatCount'
import { groupFileTypes, getGroupNameIfFullySelected, getFullySelectedGroupNames } from './fileTypeGroups'
import './App.css'

function App() {
  const [message, setMessage] = useState('')
  const [cacheEntries, setCacheEntries] = useState(0)
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
  const [freezeTroveListOrder, setFreezeTroveListOrder] = useState(false)
  const [boostTroveId, setBoostTroveId] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sortBy, setSortBy] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
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
  const [dupPageSize, setDupPageSize] = useState(50)
  const [duplicatesSortBy, setDuplicatesSortBy] = useState(null)
  const [duplicatesSortDir, setDuplicatesSortDir] = useState('asc')
  const [uniquesResult, setUniquesResult] = useState(null)
  const [uniquesPage, setUniquesPage] = useState(0)
  const [uniqPageSize, setUniqPageSize] = useState(50)
  const [uniquesSortBy, setUniquesSortBy] = useState(null)
  const [uniquesSortDir, setUniquesSortDir] = useState('asc')
  const [searchPageInput, setSearchPageInput] = useState('')
  const [fileTypeFilters, setFileTypeFilters] = useState(() => {
    const ftAll = new URLSearchParams(window.location.search).getAll('fileTypes')
    return new Set(ftAll.filter((f) => f != null && f.trim()).map((f) => f.trim()))
  })
  const [allAvailableFileTypes, setAllAvailableFileTypes] = useState([])
  const [fileTypeDropdownOpen, setFileTypeDropdownOpen] = useState(false)
  const [searchResultsViewMode, setSearchResultsViewMode] = useState('list') // 'list' | 'gallery' (desktop only)
  const [galleryDecorate, setGalleryDecorate] = useState(true)
  const [compareProgress, setCompareProgress] = useState({ current: 0, total: 0 })
  const [reloadTrovesInProgress, setReloadTrovesInProgress] = useState(false)
  const [reloadTrovesProgress, setReloadTrovesProgress] = useState({ current: 0, total: 0 })
  const queryRef = useRef(query)
  const skipCheckboxSearchRef = useRef(true)
  const skipFileTypeSearchRef = useRef(false)
  const skipViewModeSearchRef = useRef(false)
  const skipPageNavSearchRef = useRef(false)
  const lastFileTypeOrViewSearchRef = useRef(0)
  const abortControllerRef = useRef(null)
  const reloadAbortControllerRef = useRef(null)
  const fileTypeDropdownRef = useRef(null)
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
          ? (cache.entries === 0 ? ' · Cache: empty' : ` · Cache: ${formatCount(cache.entries)} entries, ~${formatCacheBytes(cache.estimatedBytes)}`)
          : ''
        setMessage(base + cacheMsg)
        setCacheEntries(cache != null && typeof cache.entries === 'number' ? cache.entries : 0)
      })
      .catch(() => setMessage('Status: Backend unreachable'))
  }

  function fetchSearch(pageNum, sizeOverride = null, troveIdsOverride = null, sortByOverride = null, sortDirOverride = null, fileTypesOverride = undefined) {
    const size = sizeOverride ?? pageSize
    const q = queryRef.current
    if (!q.trim()) {
      setSearchResult({ count: 0, results: [], page: 0, size })
      return
    }
    const troveIds = troveIdsOverride ?? selectedTroveIds
    const nextSortBy = sortByOverride !== undefined && sortByOverride !== null ? sortByOverride : sortBy
    const nextSortDir = sortDirOverride !== undefined && sortDirOverride !== null ? sortDirOverride : sortDir
    const fileTypesToUse = fileTypesOverride !== undefined ? fileTypesOverride : fileTypeFilters
    const params = new URLSearchParams({
      query: q.trim(),
      page: String(pageNum),
      size: String(size),
    })
    troveIds.forEach((id) => params.append('trove', id))
    if (boostTroveId) params.set('boostTrove', boostTroveId)
    if (fileTypesToUse && fileTypesToUse.size > 0) params.set('fileTypes', [...fileTypesToUse].sort().join(','))
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
      if (Array.isArray(cached?.availableFileTypes) && cached.availableFileTypes.length > 0) {
        setAllAvailableFileTypes((prev) => {
          const next = new Set(prev)
          cached.availableFileTypes.forEach((t) => next.add(t))
          return [...next].sort()
        })
      }
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
        if (Array.isArray(data?.availableFileTypes) && data.availableFileTypes.length > 0) {
          setAllAvailableFileTypes((prev) => {
            const next = new Set(prev)
            data.availableFileTypes.forEach((t) => next.add(t))
            return [...next].sort()
          })
        }
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
    if (!fileTypeDropdownOpen) return
    function handleClickOutside(e) {
      if (fileTypeDropdownRef.current && !fileTypeDropdownRef.current.contains(e.target)) {
        setFileTypeDropdownOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [fileTypeDropdownOpen])

  useEffect(() => {
    if (!fileTypeDropdownOpen) return
    function handleEscape(e) {
      if (e.key === 'Escape') setFileTypeDropdownOpen(false)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [fileTypeDropdownOpen])

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

  function urlTroveId(value, troveList) {
    if (!value || !troveList?.length) return value || null
    const t = troveList.find((x) => x.id === value || (x.name && x.name === value))
    return t ? t.id : value
  }

  // Restore query and trove selection from URL (bookmark / back button).
  // Resolve trove names to ids when troves are loaded so state and URL use ids.
  useEffect(() => {
    const q = searchParams.get('q')
    setQuery(q != null ? q : '')
    const ftAll = searchParams.getAll('fileTypes')
    setFileTypeFilters(new Set(ftAll.filter((f) => f != null && f.trim()).map((f) => f.trim())))
    const mode = searchParams.get('mode')
    if (mode !== 'duplicates' && mode !== 'uniques') {
      const troveIds = searchParams.getAll('trove').map((v) => urlTroveId(v, troves) ?? v).filter(Boolean)
      setSearchSelectedTroveIds(new Set(troveIds))
      const boost = searchParams.get('boost')
      setBoostTroveId(boost != null && boost !== '' ? (urlTroveId(boost, troves) ?? boost) : null)
      const view = searchParams.get('view')
      setSearchResultsViewMode(view === 'gallery' ? 'gallery' : 'list')
      if (view === 'gallery') {
        setSortBy('title')
        setSortDir('asc')
      }
      const sizeParam = Number(searchParams.get('size'))
      if (Number.isFinite(sizeParam) && sizeParam > 0) {
        setPageSize(sizeParam)
      }
    } else if (mode === 'duplicates') {
      const primary = searchParams.get('primary')
      setDupPrimaryTroveId(primary != null ? (urlTroveId(primary, troves) ?? primary) : '')
      setDupCompareTroveIds(new Set(searchParams.getAll('compare').map((v) => urlTroveId(v, troves) ?? v).filter(Boolean)))
    } else {
      const primary = searchParams.get('primary')
      setUniqPrimaryTroveId(primary != null ? (urlTroveId(primary, troves) ?? primary) : '')
      setUniqCompareTroveIds(new Set(searchParams.getAll('compare').map((v) => urlTroveId(v, troves) ?? v).filter(Boolean)))
    }
  }, [searchParams, troves])

  function buildSearchParams(mode, q, searchTroves, dupPrimary, dupCompare, uniqPrimary, uniqCompare, fileTypesSet = null, boostTrove = null, view = null) {
    const next = new URLSearchParams()
    if (mode !== 'search') next.set('mode', mode)
    const qTrim = (q ?? '').trim()
    if (qTrim) next.set('q', qTrim)
    if (mode === 'search') {
      Array.from(searchTroves).map((id) => urlTroveId(id, troves) ?? id).filter(Boolean).forEach((id) => next.append('trove', id))
      const boostId = boostTrove ? (urlTroveId(boostTrove, troves) ?? boostTrove) : null
      if (boostId) next.set('boost', boostId)
      const ft = fileTypesSet ?? fileTypeFilters
      if (ft && ft.size > 0) ft.forEach((f) => next.append('fileTypes', f))
      next.set('view', view === 'gallery' ? 'gallery' : 'list')
      const existingPage = searchParams.get('page')
      if (existingPage != null) next.set('page', existingPage)
      const existingSize = searchParams.get('size')
      if (existingSize != null) next.set('size', existingSize)
    } else if (mode === 'duplicates') {
      const primaryId = dupPrimary ? (urlTroveId(dupPrimary, troves) ?? dupPrimary) : null
      if (primaryId) next.set('primary', primaryId)
      Array.from(dupCompare).map((id) => urlTroveId(id, troves) ?? id).filter(Boolean).forEach((id) => next.append('compare', id))
    } else {
      const primaryId = uniqPrimary ? (urlTroveId(uniqPrimary, troves) ?? uniqPrimary) : null
      if (primaryId) next.set('primary', primaryId)
      Array.from(uniqCompare).map((id) => urlTroveId(id, troves) ?? id).filter(Boolean).forEach((id) => next.append('compare', id))
    }
    return next
  }

  // Persist current tab, query, trove selection, view, and search pagination to URL (bookmarkable).
  // Skip overwriting when the URL has params we haven't applied yet (pasted URL, desktop↔mobile toggle).
  useEffect(() => {
    const urlHasPrimaryOrCompare = searchParams.get('primary') || searchParams.getAll('compare').length > 0
    const stateHasNone = !primaryTroveId && (searchMode === 'duplicates' ? !dupCompareTroveIds.size : !uniqCompareTroveIds.size)
    if (urlHasPrimaryOrCompare && stateHasNone) return
    const urlHasQuery = searchParams.get('q') != null && searchParams.get('q') !== ''
    const urlHasTrove = searchParams.getAll('trove').length > 0
    const urlHasFileTypes = searchParams.getAll('fileTypes').length > 0
    const searchStateNotSynced =
      (urlHasQuery && (!query || (query ?? '').trim() === '')) ||
      (urlHasTrove && searchSelectedTroveIds.size === 0) ||
      (urlHasFileTypes && fileTypeFilters.size === 0)
    if (searchMode === 'search' && searchStateNotSynced) return
    const next = buildSearchParams(
      searchMode,
      query,
      searchSelectedTroveIds,
      dupPrimaryTroveId,
      dupCompareTroveIds,
      uniqPrimaryTroveId,
      uniqCompareTroveIds,
      fileTypeFilters,
      boostTroveId,
      searchResultsViewMode
    )
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [query, searchMode, searchSelectedTroveIds, primaryTroveId, dupCompareTroveIds, uniqCompareTroveIds, fileTypeFilters, boostTroveId, searchResultsViewMode, searchResult?.page, searchResult?.size, pageSize])

  // Keep the search page input in sync with the current page (1-based)
  useEffect(() => {
    if (searchMode !== 'search') return
    const pageNum = typeof searchResult?.page === 'number' ? searchResult.page : 0
    setSearchPageInput(String(pageNum + 1))
  }, [searchMode, searchResult?.page])

  useEffect(() => {
    if (searchMode !== 'search') return
    if (skipCheckboxSearchRef.current) {
      skipCheckboxSearchRef.current = false
      return
    }
    if (skipFileTypeSearchRef.current) {
      skipFileTypeSearchRef.current = false
      return
    }
    if (skipViewModeSearchRef.current) {
      skipViewModeSearchRef.current = false
      return
    }
    if (skipPageNavSearchRef.current) {
      skipPageNavSearchRef.current = false
      return
    }
    if (Date.now() - lastFileTypeOrViewSearchRef.current < 600) return
    const t = setTimeout(() => {
      const q = queryRef.current
      if (!q.trim()) {
        setSearchResult({ count: 0, results: [], page: 0, size: pageSize })
        return
      }
      const pageParam = Number(searchParams.get('page'))
      const initialPage = Number.isFinite(pageParam) && pageParam > 0 ? pageParam - 1 : 0
      const urlFileTypes = new Set(searchParams.getAll('fileTypes').filter((f) => f != null && f.trim()).map((f) => f.trim()))
      const fileTypesToUse = fileTypeFilters.size > 0 ? undefined : (urlFileTypes.size > 0 ? urlFileTypes : undefined)
      fetchSearch(initialPage, null, null, null, null, fileTypesToUse)
    }, 400)
    return () => clearTimeout(t)
  }, [searchMode, selectedTroveIds, searchParams, pageSize])

  useEffect(() => {
    setFreezeTroveListOrder(false)
  }, [searchMode])

  const prevBoostTroveIdRef = useRef(undefined)
  useEffect(() => {
    if (searchMode !== 'search') return
    if (prevBoostTroveIdRef.current === undefined) {
      prevBoostTroveIdRef.current = boostTroveId
      return
    }
    if (prevBoostTroveIdRef.current === boostTroveId) return
    prevBoostTroveIdRef.current = boostTroveId
    if (queryRef.current.trim()) fetchSearch(0)
  }, [boostTroveId, searchMode])

  function toggleTrove(id) {
    if (searchMode === 'search') setFreezeTroveListOrder(true)
    setSelectedTroveIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAllTroves() {
    if (searchMode === 'search') setFreezeTroveListOrder(true)
    setSelectedTroveIds(new Set(troves.map((t) => t.id)))
  }

  function clearTroves() {
    setSelectedTroveIds(new Set())
    setBoostTroveId(null)
    setSearchParams(buildSearchParams(
      searchMode,
      query,
      searchMode === 'search' ? new Set() : searchSelectedTroveIds,
      dupPrimaryTroveId,
      searchMode === 'duplicates' ? new Set() : dupCompareTroveIds,
      uniqPrimaryTroveId,
      searchMode === 'uniques' ? new Set() : uniqCompareTroveIds,
      fileTypeFilters,
      null,
      null
    ), { replace: true })
  }

  function selectOnlyTrove(id) {
    setSelectedTroveIds(new Set([id]))
  }

  function handleBoostClick(troveId) {
    if (searchMode !== 'search') return
    setFreezeTroveListOrder(true)
    setBoostTroveId((prev) => (prev === troveId ? null : troveId))
    if (!query.trim()) {
      queryRef.current = '*'
      setQuery('*')
    }
  }

  function handleTargetClick(troveId) {
    setFreezeTroveListOrder(true)
    selectOnlyTrove(troveId)
    if (!query.trim()) {
      queryRef.current = '*'
      setQuery('*')
    }
    if (searchMode === 'search') fetchSearch(0, null, new Set([troveId]))
  }

  function cancelSearch() {
    abortControllerRef.current?.abort()
  }

  async function readCompareStream(url, signal, onProgress, onDone) {
    const res = await fetch(url, { credentials: 'include', headers: { ...getApiAuthHeaders() }, signal })
    if (res.status === 401) { window.location.href = '/login'; throw new Error('Unauthorized') }
    if (!res.ok) throw new Error(res.statusText)
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const data = JSON.parse(line)
          if (data.type === 'progress') onProgress(data.current, data.total)
          else if (data.type === 'done') onDone(data.result)
        } catch (_) {}
      }
    }
    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer)
        if (data.type === 'progress') onProgress(data.current, data.total)
        else if (data.type === 'done') onDone(data.result)
      } catch (_) {}
    }
  }

  function fetchDuplicates(pageNum, sizeOverride = null) {
    const q = queryRef.current.trim() || '*'
    const size = sizeOverride ?? dupPageSize
    if (!primaryTroveId.trim()) {
      setDuplicatesResult({ total: 0, page: 0, size, rows: [] })
      return
    }
    if (selectedTroveIds.size === 0) {
      setDuplicatesResult({ total: 0, page: 0, size, rows: [] })
      return
    }
    const params = new URLSearchParams({
      primaryTrove: primaryTroveId.trim(),
      query: q,
      page: String(pageNum),
      size: String(size),
      maxMatches: '20',
    })
    selectedTroveIds.forEach((id) => params.append('compareTrove', id))
    const streamUrl = `/api/search/duplicates/stream?${params}`
    const restUrl = `/api/search/duplicates?${params}`
    const cached = queryCache.get(restUrl)
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
    setCompareProgress({ current: 0, total: 0 })
    readCompareStream(
      streamUrl,
      controller.signal,
      (current, total) => setCompareProgress({ current, total }),
      (data) => {
        queryCache.set(restUrl, data)
        setDuplicatesResult(data)
        setDuplicatesPage(pageNum)
        setCompareProgress({ current: 0, total: 0 })
        refreshStatusMessage()
      }
    ).catch((err) => {
      if (err.name !== 'AbortError') setSearchError(err.message)
    }).finally(() => {
      setSearching(false)
      setCompareProgress({ current: 0, total: 0 })
    })
  }

  function fetchUniques(pageNum, sortByOverride = null, sortDirOverride = null, sizeOverride = null) {
    const q = queryRef.current.trim() || '*'
    const size = sizeOverride ?? uniqPageSize
    if (!primaryTroveId.trim()) {
      setUniquesResult({ total: 0, page: 0, size, results: [] })
      return
    }
    if (selectedTroveIds.size === 0) {
      setUniquesResult({ total: 0, page: 0, size, results: [] })
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
      size: String(size),
    })
    if (sortBy) {
      params.set('sortBy', sortBy)
      params.set('sortDir', sortDir)
    }
    selectedTroveIds.forEach((id) => params.append('compareTrove', id))
    const streamUrl = `/api/search/uniques/stream?${params}`
    const restUrl = `/api/search/uniques?${params}`
    const cached = queryCache.get(restUrl)
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
    setCompareProgress({ current: 0, total: 0 })
    readCompareStream(
      streamUrl,
      controller.signal,
      (current, total) => setCompareProgress({ current, total }),
      (data) => {
        queryCache.set(restUrl, data)
        setUniquesResult(data)
        setUniquesPage(pageNum)
        setCompareProgress({ current: 0, total: 0 })
        refreshStatusMessage()
      }
    ).catch((err) => {
      if (err.name !== 'AbortError') setSearchError(err.message)
    }).finally(() => {
      setSearching(false)
      setCompareProgress({ current: 0, total: 0 })
    })
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
    setFreezeTroveListOrder(false)
    fetchSearch(0)
  }

  function handlePageSizeChange(e) {
    const newSize = Number(e.target.value)
    setPageSize(newSize)
    if (searchResult != null && query.trim()) fetchSearch(0, newSize)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('size', String(newSize))
    nextParams.set('page', '1')
    setSearchParams(nextParams, { replace: true })
  }
  function handleDupPageSizeChange(e) {
    const newSize = Number(e.target.value)
    setDupPageSize(newSize)
    if (duplicatesResult != null && primaryTroveId.trim() && selectedTroveIds.size > 0) fetchDuplicates(0, newSize)
  }
  function handleUniqPageSizeChange(e) {
    const newSize = Number(e.target.value)
    setUniqPageSize(newSize)
    if (uniquesResult != null && primaryTroveId.trim() && selectedTroveIds.size > 0) fetchUniques(0, null, null, newSize)
  }

  function goToPage(nextPage) {
    fetchSearch(nextPage)
    skipPageNavSearchRef.current = true
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('page', String(nextPage + 1))
    setSearchParams(nextParams, { replace: true })
  }

  function handleSearchPageInputKeyDown(e, totalPages, currentPage) {
    if (e.key !== 'Enter') return
    const raw = e.currentTarget.value.trim()
    const num = Number(raw)
    if (!Number.isFinite(num)) {
      setSearchPageInput(String(currentPage + 1))
      return
    }
    const clamped = Math.min(Math.max(1, num), totalPages || 1)
    setSearchPageInput(String(clamped))
    if (clamped - 1 !== currentPage) {
      goToPage(clamped - 1)
    }
  }

  function handleGridSortChange(newSortBy, newSortDir) {
    const pageNum = searchResult != null && typeof searchResult.page === 'number' ? searchResult.page : 0
    fetchSearch(pageNum, null, null, newSortBy, newSortDir)
  }

  function handleGallerySortChange(e) {
    const nextSortBy = e.target.value
    const nextSortDir = nextSortBy === 'score' ? 'desc' : 'asc'
    setSortBy(nextSortBy)
    setSortDir(nextSortDir)
    const q = queryRef.current
    if (!q.trim()) return
    const pageNum = searchResult != null && typeof searchResult.page === 'number' ? searchResult.page : 0
    fetchSearch(pageNum, null, null, nextSortBy, nextSortDir)
  }

  const gallerySortValue = sortBy === 'score' || sortBy === 'trove' ? sortBy : 'title'
  const gallerySortAfterFilterSlot = searchResultsViewMode === 'gallery'
    ? (
      <select
        value={gallerySortValue}
        onChange={handleGallerySortChange}
        className="gallery-sort-select"
        aria-label="Gallery sort"
      >
        <option value="title">Title</option>
        <option value="score">Score</option>
        <option value="trove">Trove</option>
      </select>
    )
    : null

  const primaryTrovesFiltered = useMemo(() => {
    const q = primaryTroveFilter.trim().toLowerCase()
    if (!q) return troves
    return troves.filter(
      (t) =>
        (t.name && t.name.toLowerCase().includes(q)) ||
        (t.id && t.id.toLowerCase().includes(q))
    )
  }, [troves, primaryTroveFilter])

  const { selected: selectedTroves, notSelected: notSelectedTroves, displaySelectedTroveIds } = useMemo(() => {
    const hasResults = searchResult?.results != null && Array.isArray(searchResult.results) && searchResult.results.length > 0
    const troveCounts = searchResult?.troveCounts != null && typeof searchResult.troveCounts === 'object'
      ? searchResult.troveCounts
      : null
    const withCounts = troves.map((t) => ({
      ...t,
      resultCount: searchResult?.results != null && Array.isArray(searchResult.results)
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
    const sortByName = (a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    const sortByHitsDesc = (a, b) => {
      if (searchMode === 'search' && boostTroveId && a.id === boostTroveId && b.id !== boostTroveId) return -1
      if (searchMode === 'search' && boostTroveId && b.id === boostTroveId && a.id !== boostTroveId) return 1
      const c = (b.resultCount ?? 0) - (a.resultCount ?? 0)
      return c !== 0 ? c : sortByName(a, b)
    }
    const idsForSplit =
      searchMode === 'search' && hasResults
        ? new Set(withCounts.filter((t) => t.resultCount > 0 || selectedTroveIds.has(t.id) || (boostTroveId != null && t.id === boostTroveId)).map((t) => t.id))
        : searchMode === 'search'
          ? new Set([...selectedTroveIds, ...(boostTroveId != null ? [boostTroveId] : [])])
          : selectedTroveIds
    const doSplit = searchMode !== 'search' || !freezeTroveListOrder || (searchMode === 'search' && (hasResults || selectedTroveIds.size > 0 || boostTroveId != null))
    const selectedSortWhenResults =
      (a, b) => {
        const diff = (b.resultCount ?? 0) - (a.resultCount ?? 0)
        if (diff !== 0) return diff
        if (boostTroveId != null && a.id === boostTroveId && b.id !== boostTroveId) return -1
        if (boostTroveId != null && b.id === boostTroveId && a.id !== boostTroveId) return 1
        return sortByName(a, b)
      }
    const selectedSortNoResults = (a, b) => {
      if (boostTroveId != null && a.id === boostTroveId && b.id !== boostTroveId) return -1
      if (boostTroveId != null && b.id === boostTroveId && a.id !== boostTroveId) return 1
      return sortByName(a, b)
    }
    const selectedSort = doSplit && hasResults ? selectedSortWhenResults : doSplit && searchMode === 'search' ? selectedSortNoResults : sortByName
    const selected = doSplit ? filtered.filter((t) => idsForSplit.has(t.id)).sort(selectedSort) : []
    const notSelected = doSplit ? filtered.filter((t) => !idsForSplit.has(t.id)).sort(sortByName) : [...filtered].sort(sortByName)
    return { selected, notSelected, displaySelectedTroveIds: idsForSplit }
  }, [troves, searchResult, troveFilter, showFilter, selectedTroveIds, searchMode, freezeTroveListOrder, boostTroveId])

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
    <div className="desktop-app">
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
                        <div className="primary-trove-summary-block">
                          <p className="trove-picker-summary primary-trove-summary-text" aria-live="polite">
                            {primaryTroveId
                              ? (primarySelectedTrove?.name ?? primaryTroveId)
                              : 'Select primary trove'}
                          </p>
                          <div className="primary-trove-buttons-row">
                            {primaryTroveId ? (
                              <button
                                type="button"
                                className="trove-picker-clear"
                                onClick={() => setPrimaryTroveId('')}
                                aria-label="Clear primary trove"
                              >
                                Clear
                              </button>
                            ) : (
                              <span />
                            )}
                            <button
                              type="button"
                              className="trove-picker-clear"
                              onClick={() => { if (dupPrimaryTroveId) setDupCompareTroveIds(new Set([dupPrimaryTroveId])) }}
                              disabled={!dupPrimaryTroveId}
                              aria-label="Compare to self"
                            >
                              Compare to self
                            </button>
                          </div>
                        </div>
                        <div className="sidebar-trove-filter-wrap">
                          <input
                            id="primary-trove-filter"
                            type="text"
                            value={primaryTroveFilter}
                            onChange={(e) => setPrimaryTroveFilter(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setPrimaryTroveFilter('') } }}
                            placeholder="Filter by name…"
                            className="sidebar-trove-filter-input primary-trove-filter-input"
                            aria-label="Filter primary troves by name"
                          />
                          <span className="search-query-actions">
                            <button
                              type="button"
                              className="search-query-btn search-query-btn-clear"
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
                      <div className="compare-trove-summary-block">
                        <p className="trove-picker-summary compare-trove-summary-text" aria-live="polite">
                          {selectedTroveIds.size === 0
                            ? 'Select comparison troves'
                            : `${formatCount(selectedTroveIds.size)} selected`}
                        </p>
                        <div className="compare-trove-buttons-row">
                          <button
                            type="button"
                            className="trove-picker-clear"
                            onClick={clearTroves}
aria-label="Clear compare troves"
                        >
                          Clear
                        </button>
                          <button
                            type="button"
                            className="trove-picker-clear"
                            onClick={() => { if (dupPrimaryTroveId) setDupCompareTroveIds(new Set([dupPrimaryTroveId])) }}
                            disabled={!dupPrimaryTroveId}
                            aria-label="Compare to self"
                          >
                            Compare to self
                          </button>
                        </div>
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
                          onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setTroveFilter('') } }}
                          placeholder="Filter compare troves…"
                          className="sidebar-trove-filter-input"
                          aria-label="Filter compare troves by name"
                        />
                        <span className="search-query-actions">
                          <button
                            type="button"
                            className="search-query-btn search-query-btn-clear"
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
                        ? 'All troves will be searched.'
                        : `${formatCount(selectedTroveIds.size)} of ${formatCount(troves.length)} selected.`}
                      {boostTroveId && (() => {
                        const name = troves.find((t) => t.id === boostTroveId)?.name ?? boostTroveId
                        return name ? ` ${name} will be boosted.` : null
                      })()}
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
              onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setTroveFilter('') } }}
              placeholder={searchMode === 'duplicates' ? 'Filter compare troves…' : 'Filter troves…'}
              className="sidebar-trove-filter-input"
              aria-label={searchMode === 'duplicates' ? 'Filter compare troves by name' : 'Filter troves by name'}
            />
            <span className="search-query-actions">
              <button
                type="button"
                className="search-query-btn search-query-btn-clear"
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
                  <span className="trove-only-actions">
                    <button
                      type="button"
                      className="trove-only-link"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleTargetClick(t.id) }}
                      aria-label={`Search only ${t.name}`}
                      title="Only this trove"
                    >
                      <img src="/target.png" alt="" className="trove-only-icon" />
                    </button>
                    {searchMode === 'search' && (
                      <button
                        type="button"
                        className={`trove-only-link trove-only-link--boost${boostTroveId === t.id ? ' trove-only-link--boost-active' : ''}`}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleBoostClick(t.id) }}
                        aria-label={boostTroveId === t.id ? `Boost on for ${t.name} (results rank higher)` : `Boost ${t.name} in search results`}
                        title={boostTroveId === t.id ? 'Boost on — results from this trove rank higher' : 'Boost this trove in search results'}
                      >
                        <span className="trove-booster" aria-hidden="true">↑</span>
                      </button>
                    )}
                  </span>
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
                  <span className="trove-only-actions">
                    <button
                      type="button"
                      className="trove-only-link"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleTargetClick(t.id) }}
                      aria-label={`Search only ${t.name}`}
                      title="Only this trove"
                    >
                      <img src="/target.png" alt="" className="trove-only-icon" />
                    </button>
                    {searchMode === 'search' && (
                      <button
                        type="button"
                        className={`trove-only-link trove-only-link--boost${boostTroveId === t.id ? ' trove-only-link--boost-active' : ''}`}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleBoostClick(t.id) }}
                        aria-label={boostTroveId === t.id ? `Boost on for ${t.name} (results rank higher)` : `Boost ${t.name} in search results`}
                        title={boostTroveId === t.id ? 'Boost on — results from this trove rank higher' : 'Boost this trove in search results'}
                      >
                        <span className="trove-booster" aria-hidden="true">↑</span>
                      </button>
                    )}
                  </span>
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
                  setSearchParams(buildSearchParams('search', query, searchSelectedTroveIds, dupPrimaryTroveId, dupCompareTroveIds, uniqPrimaryTroveId, uniqCompareTroveIds, fileTypeFilters, boostTroveId, searchResultsViewMode), { replace: true })
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
                  const dupSelfCompare = dupCompareTroveIds.size === 1 && dupCompareTroveIds.has(dupPrimaryTroveId)
                  if (uniqEmpty && (dupPrimaryTroveId || dupCompareTroveIds.size) && !dupSelfCompare) {
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
                    onChange={(e) => { setQuery(e.target.value); setFreezeTroveListOrder(false) }}
                    onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setQuery(''); queryRef.current = ''; setSearchResult({ count: 0, results: [], page: 0, size: pageSize }) } }}
                    placeholder="e.g. Greek, Prince, Albanian, Alien — or * for all"
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
                        setFreezeTroveListOrder(false)
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
                      <span className="search-query-asterisk" aria-hidden="true">*</span>
                    </button>
                    <button
                      type="button"
                      className="search-query-btn search-query-btn-clear"
                      title="Clear"
                      onClick={() => {
                        setQuery('')
                        setFreezeTroveListOrder(false)
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
                {searchMode === 'search' && (allAvailableFileTypes.length >= 1 || fileTypeFilters.size > 0) && (() => {
                  const urlFileTypes = new Set(searchParams.getAll('fileTypes').filter((f) => f != null && f.trim()).map((f) => f.trim()))
                  const fileTypesForLabel = fileTypeFilters.size > 0 ? fileTypeFilters : urlFileTypes
                  const upper = (s) => (s || '').toUpperCase()
                  const availableUpper = new Set((allAvailableFileTypes || []).map(upper))
                  const selectedUpper = new Set([...fileTypesForLabel].map(upper))
                  const allSelected = availableUpper.size > 0 && availableUpper.size === selectedUpper.size && [...availableUpper].every((t) => selectedUpper.has(t))
                  const hasFileTypeFilter = fileTypesForLabel.size > 0 && !allSelected
                  return (
                  <div className="search-filetype-dropdown-wrap" ref={fileTypeDropdownRef}>
                    <div className={`search-filetype-trigger-wrap${hasFileTypeFilter ? ' search-filetype-trigger-wrap--filtered' : ''}`}>
                      <button
                        type="button"
                        className="search-filetype-dropdown-trigger"
                        onClick={() => setFileTypeDropdownOpen((o) => !o)}
                        aria-haspopup="listbox"
                        aria-expanded={fileTypeDropdownOpen}
                        aria-label="Filter by file type"
                      >
                        {fileTypesForLabel.size === 0
                          ? 'Select media'
                          : allSelected
                            ? 'Any media'
                            : (() => {
                                const groupNames = getFullySelectedGroupNames(fileTypesForLabel, allAvailableFileTypes)
                                const label = groupNames?.length > 0 ? groupNames.join(', ') : (getGroupNameIfFullySelected(fileTypesForLabel, allAvailableFileTypes) ?? [...fileTypesForLabel].sort().join(', '))
                                return `Only ${label}`
                              })()}
                      </button>
                      {fileTypesForLabel.size > 0 && (
                        <>
                          <span className="search-filetype-divider" aria-hidden="true" />
                          <button
                          type="button"
                          className="search-filetype-clear"
                          title="Clear file type filter"
                          onClick={(e) => {
                            e.stopPropagation()
                            skipFileTypeSearchRef.current = true
                            lastFileTypeOrViewSearchRef.current = Date.now()
                            setFileTypeFilters(new Set())
                            setSearchParams(buildSearchParams('search', query, searchSelectedTroveIds, dupPrimaryTroveId, dupCompareTroveIds, uniqPrimaryTroveId, uniqCompareTroveIds, new Set(), boostTroveId, searchResultsViewMode), { replace: true })
                            fetchSearch(0, null, null, null, null, new Set())
                          }}
                          aria-label="Clear file type filter"
                        >
                          ×
                        </button>
                        </>
                      )}
                    </div>
                    {fileTypeDropdownOpen && (
                      <div
                        className="search-filetype-dropdown-panel"
                        role="listbox"
                        aria-label="File type filter"
                      >
                        <div className="search-filetype-quick-actions">
                          <button
                            type="button"
                            className="search-filetype-quick-btn"
                            disabled={allSelected}
                            onClick={(e) => {
                              e.preventDefault()
                              skipFileTypeSearchRef.current = true
                              lastFileTypeOrViewSearchRef.current = Date.now()
                              const next = new Set(allAvailableFileTypes)
                              setFileTypeFilters(next)
                              setSearchParams(buildSearchParams('search', query, searchSelectedTroveIds, dupPrimaryTroveId, dupCompareTroveIds, uniqPrimaryTroveId, uniqCompareTroveIds, next, boostTroveId, searchResultsViewMode), { replace: true })
                              fetchSearch(0, null, null, null, null, next)
                            }}
                          >
                            <span className="search-filetype-quick-prefix search-filetype-quick-prefix--asterisk" aria-hidden="true">*</span> Any
                          </button>
                          <button
                            type="button"
                            className="search-filetype-quick-btn"
                            disabled={fileTypeFilters.size === 0}
                            onClick={(e) => {
                              e.preventDefault()
                              skipFileTypeSearchRef.current = true
                              lastFileTypeOrViewSearchRef.current = Date.now()
                              const next = new Set()
                              setFileTypeFilters(next)
                              setSearchParams(buildSearchParams('search', query, searchSelectedTroveIds, dupPrimaryTroveId, dupCompareTroveIds, uniqPrimaryTroveId, uniqCompareTroveIds, next, boostTroveId, searchResultsViewMode), { replace: true })
                              fetchSearch(0, null, null, null, null, next)
                            }}
                          >
                            <span className="search-filetype-quick-prefix" aria-hidden="true">×</span> Meh
                          </button>
                        </div>
                        {groupFileTypes(allAvailableFileTypes).map(({ group, types }) => {
                          const allSelected = types.every((ft) => fileTypeFilters.has(ft))
                          const someSelected = types.some((ft) => fileTypeFilters.has(ft))
                          return (
                          <div key={group ?? 'other'} className="search-filetype-group">
                            {group != null && (
                              <label className="search-filetype-group-header">
                                <input
                                  type="checkbox"
                                  ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
                                  checked={allSelected}
                                  onChange={() => {
                                    skipFileTypeSearchRef.current = true
                                    lastFileTypeOrViewSearchRef.current = Date.now()
                                    const next = new Set(fileTypeFilters)
                                    if (allSelected) types.forEach((t) => next.delete(t))
                                    else types.forEach((t) => next.add(t))
                                    setFileTypeFilters(next)
                                    setSearchParams(buildSearchParams('search', query, searchSelectedTroveIds, dupPrimaryTroveId, dupCompareTroveIds, uniqPrimaryTroveId, uniqCompareTroveIds, next, boostTroveId, searchResultsViewMode), { replace: true })
                                    fetchSearch(0, null, null, null, null, next)
                                  }}
                                />
                                {group}
                              </label>
                            )}
                            {types.map((ft) => (
                              <label key={ft} className="search-filetype-option">
                                <input
                                  type="checkbox"
                                  checked={fileTypeFilters.has(ft)}
                                  onChange={() => {
                                    skipFileTypeSearchRef.current = true
                                    lastFileTypeOrViewSearchRef.current = Date.now()
                                    const next = new Set(fileTypeFilters)
                                    if (next.has(ft)) next.delete(ft)
                                    else next.add(ft)
                                    setFileTypeFilters(next)
                                    setSearchParams(buildSearchParams('search', query, searchSelectedTroveIds, dupPrimaryTroveId, dupCompareTroveIds, uniqPrimaryTroveId, uniqCompareTroveIds, next, boostTroveId, searchResultsViewMode), { replace: true })
                                    fetchSearch(0, null, null, null, null, next)
                                  }}
                                />
                                {ft}
                              </label>
                            ))}
                          </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  )
                })()}
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
                <span>{searchMode === 'duplicates' ? 'Finding duplicates…' : 'Finding uniques…'}</span>
                <div
                  className="search-compare-progress-wrap"
                  role="progressbar"
                  aria-valuenow={compareProgress.total > 0 ? compareProgress.current : undefined}
                  aria-valuemin={0}
                  aria-valuemax={compareProgress.total > 0 ? compareProgress.total : undefined}
                  aria-label="Analysis progress"
                >
                  <div className="search-compare-progress-track">
                    <div
                      className={`search-compare-progress-bar ${compareProgress.total === 0 ? 'search-compare-progress-indeterminate' : ''}`}
                      style={compareProgress.total > 0 ? { width: `${(compareProgress.current / compareProgress.total) * 100}%` } : undefined}
                    />
                    {compareProgress.total > 0 && (
                      <span className="search-compare-progress-percent">{Math.round((compareProgress.current / compareProgress.total) * 100)}%</span>
                    )}
                  </div>
                  {compareProgress.total > 0 && (
                    <span className="search-compare-progress-count">{compareProgress.current} / {compareProgress.total}</span>
                  )}
                </div>
              </div>
            )}
            {searchMode === 'duplicates' && duplicatesResult != null && !searching && (() => {
              const total = duplicatesResult.total ?? 0
              const pageNum = duplicatesResult.page ?? 0
              const size = duplicatesResult.size ?? 50
              const rows = sortedDuplicateRows
              const totalPages = size > 0 ? Math.ceil(total / size) : 0
              const from = total === 0 ? 0 : pageNum * size + 1
              const to = Math.min((pageNum + 1) * size, total)
              const primaryName = troves.find((t) => t.id === primaryTroveId)?.name ?? primaryTroveId
              const compareNamesList = [...selectedTroveIds].map((id) => troves.find((t) => t.id === id)?.name ?? id).join(', ')
              const compareDisplay = compareNamesList.length < 50 ? compareNamesList : `${selectedTroveIds.size} troves`
              const compareSummary = selectedTroveIds.size === 1 && selectedTroveIds.has(primaryTroveId) ? <strong>Self-compare</strong> : <><strong>Compare:</strong> {compareDisplay}</>
              return (
                <>
                  <p className="search-count search-count-detail">
                    <><strong>Primary:</strong> {primaryName} · {compareSummary}. </>{formatCount(total)} {selectedTroveIds.size === 1 && selectedTroveIds.has(primaryTroveId) ? '' : 'primary '}item{total !== 1 ? 's' : ''} with possible duplicates.
                    {totalPages > 1 && ` Showing ${formatCount(from)}–${formatCount(to)}.`}
                  </p>
                  <div className="search-results-options">
                    <label className="page-size-label">
                      Size
                      <select
                        value={dupPageSize}
                        onChange={handleDupPageSizeChange}
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
                  </div>
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
              const from = total === 0 ? 0 : pageNum * size + 1
              const to = Math.min((pageNum + 1) * size, total)
              const primaryName = troves.find((t) => t.id === primaryTroveId)?.name ?? primaryTroveId
              const compareNamesList = [...selectedTroveIds].map((id) => troves.find((t) => t.id === id)?.name ?? id).join(', ')
              const compareDisplay = compareNamesList.length < 50 ? compareNamesList : `${selectedTroveIds.size} troves`
              const compareSummary = selectedTroveIds.size === 1 && selectedTroveIds.has(primaryTroveId) ? <strong>Self-compare</strong> : <><strong>Compare:</strong> {compareDisplay}</>
              return (
                <>
                  <p className="search-count search-count-detail">
                    <><strong>Primary:</strong> {primaryName} · {compareSummary}. </>{formatCount(total)} item{total !== 1 ? 's' : ''}{selectedTroveIds.size === 1 && selectedTroveIds.has(primaryTroveId) ? ' ' : ' in primary '}are either unique or have no obvious match.
                    {totalPages > 1 && ` Showing ${formatCount(from)}–${formatCount(to)}.`}
                  </p>
                  <div className="search-results-options">
                    <label className="page-size-label">
                      Size
                      <select
                        value={uniqPageSize}
                        onChange={handleUniqPageSizeChange}
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
                  </div>
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
                      showScoreColumn={query.trim() !== '*'}
                      viewMode={searchResultsViewMode}
                      afterFilterSlot={gallerySortAfterFilterSlot}
                      showPdfSashInGallery
                      showGalleryDecorations={galleryDecorate}
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
                    <span className="search-results-options-view-group">
                      <span className="view-mode-toggle" role="group" aria-label="Results view">
                        <span className="view-mode-label">View:</span>
                        <button
                          type="button"
                          className={`view-mode-btn ${searchResultsViewMode === 'list' ? 'view-mode-btn--active' : ''}`}
                          onClick={() => {
                            skipViewModeSearchRef.current = true
                            lastFileTypeOrViewSearchRef.current = Date.now()
                            setSearchResultsViewMode('list')
                          }}
                          aria-pressed={searchResultsViewMode === 'list'}
                        >
                          List
                        </button>
                        <button
                          type="button"
                          className={`view-mode-btn ${searchResultsViewMode === 'gallery' ? 'view-mode-btn--active' : ''}`}
                          onClick={() => {
                            skipViewModeSearchRef.current = true
                            lastFileTypeOrViewSearchRef.current = Date.now()
                            setSortBy('title')
                            setSortDir('asc')
                            setSearchResultsViewMode('gallery')
                            const q = queryRef.current
                            if (q.trim()) {
                              const pageNum = searchResult != null && typeof searchResult.page === 'number' ? searchResult.page : 0
                              fetchSearch(pageNum, null, null, 'title', 'asc')
                            }
                          }}
                          aria-pressed={searchResultsViewMode === 'gallery'}
                        >
                          Gallery
                        </button>
                      </span>
                      <span className={`gallery-decorate-wrap ${searchResultsViewMode !== 'gallery' ? 'gallery-decorate-wrap--hidden' : ''}`}>
                        <span className="gallery-decorate-label">Decorate</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={galleryDecorate}
                          aria-label="Show file type decorations on gallery items"
                          aria-hidden={searchResultsViewMode !== 'gallery'}
                          title={searchResultsViewMode === 'gallery' ? (galleryDecorate ? 'Hide decorations' : 'Show decorations') : undefined}
                          tabIndex={searchResultsViewMode === 'gallery' ? undefined : -1}
                          className={`gallery-decorate-toggle ${galleryDecorate ? 'gallery-decorate-toggle--on' : ''}`}
                          onClick={() => setGalleryDecorate((v) => !v)}
                        >
                          <span className="gallery-decorate-toggle-thumb" aria-hidden="true" />
                        </button>
                      </span>
                    </span>
                    <span className="search-results-options-pager-group">
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
                            Page{' '}
                            <input
                              type="text"
                              className="pagination-page-input"
                              value={searchPageInput}
                              onChange={(e) => setSearchPageInput(e.target.value)}
                              onKeyDown={(e) => handleSearchPageInputKeyDown(e, totalPages, pageNum)}
                              aria-label="Current page"
                            />{' '}
                            of {formatCount(totalPages)}
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
                    <label className="page-size-label">
                      {totalPages > 1 ? 'Size' : 'Page size'}
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
                    </span>
                  </div>
                  <SearchResultsGrid
                    data={results}
                    sortBy={sortBy}
                    sortDir={sortDir}
                    onSortChange={handleGridSortChange}
                    showScoreColumn={query.trim() !== '*'}
                    viewMode={searchResultsViewMode}
                    afterFilterSlot={gallerySortAfterFilterSlot}
                    hideTroveInGallery={selectedTroveIds.size === 1}
                    showPdfSashInGallery
                    showGalleryDecorations={galleryDecorate}
                  />
                </>
              )
            })()}
          </section>
        </main>
      </div>
      <hr className="backend-status-divider" />
      <footer className="app-footer">
        <div className="app-footer-row">
          <Link to="/about" className="app-footer-link">About</Link>
          <Link to={`/mobile${location.search}`} className="app-footer-link" onClick={() => sessionStorage.removeItem('morsorPreferDesktop')}>Mobile</Link>
        </div>
        <div className="app-footer-row">
          {message ? (
            <p className="backend-message" data-status={message.startsWith('Status: Backend is up') ? 'up' : 'down'}>
              {message}
              {cacheEntries > 0 && (
                <>
                  {' · '}
                  <button
                    type="button"
                    className="app-footer-link app-footer-clear-cache"
                    onClick={() => {
                      const headers = { ...getApiAuthHeaders() }
                      const token = getCsrfToken()
                      if (token) headers['X-XSRF-TOKEN'] = token
                      fetch('/api/cache/clear', { method: 'POST', credentials: 'include', headers })
                        .then((res) => { if (res.status === 401) { window.location.href = '/login'; return }; if (res.ok) refreshStatusMessage() })
                        .catch(() => {})
                    }}
                  >
                    Clear Cache
                  </button>
                </>
              )}
              {' · '}
              <button
                type="button"
                className="app-footer-link app-footer-clear-cache"
                onClick={async () => {
                  setReloadTrovesInProgress(true)
                  setReloadTrovesProgress({ current: 0, total: 0 })
                  const controller = new AbortController()
                  reloadAbortControllerRef.current = controller
                  const headers = { ...getApiAuthHeaders() }
                  const token = getCsrfToken()
                  if (token) headers['X-XSRF-TOKEN'] = token
                  try {
                    const res = await fetch('/api/troves/reload/stream', { method: 'POST', credentials: 'include', headers, signal: controller.signal })
                    if (res.status === 401) { window.location.href = '/login'; return }
                    if (!res.ok || !res.body) {
                      setReloadTrovesInProgress(false)
                      return
                    }
                    const reader = res.body.getReader()
                    const decoder = new TextDecoder()
                    let buffer = ''
                    while (true) {
                      const { value, done } = await reader.read()
                      if (done) break
                      buffer += decoder.decode(value, { stream: true })
                      const lines = buffer.split('\n')
                      buffer = lines.pop() ?? ''
                      for (const line of lines) {
                        if (!line.trim()) continue
                        try {
                          const data = JSON.parse(line)
                          if (data.type === 'progress') setReloadTrovesProgress({ current: data.current ?? 0, total: data.total ?? 0 })
                          else if (data.type === 'done') {
                            const r = await fetch('/api/troves', { credentials: 'include', headers: { ...getApiAuthHeaders() } })
                            if (r.ok) { const arr = await r.json(); if (Array.isArray(arr)) setTroves(arr) }
                            refreshStatusMessage()
                          }
                        } catch (_) {}
                      }
                    }
                  } catch (_) {}
                  setReloadTrovesProgress({ current: 0, total: 0 })
                  setReloadTrovesInProgress(false)
                }}
              >
                Reload Troves
              </button>
            </p>
          ) : <span />}
          <button
            type="button"
            className="app-footer-link app-footer-logout-btn"
            onClick={() => {
              performLogout()
                .then(() => { window.location.href = '/login' })
                .catch(() => { window.alert('Logout failed. Please try again.') })
            }}
          >
            Log Out
          </button>
        </div>
      </footer>
      {reloadTrovesInProgress && (
        <div className="reload-troves-overlay" role="dialog" aria-modal="true" aria-label="Reloading troves">
          <div className="reload-troves-popup">
            <p className="reload-troves-title">
              {reloadTrovesProgress.total > 0
                ? `Reloading ${reloadTrovesProgress.total} troves`
                : 'Reloading troves'}
            </p>
            <div className={`reload-troves-progress-wrap ${reloadTrovesProgress.total === 0 ? 'reload-troves-progress-indeterminate-wrap' : ''}`}>
              {reloadTrovesProgress.total > 0 ? (
                <>
                  <div className="reload-troves-progress-track">
                    <div
                      className="reload-troves-progress-fill"
                      style={{ width: `${Math.round((reloadTrovesProgress.current / reloadTrovesProgress.total) * 100)}%` }}
                    />
                    <span className="reload-troves-progress-percent">
                      {Math.round((reloadTrovesProgress.current / reloadTrovesProgress.total) * 100)}%
                    </span>
                  </div>
                  <span className="reload-troves-progress-count">
                    {reloadTrovesProgress.current} / {reloadTrovesProgress.total}
                  </span>
                </>
              ) : (
                <div className="reload-troves-progress-bar reload-troves-progress-indeterminate" />
              )}
            </div>
            <div className="reload-troves-actions">
              <button
                type="button"
                className="reload-troves-cancel-btn"
                onClick={() => reloadAbortControllerRef.current?.abort()}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
