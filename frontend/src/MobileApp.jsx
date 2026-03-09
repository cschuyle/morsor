import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import { Link, useSearchParams, useLocation } from 'react-router-dom'
import { getApiAuthHeaders } from './apiAuth'
import { getCsrfToken } from './getCsrfToken'
import { queryCache } from './queryCache'
import { formatCount, formatCacheBytes } from './formatCount'
import { groupFileTypes, getGroupNameIfFullySelected } from './fileTypeGroups'
import { SearchResultsGrid } from './SearchResultsGrid'
import { DuplicateResultsView } from './DuplicateResultsView'
import { UniquesResultsView } from './UniquesResultsView'
import './MobileApp.css'

const MOBILE_PAGE_SIZE = 100
const DUP_UNIQUES_PAGE_SIZE = 50

function MobileApp() {
  const [troves, setTroves] = useState([])
  const [searchMode, setSearchMode] = useState('search') // 'search' | 'duplicates' | 'uniques'
  const [selectedTroveIds, setSelectedTroveIds] = useState(() => new Set())
  const [dupPrimaryTroveId, setDupPrimaryTroveId] = useState('')
  const [dupCompareTroveIds, setDupCompareTroveIds] = useState(() => new Set())
  const [uniqPrimaryTroveId, setUniqPrimaryTroveId] = useState('')
  const [uniqCompareTroveIds, setUniqCompareTroveIds] = useState(() => new Set())
  const [trovePickerSubTab, setTrovePickerSubTab] = useState('primary') // 'primary' | 'compare' when dup/uniques
  const [freezeTroveListOrder, setFreezeTroveListOrder] = useState(false)
  const [boostTroveId, setBoostTroveId] = useState(null)
  const primaryTroveId = searchMode === 'duplicates' ? dupPrimaryTroveId : uniqPrimaryTroveId
  const compareTroveIds = searchMode === 'duplicates' ? dupCompareTroveIds : uniqCompareTroveIds
  const setPrimaryTroveId = searchMode === 'duplicates' ? setDupPrimaryTroveId : setUniqPrimaryTroveId
  const setCompareTroveIds = searchMode === 'duplicates' ? setDupCompareTroveIds : setUniqCompareTroveIds
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
  const [cacheEntries, setCacheEntries] = useState(0)
  const [compareProgress, setCompareProgress] = useState({ current: 0, total: 0 })
  const [reloadTrovesInProgress, setReloadTrovesInProgress] = useState(false)
  const [reloadTrovesProgress, setReloadTrovesProgress] = useState({ current: 0, total: 0 })
  const [fileTypeFilters, setFileTypeFilters] = useState(() => new Set())
  const [allAvailableFileTypes, setAllAvailableFileTypes] = useState([])
  const [fileTypeDropdownOpen, setFileTypeDropdownOpen] = useState(false)
  const [fileTypePanelRect, setFileTypePanelRect] = useState(null)
  const [searchResultsViewMode, setSearchResultsViewMode] = useState('list') // 'list' | 'gallery'
  const queryRef = useRef(query)
  const skipSearchRef = useRef(true)
  const abortRef = useRef(null)
  const reloadAbortControllerRef = useRef(null)
  const fileTypeDropdownRef = useRef(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  queryRef.current = query

  const isDupOrUniques = searchMode === 'duplicates' || searchMode === 'uniques'

  useLayoutEffect(() => {
    if (!fileTypeDropdownOpen) {
      setFileTypePanelRect(null)
      return
    }
    const el = fileTypeDropdownRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setFileTypePanelRect({ top: rect.bottom + 4, left: rect.left, width: rect.width })
  }, [fileTypeDropdownOpen])

  function urlTroveId(value, troveList) {
    if (!value || !troveList?.length) return value || null
    const t = troveList.find((x) => x.id === value || (x.name && x.name === value))
    return t ? t.id : value
  }

  // Restore query and trove selection from URL (bookmark / desktop↔mobile toggle).
  // Resolve trove names to ids when troves are loaded so state and URL use ids.
  useEffect(() => {
    const q = searchParams.get('q')
    setQuery(q != null ? q : '')
    const ftAll = searchParams.getAll('fileTypes')
    setFileTypeFilters(new Set(ftAll.filter((f) => f != null && f.trim()).map((f) => f.trim())))
    const mode = searchParams.get('mode')
    if (mode !== 'duplicates' && mode !== 'uniques') {
      setSearchMode('search')
      const troveIds = searchParams.getAll('trove').map((v) => urlTroveId(v, troves) ?? v).filter(Boolean)
      setSelectedTroveIds(new Set(troveIds))
      const boost = searchParams.get('boost')
      setBoostTroveId(boost != null && boost !== '' ? (urlTroveId(boost, troves) ?? boost) : null)
    } else {
      setSearchMode(mode)
      const primary = searchParams.get('primary') ?? ''
      const compareIds = searchParams.getAll('compare').map((v) => urlTroveId(v, troves) ?? v).filter(Boolean)
      const compare = new Set(compareIds)
      if (mode === 'duplicates') {
        setDupPrimaryTroveId(primary ? (urlTroveId(primary, troves) ?? primary) : '')
        setDupCompareTroveIds(compare)
      } else {
        setUniqPrimaryTroveId(primary ? (urlTroveId(primary, troves) ?? primary) : '')
        setUniqCompareTroveIds(compare)
      }
    }
  }, [searchParams, troves])

  function buildSearchParams(fileTypesSet = null) {
    const next = new URLSearchParams()
    if (searchMode !== 'search') next.set('mode', searchMode)
    const qTrim = (query ?? '').trim()
    if (qTrim) next.set('q', qTrim)
    if (searchMode === 'search') {
      Array.from(selectedTroveIds).map((id) => urlTroveId(id, troves) ?? id).filter(Boolean).forEach((id) => next.append('trove', id))
      const boostId = boostTroveId ? (urlTroveId(boostTroveId, troves) ?? boostTroveId) : null
      if (boostId) next.set('boost', boostId)
      const ft = fileTypesSet ?? fileTypeFilters
      ft.forEach((f) => next.append('fileTypes', f))
    } else if (searchMode === 'duplicates') {
      const primaryId = dupPrimaryTroveId ? (urlTroveId(dupPrimaryTroveId, troves) ?? dupPrimaryTroveId) : null
      if (primaryId) next.set('primary', primaryId)
      Array.from(dupCompareTroveIds).map((id) => urlTroveId(id, troves) ?? id).filter(Boolean).forEach((id) => next.append('compare', id))
    } else {
      const primaryId = uniqPrimaryTroveId ? (urlTroveId(uniqPrimaryTroveId, troves) ?? uniqPrimaryTroveId) : null
      if (primaryId) next.set('primary', primaryId)
      Array.from(uniqCompareTroveIds).map((id) => urlTroveId(id, troves) ?? id).filter(Boolean).forEach((id) => next.append('compare', id))
    }
    return next
  }

  function buildSearchParamsForMode(mode, primary, compare) {
    const next = new URLSearchParams()
    if (mode !== 'search') next.set('mode', mode)
    const qTrim = (query ?? '').trim()
    if (qTrim) next.set('q', qTrim)
    if (mode === 'search') {
      Array.from(selectedTroveIds).map((id) => urlTroveId(id, troves) ?? id).filter(Boolean).forEach((id) => next.append('trove', id))
      const boostId = boostTroveId ? (urlTroveId(boostTroveId, troves) ?? boostTroveId) : null
      if (boostId) next.set('boost', boostId)
    } else {
      const primaryId = primary ? (urlTroveId(primary, troves) ?? primary) : null
      if (primaryId) next.set('primary', primaryId)
      Array.from(compare).map((id) => urlTroveId(id, troves) ?? id).filter(Boolean).forEach((id) => next.append('compare', id))
    }
    return next
  }

  // Persist current tab, query, and trove selection to URL.
  // Skip writing when URL has params we haven't applied yet (e.g. initial load or desktop→mobile with query string).
  useEffect(() => {
    const urlMode = searchParams.get('mode')
    const urlHasDupUniquesMode = urlMode === 'duplicates' || urlMode === 'uniques'
    const urlHasPrimaryOrCompare = searchParams.get('primary') || searchParams.getAll('compare').length > 0
    const urlHasQuery = searchParams.get('q') != null && searchParams.get('q') !== ''
    const urlHasTrove = searchParams.getAll('trove').length > 0
    const stateNotYetSynced =
      (urlHasDupUniquesMode && searchMode === 'search') ||
      (urlHasPrimaryOrCompare && searchMode === 'duplicates' && !dupPrimaryTroveId && dupCompareTroveIds.size === 0) ||
      (urlHasPrimaryOrCompare && searchMode === 'uniques' && !uniqPrimaryTroveId && uniqCompareTroveIds.size === 0) ||
      (urlHasQuery && (query ?? '') === '') ||
      (urlHasTrove && searchMode === 'search' && selectedTroveIds.size === 0)
    if (stateNotYetSynced) return
    const next = buildSearchParams()
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [query, searchMode, selectedTroveIds, dupPrimaryTroveId, dupCompareTroveIds, uniqPrimaryTroveId, uniqCompareTroveIds, fileTypeFilters, boostTroveId, searchParams])

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
        setStatusMessage(base + cacheMsg)
        setCacheEntries(cache != null && typeof cache.entries === 'number' ? cache.entries : 0)
      })
      .catch(() => setStatusMessage('Status: Backend unreachable'))
  }

  function fetchSearch(pageNum, sortByOverride = null, sortDirOverride = null, fileTypesOverride = undefined) {
    const q = queryRef.current.trim()
    if (!q) {
      setSearchResult({ count: 0, results: [], page: 0, size: MOBILE_PAGE_SIZE })
      return
    }
    const sortBy = sortByOverride ?? searchSortBy
    const sortDir = sortDirOverride ?? searchSortDir
    const fileTypesToUse = fileTypesOverride !== undefined ? fileTypesOverride : fileTypeFilters
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
    if (boostTroveId) params.set('boostTrove', boostTroveId)
    if (fileTypesToUse && fileTypesToUse.size > 0) params.set('fileTypes', [...fileTypesToUse].sort().join(','))
    if (sortBy) {
      params.set('sortBy', sortBy)
      params.set('sortDir', sortDir)
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
    setSearching(true)
    fetch(url, { credentials: 'include', headers: { ...getApiAuthHeaders() } })
      .then((res) => {
        if (res.status === 401) { window.location.href = '/login'; return Promise.reject() }
        return res.ok ? res.json() : Promise.reject(new Error(res.statusText))
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
      .catch(() => setSearchResult({ count: 0, results: [], page: 0, size: MOBILE_PAGE_SIZE }))
      .finally(() => setSearching(false))
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
    const streamUrl = `/api/search/duplicates/stream?${params}`
    const restUrl = `/api/search/duplicates?${params}`
    const cached = queryCache.get(restUrl)
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
    setCompareProgress({ current: 0, total: 0 })
    readCompareStream(streamUrl, controller.signal, (current, total) => setCompareProgress({ current, total }), (data) => {
      queryCache.set(restUrl, data)
      setDuplicatesResult(data)
      setDuplicatesPage(pageNum)
      setCompareProgress({ current: 0, total: 0 })
      refreshStatusMessage()
    }).catch((err) => { if (err.name !== 'AbortError') setSearchError(err.message) }).finally(() => { setSearching(false); setCompareProgress({ current: 0, total: 0 }) })
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
    const streamUrl = `/api/search/uniques/stream?${params}`
    const restUrl = `/api/search/uniques?${params}`
    const cached = queryCache.get(restUrl)
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
    setCompareProgress({ current: 0, total: 0 })
    readCompareStream(streamUrl, controller.signal, (current, total) => setCompareProgress({ current, total }), (data) => {
      queryCache.set(restUrl, data)
      setUniquesResult(data)
      setUniquesPage(pageNum)
      setCompareProgress({ current: 0, total: 0 })
      refreshStatusMessage()
    }).catch((err) => { if (err.name !== 'AbortError') setSearchError(err.message) }).finally(() => { setSearching(false); setCompareProgress({ current: 0, total: 0 }) })
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
    if (isDupOrUniques) {
      if (!query.trim()) {
        queryRef.current = '*'
        setQuery('*')
      }
      setPrimaryTroveId(troveId)
      setCompareTroveIds(new Set())
      setShowTrovePicker(false)
    } else {
      setFreezeTroveListOrder(true)
      setBoostTroveId((prev) => (prev === troveId ? null : troveId))
      if (!query.trim()) {
        queryRef.current = '*'
        setQuery('*')
      }
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
    setFreezeTroveListOrder(false)
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
  const displaySelectedTroveIds = useMemo(() => {
    if (searchMode !== 'search' || selectedTroveIds.size > 0) return selectedTroveIds
    if (!Array.isArray(results) || results.length === 0) return selectedTroveIds
    const troveCounts = searchResult?.troveCounts
    if (troveCounts != null && typeof troveCounts === 'object') {
      return new Set(Object.keys(troveCounts).filter((id) => (troveCounts[id] ?? 0) > 0))
    }
    return new Set(results.map((r) => r?.troveId).filter(Boolean))
  }, [searchMode, selectedTroveIds, searchResult?.troveCounts, results])
  const troveLabel = isDupOrUniques
    ? (primaryTroveId
        ? <><strong>Primary:</strong> {troves.find((t) => t.id === primaryTroveId)?.name ?? primaryTroveId} · {compareTroveIds.size === 1 && compareTroveIds.has(primaryTroveId) ? <strong>Self-compare</strong> : <><strong>Compare:</strong> {formatCount(compareTroveIds.size)}</>}</>
        : 'Set primary & compare troves')
    : (selectedTroveIds.size === 0 ? 'All troves' : `${formatCount(selectedTroveIds.size)} trove${selectedTroveIds.size !== 1 ? 's' : ''}`)
  const filteredTroves = troves.filter((t) => {
    const q = trovePickerFilter.trim().toLowerCase()
    return !q || (t.name && t.name.toLowerCase().includes(q))
  })
  const sortByName = (a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
  const mobileSearchTrovesWithResults = useMemo(() => {
    if (searchMode !== 'search') return { selected: [], notSelected: [...filteredTroves].sort(sortByName) }
    if (freezeTroveListOrder) return { selected: [], notSelected: [...filteredTroves].sort(sortByName) }
    const troveCounts = searchResult?.troveCounts != null && typeof searchResult.troveCounts === 'object' ? searchResult.troveCounts : null
    const sortByHitsDesc =
      troveCounts != null
        ? (a, b) => {
            if (searchMode === 'search' && boostTroveId && a.id === boostTroveId && b.id !== boostTroveId) return -1
            if (searchMode === 'search' && boostTroveId && b.id === boostTroveId && a.id !== boostTroveId) return 1
            const c = (troveCounts[b.id] ?? 0) - (troveCounts[a.id] ?? 0)
            return c !== 0 ? c : sortByName(a, b)
          }
        : sortByName
    const selected = [...filteredTroves.filter((t) => displaySelectedTroveIds.has(t.id))].sort(sortByHitsDesc)
    const notSelected = [...filteredTroves.filter((t) => !displaySelectedTroveIds.has(t.id))].sort(sortByName)
    return { selected, notSelected }
  }, [searchMode, filteredTroves, displaySelectedTroveIds, freezeTroveListOrder, boostTroveId, searchResult?.troveCounts])

  return (
    <div className="mobile-app">
      <header className="mobile-header">
        <Link to="/mobile" className="mobile-brand">Morsor</Link>
        <Link to="/mobile/about" className="mobile-nav-link">About</Link>
      </header>

      <main className={`mobile-main${fileTypeDropdownOpen ? ' mobile-filetype-dropdown-open' : ''}`}>
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
              const dupEmpty = !dupPrimaryTroveId && !dupCompareTroveIds.size
              if (dupEmpty && (uniqPrimaryTroveId || uniqCompareTroveIds.size)) {
                setDupPrimaryTroveId(uniqPrimaryTroveId)
                setDupCompareTroveIds(new Set(uniqCompareTroveIds))
                setSearchParams(buildSearchParamsForMode('duplicates', uniqPrimaryTroveId, uniqCompareTroveIds), { replace: true })
              } else {
                setSearchParams(buildSearchParamsForMode('duplicates', dupPrimaryTroveId, dupCompareTroveIds), { replace: true })
              }
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
              const uniqEmpty = !uniqPrimaryTroveId && !uniqCompareTroveIds.size
              const dupSelfCompare = dupCompareTroveIds.size === 1 && dupCompareTroveIds.has(dupPrimaryTroveId)
              if (uniqEmpty && (dupPrimaryTroveId || dupCompareTroveIds.size) && !dupSelfCompare) {
                setUniqPrimaryTroveId(dupPrimaryTroveId)
                setUniqCompareTroveIds(new Set(dupCompareTroveIds))
                setSearchParams(buildSearchParamsForMode('uniques', dupPrimaryTroveId, dupCompareTroveIds), { replace: true })
              } else {
                setSearchParams(buildSearchParamsForMode('uniques', uniqPrimaryTroveId, uniqCompareTroveIds), { replace: true })
              }
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
              onChange={(e) => { setQuery(e.target.value); setFreezeTroveListOrder(false) }}
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
                  setFreezeTroveListOrder(false)
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
                  setFreezeTroveListOrder(false)
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

        {isDupOrUniques && (!primaryTroveId || compareTroveIds.size === 0) && !searching && (
          <p className="mobile-search-hint">Select primary trove and at least one compare trove. Use * for all items.</p>
        )}
        {isDupOrUniques && searching && (
          <div className="mobile-search-loading" aria-live="polite" aria-busy="true">
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

        <div className="mobile-troves-row">
          <span className="mobile-troves-label">
            {searchMode === 'search' && searchResult != null && count > 0 && (
              <>{formatCount(count)} item{count !== 1 ? 's' : ''} · </>
            )}
            {searchMode === 'duplicates' && duplicatesResult != null && (() => {
              const total = duplicatesResult.total ?? 0
              const selfCompare = compareTroveIds.size === 1 && compareTroveIds.has(primaryTroveId)
              const name = troves.find((t) => t.id === primaryTroveId)?.name ?? primaryTroveId
              if (selfCompare && total > 0) return <>{name} · <strong>Self-compare</strong>. {formatCount(total)} item{total !== 1 ? 's' : ''} with possible duplicates.</>
              if (total > 0) return <>{formatCount(total)} dups · </>
              return null
            })()}
            {searchMode === 'uniques' && uniquesResult != null && (uniquesResult.total ?? 0) > 0 && (
              <>{formatCount(uniquesResult.total)} uniques · </>
            )}
            {searchMode === 'uniques' && compareTroveIds.size === 1 && compareTroveIds.has(primaryTroveId) && (
              <span className="mobile-search-error" role="alert">Primary trove cannot be in compare list.</span>
            )}
            {!(searchMode === 'duplicates' && duplicatesResult != null && (duplicatesResult.total ?? 0) > 0 && compareTroveIds.size === 1 && compareTroveIds.has(primaryTroveId)) && !(searchMode === 'uniques' && compareTroveIds.size === 1 && compareTroveIds.has(primaryTroveId)) && troveLabel}
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
            <div className="mobile-trove-clear-row">
              <button type="button" onClick={clearTroves} className="mobile-trove-clear">Clear all</button>
              {searchMode === 'duplicates' && (
                <button
                  type="button"
                  className="mobile-trove-clear"
                  onClick={() => { if (primaryTroveId) setCompareTroveIds(new Set([primaryTroveId])) }}
                  disabled={!primaryTroveId}
                  aria-label="Compare to self"
                >
                  Compare to self
                </button>
              )}
            </div>
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
                      <button type="button" className="mobile-trove-only-link" onClick={(e) => { e.preventDefault(); setPrimary(t.id); setShowTrovePicker(false) }} aria-label={`Set primary: ${t.name}`} title="Only this trove"><img src="/target.png" alt="" className="mobile-trove-only-icon" /><span className="trove-booster" aria-hidden="true">↑</span></button>
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
                  : (() => {
                      const { selected, notSelected } = mobileSearchTrovesWithResults
                      const renderTrove = (t) => {
                        const resultCount =
                          searchResult != null
                            ? (searchResult.troveCounts != null && typeof searchResult.troveCounts === 'object'
                              ? (searchResult.troveCounts[t.id] ?? 0)
                              : (Array.isArray(results) ? results.filter((r) => r.troveId === t.id).length : 0))
                            : 0
                        return (
                          <li key={t.id} className={`mobile-trove-item${selectedTroveIds.has(t.id) ? ' mobile-trove-item--selected' : ''}${searchResult != null && resultCount > 0 ? ' mobile-trove-item--has-results' : ''}`}>
                            <label className="mobile-trove-label">
                              <input type="checkbox" checked={selectedTroveIds.has(t.id)} onChange={() => toggleTrove(t.id)} />
                              <span>
                                {t.name} ({searchResult != null ? `${formatCount(resultCount)}/${formatCount(t.count ?? 0)}` : formatCount(t.count ?? 0)})
                              </span>
                            </label>
                            {(selectedTroveIds.size !== 1 || !selectedTroveIds.has(t.id)) && (
                              <button type="button" className={`mobile-trove-only-link${boostTroveId === t.id ? ' mobile-trove-only-link--boost-active' : ''}`} onClick={(e) => { e.preventDefault(); handleOnlyClick(t.id) }} aria-label={boostTroveId === t.id ? `Boost on for ${t.name}` : `Boost ${t.name} in search results`} title={boostTroveId === t.id ? 'Boost on — results from this trove rank higher' : 'Boost this trove in search results'}><img src="/target.png" alt="" className="mobile-trove-only-icon" /><span className="trove-booster" aria-hidden="true">↑</span></button>
                            )}
                          </li>
                        )
                      }
                      return (
                        <>
                          {selected.map(renderTrove)}
                          {selected.length > 0 && notSelected.length > 0 && (
                            <li className="mobile-trove-list-separator" aria-hidden="true">
                              <hr className="mobile-trove-separator" />
                            </li>
                          )}
                          {notSelected.map(renderTrove)}
                        </>
                      )
                    })()
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
              <div className={`mobile-search-results-grid${fileTypeDropdownOpen ? ' mobile-filetype-dropdown-open' : ''}`}>
                <div className="mobile-view-mode-row">
                  <span className="mobile-view-mode-toggle" role="group" aria-label="Results view">
                    <button
                      type="button"
                      className={`mobile-view-mode-btn ${searchResultsViewMode === 'list' ? 'mobile-view-mode-btn--active' : ''}`}
                      onClick={() => setSearchResultsViewMode('list')}
                      aria-pressed={searchResultsViewMode === 'list'}
                    >
                      List
                    </button>
                    <button
                      type="button"
                      className={`mobile-view-mode-btn ${searchResultsViewMode === 'gallery' ? 'mobile-view-mode-btn--active' : ''}`}
                      onClick={() => setSearchResultsViewMode('gallery')}
                      aria-pressed={searchResultsViewMode === 'gallery'}
                    >
                      Gallery
                    </button>
                  </span>
                </div>
                <SearchResultsGrid
                  data={results}
                  sortBy={searchSortBy}
                  sortDir={searchSortDir}
                  onSortChange={(col, dir) => fetchSearch(0, col, dir)}
                  showScoreColumn={query.trim() !== '*'}
                  viewMode={searchResultsViewMode}
                  afterFilterSlot={allAvailableFileTypes.length >= 1 ? (() => {
                    const upper = (s) => (s || '').toUpperCase()
                    const availableUpper = new Set((allAvailableFileTypes || []).map(upper))
                    const selectedUpper = new Set([...fileTypeFilters].map(upper))
                    const allSelected = availableUpper.size > 0 && availableUpper.size === selectedUpper.size && [...availableUpper].every((t) => selectedUpper.has(t))
                    const hasFileTypeFilter = fileTypeFilters.size > 0 && !allSelected
                    return (
                    <div className="mobile-filetype-dropdown-wrap" ref={fileTypeDropdownRef}>
                      <div className={`mobile-filetype-trigger-wrap${hasFileTypeFilter ? ' mobile-filetype-trigger-wrap--filtered' : ''}`}>
                        <button
                          type="button"
                          className="mobile-filetype-trigger"
                          onClick={() => setFileTypeDropdownOpen((o) => !o)}
                          aria-haspopup="listbox"
                          aria-expanded={fileTypeDropdownOpen}
                          aria-label="Filter by file type"
                        >
                          {fileTypeFilters.size === 0
                            ? 'Media: All'
                            : (() => {
                                if (allSelected) return 'Media: All'
                                if (fileTypeFilters.size === 1) return `Only ${[...fileTypeFilters][0]}`
                                const groupName = getGroupNameIfFullySelected(fileTypeFilters, allAvailableFileTypes)
                                return groupName ? `Only ${groupName}` : `${fileTypeFilters.size} types selected`
                              })()}
                        </button>
                        {fileTypeFilters.size > 0 && (
                          <>
                            <span className="mobile-filetype-divider" aria-hidden="true" />
                            <button
                              type="button"
                              className="mobile-filetype-clear"
                              title="Clear file type filter"
                              onClick={(e) => {
                                e.stopPropagation()
                                setFileTypeFilters(new Set())
                                setSearchParams(buildSearchParams(new Set()), { replace: true })
                                fetchSearch(0, null, null, new Set())
                              }}
                              aria-label="Clear file type filter"
                            >
                              ×
                            </button>
                          </>
                        )}
                      </div>
                      {fileTypeDropdownOpen && fileTypePanelRect && (
                        <div
                          className="mobile-filetype-panel mobile-filetype-panel--fixed"
                          role="listbox"
                          aria-label="File type filter"
                          style={{ position: 'fixed', top: fileTypePanelRect.top, left: fileTypePanelRect.left, width: fileTypePanelRect.width, zIndex: 1100 }}
                        >
                          {groupFileTypes(allAvailableFileTypes).map(({ group, types }) => {
                            const allSelected = types.every((ft) => fileTypeFilters.has(ft))
                            const someSelected = types.some((ft) => fileTypeFilters.has(ft))
                            return (
                            <div key={group ?? 'other'} className="mobile-filetype-group">
                              {group != null && (
                                <label className="mobile-filetype-group-header">
                                  <input
                                    type="checkbox"
                                    ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
                                    checked={allSelected}
                                    onChange={() => {
                                      const next = new Set(fileTypeFilters)
                                      if (allSelected) types.forEach((t) => next.delete(t))
                                      else types.forEach((t) => next.add(t))
                                      setFileTypeFilters(next)
                                      setSearchParams(buildSearchParams(next), { replace: true })
                                      fetchSearch(0, null, null, next)
                                    }}
                                  />
                                  {group}
                                </label>
                              )}
                              {types.map((ft) => (
                                <label key={ft} className="mobile-filetype-option">
                                  <input
                                    type="checkbox"
                                    checked={fileTypeFilters.has(ft)}
                                    onChange={() => {
                                      const next = new Set(fileTypeFilters)
                                      if (next.has(ft)) next.delete(ft)
                                      else next.add(ft)
                                      setFileTypeFilters(next)
                                      setSearchParams(buildSearchParams(next), { replace: true })
                                      fetchSearch(0, null, null, next)
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
                  ); })() : null}
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
          <p className="mobile-status-message" role="status">
            {statusMessage}
            {cacheEntries > 0 && (
              <>
                {' · '}
                <button
                  type="button"
                  className="mobile-footer-link mobile-clear-cache-btn"
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
              className="mobile-footer-link mobile-clear-cache-btn"
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
        )}
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
        <div className="mobile-footer-row">
          <Link to={location.search ? `/?${location.search.slice(1)}` : '/'} className="mobile-footer-link" onClick={() => sessionStorage.setItem('morsorPreferDesktop', 'true')}>Desktop site</Link>
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
