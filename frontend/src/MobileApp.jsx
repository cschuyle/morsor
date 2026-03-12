import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import { Link, useSearchParams, useLocation } from 'react-router-dom'
import { getApiAuthHeaders } from './apiAuth'
import { getCsrfToken } from './getCsrfToken'
import { performLogout } from './performLogout'
import { queryCache } from './queryCache'
import { formatCount } from './formatCount'
import { groupFileTypes, getGroupNameIfFullySelected, ALL_KNOWN_FILE_TYPES } from './fileTypeGroups'
import { SearchResultsGrid } from './SearchResultsGrid'
import { DuplicateResultsView } from './DuplicateResultsView'
import { UniquesResultsView } from './UniquesResultsView'
import './MobileApp.css'

const MOBILE_PAGE_SIZE = 100
const MOBILE_PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250, 500]
const DUP_UNIQUES_PAGE_SIZE = 50
const AMAZON_PLACEHOLDER_THUMB = 'https://m.media-amazon.com/images/I/01RmK+J4pJL._SS135_.gif'

function hasUsableThumbnail(row) {
  const thumbnailUrl = row?.thumbnailUrl
  if (!thumbnailUrl || !String(thumbnailUrl).trim()) return false
  const normalized = String(thumbnailUrl).trim()
  return normalized !== AMAZON_PLACEHOLDER_THUMB && !normalized.includes('/no_image')
}

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
  const [mobileSearchPageInput, setMobileSearchPageInput] = useState('')
  const [showTrovePicker, setShowTrovePicker] = useState(false)
  const [trovePickerFilter, setTrovePickerFilter] = useState('')
  const [searchError, setSearchError] = useState(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [statusTooltip, setStatusTooltip] = useState('')
  const [cacheEntries, setCacheEntries] = useState(0)
  const [cacheLabel, setCacheLabel] = useState('')
  const [compareProgress, setCompareProgress] = useState({ current: 0, total: 0 })
  const [reloadTrovesInProgress, setReloadTrovesInProgress] = useState(false)
  const [reloadTrovesProgress, setReloadTrovesProgress] = useState({ current: 0, total: 0 })
  const [fileTypeFilters, setFileTypeFilters] = useState(() => {
    const ftAll = new URLSearchParams(window.location.search).getAll('fileTypes')
    return new Set(ftAll.filter((f) => f != null && f.trim()).map((f) => f.trim()))
  })
  const [allAvailableFileTypes, setAllAvailableFileTypes] = useState([])
  const [fileTypeDropdownOpen, setFileTypeDropdownOpen] = useState(false)
  const [fileTypePanelRect, setFileTypePanelRect] = useState(null)
  const [searchResultsViewMode, setSearchResultsViewMode] = useState('list') // 'list' | 'gallery'
  const [galleryDecorate, setGalleryDecorate] = useState(true)
  const [copiedUrlFlare, setCopiedUrlFlare] = useState(false)
  const [shareIconFlash, setShareIconFlash] = useState(false)
  const [pageSize, setPageSize] = useState(() => {
    const p = new URLSearchParams(window.location.search)
    const s = Number(p.get('size'))
    return Number.isFinite(s) && s > 0 ? s : MOBILE_PAGE_SIZE
  })
  const queryRef = useRef(query)
  const skipSearchRef = useRef(true)
  const skipFileTypeSearchRef = useRef(false)
  const skipViewModeSearchRef = useRef(false)
  const lastFileTypeOrViewSearchRef = useRef(0)
  const abortRef = useRef(null)
  const reloadAbortControllerRef = useRef(null)
  const fileTypeDropdownRef = useRef(null)
  const copyFlareTimeoutRef = useRef(null)
  const mobileMainRef = useRef(null)
  const [mobileMainGapTopOpen, setMobileMainGapTopOpen] = useState(true)
  const [mobileMainGapBottomOpen, setMobileMainGapBottomOpen] = useState(false)
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
      const view = searchParams.get('view')
      setSearchResultsViewMode(view === 'gallery' ? 'gallery' : 'list')
      const pageParam = Number(searchParams.get('page'))
      setPage(Number.isFinite(pageParam) && pageParam > 0 ? pageParam - 1 : 0)
      const sizeParam = Number(searchParams.get('size'))
      if (Number.isFinite(sizeParam) && sizeParam > 0) setPageSize(sizeParam)
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

  function buildSearchParams(fileTypesSet = null, searchTrovesOverride = null, boostOverride = undefined) {
    const next = new URLSearchParams()
    if (searchMode !== 'search') next.set('mode', searchMode)
    const qTrim = (query ?? '').trim()
    if (qTrim) next.set('q', qTrim)
    if (searchMode === 'search') {
      const trovesToUse = searchTrovesOverride !== null ? searchTrovesOverride : selectedTroveIds
      Array.from(trovesToUse).map((id) => urlTroveId(id, troves) ?? id).filter(Boolean).forEach((id) => next.append('trove', id))
      const boostId = boostOverride === undefined ? (boostTroveId ? (urlTroveId(boostTroveId, troves) ?? boostTroveId) : null) : (boostOverride ? (urlTroveId(boostOverride, troves) ?? boostOverride) : null)
      if (boostId) next.set('boost', boostId)
      const ft = fileTypesSet ?? fileTypeFilters
      ft.forEach((f) => next.append('fileTypes', f))
      next.set('view', searchResultsViewMode === 'gallery' ? 'gallery' : 'list')
      const existingPage = searchParams.get('page')
      if (existingPage != null) next.set('page', existingPage)
      const existingSize = searchParams.get('size')
      if (existingSize != null) next.set('size', existingSize)
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
      next.set('view', searchResultsViewMode === 'gallery' ? 'gallery' : 'list')
    } else {
      const primaryId = primary ? (urlTroveId(primary, troves) ?? primary) : null
      if (primaryId) next.set('primary', primaryId)
      Array.from(compare).map((id) => urlTroveId(id, troves) ?? id).filter(Boolean).forEach((id) => next.append('compare', id))
    }
    return next
  }

  // Persist current tab, query, trove selection, view, and search pagination to URL.
  // Skip writing when URL has params we haven't applied yet (e.g. initial load or desktop→mobile with query string).
  useEffect(() => {
    const urlMode = searchParams.get('mode')
    const urlHasDupUniquesMode = urlMode === 'duplicates' || urlMode === 'uniques'
    const urlHasPrimaryOrCompare = searchParams.get('primary') || searchParams.getAll('compare').length > 0
    const urlHasQuery = searchParams.get('q') != null && searchParams.get('q') !== ''
    const urlHasTrove = searchParams.getAll('trove').length > 0
    const urlHasFileTypes = searchParams.getAll('fileTypes').length > 0
    const stateNotYetSynced =
      (urlHasDupUniquesMode && searchMode === 'search') ||
      (urlHasPrimaryOrCompare && searchMode === 'duplicates' && !dupPrimaryTroveId && dupCompareTroveIds.size === 0) ||
      (urlHasPrimaryOrCompare && searchMode === 'uniques' && !uniqPrimaryTroveId && uniqCompareTroveIds.size === 0) ||
      (urlHasQuery && (query ?? '') === '') ||
      (urlHasTrove && searchMode === 'search' && selectedTroveIds.size === 0) ||
      (urlHasFileTypes && searchMode === 'search' && fileTypeFilters.size === 0)
    if (stateNotYetSynced) return
    const next = buildSearchParams()
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [query, searchMode, selectedTroveIds, dupPrimaryTroveId, dupCompareTroveIds, uniqPrimaryTroveId, uniqCompareTroveIds, fileTypeFilters, boostTroveId, searchResultsViewMode, searchResult?.page, searchResult?.size, page, pageSize, searchParams])

  // Keep mobile search page input in sync with the current page (1-based)
  useEffect(() => {
    if (searchMode !== 'search') return
    setMobileSearchPageInput(String(page + 1))
  }, [searchMode, page])

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
        const base = data.status === 'UP' ? 'Server OK' : `Server: ${data.status}`
        const cache = data.cache
        const cacheMsg = (() => {
          if (cache == null || typeof cache.estimatedBytes !== 'number' || !Number.isFinite(cache.estimatedBytes)) return ''
          const b = cache.estimatedBytes
          if (b === 0) return ' · cache empty'
          const mb = 1024 * 1024
          const gb = 1024 * mb
          const rounded = b >= gb ? `${Math.round(b / gb)}gb` : b >= mb ? `${Math.round(b / mb)}mb` : `${Math.round(b / 1024)}kb`
          return ` · cache ${rounded}`
        })()
        setStatusMessage(base)
        setStatusTooltip(data.status ?? '')
        setCacheLabel(cacheMsg ? cacheMsg.replace(/^ · /, '') : '')
        setCacheEntries(cache != null && typeof cache.entries === 'number' ? cache.entries : 0)
      })
      .catch(() => {
        setStatusMessage('Server AWOL')
        setStatusTooltip('AWOL')
        setCacheLabel('')
      })
  }

  function fetchSearch(pageNum, sortByOverride = null, sortDirOverride = null, fileTypesOverride = undefined, sizeOverride = undefined) {
    const size = sizeOverride ?? pageSize
    const q = queryRef.current.trim()
    if (!q) {
      setSearchResult({ count: 0, results: [], page: 0, size })
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
      size: String(size),
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
      .catch(() => setSearchResult({ count: 0, results: [], page: 0, size }))
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
    return () => {
      if (copyFlareTimeoutRef.current) clearTimeout(copyFlareTimeoutRef.current)
    }
  }, [])
  useEffect(() => {
    if (searchResult?.results?.length > 0) {
      setShareIconFlash(true)
      const t = setTimeout(() => setShareIconFlash(false), 280)
      return () => clearTimeout(t)
    }
  }, [searchResult])
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
    if (skipFileTypeSearchRef.current) {
      skipFileTypeSearchRef.current = false
      return
    }
    if (skipViewModeSearchRef.current) {
      skipViewModeSearchRef.current = false
      return
    }
    if (Date.now() - lastFileTypeOrViewSearchRef.current < 600) return
    const t = setTimeout(() => {
      const pageParam = Number(searchParams.get('page'))
      const initialPage = Number.isFinite(pageParam) && pageParam > 0 ? pageParam - 1 : 0
      setPage(initialPage)
      const urlFileTypes = new Set(searchParams.getAll('fileTypes').filter((f) => f != null && f.trim()).map((f) => f.trim()))
      const fileTypesToUse = fileTypeFilters.size > 0 ? undefined : (urlFileTypes.size > 0 ? urlFileTypes : undefined)
      fetchSearch(initialPage, null, null, fileTypesToUse)
    }, 300)
    return () => clearTimeout(t)
  }, [searchMode, selectedTroveIds, searchParams])

  useEffect(() => {
    setFreezeTroveListOrder(false)
  }, [searchMode])

  const prevBoostTroveIdRef = useRef(undefined)

  function updateMobileMainGapState() {
    const el = mobileMainRef.current
    if (!el) return
    const epsilon = 8
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight)
    if (maxScroll <= epsilon) {
      setMobileMainGapTopOpen(true)
      setMobileMainGapBottomOpen(true)
      return
    }
    const atTop = el.scrollTop <= epsilon
    const atBottom = (el.scrollTop + el.clientHeight) >= (el.scrollHeight - epsilon)
    setMobileMainGapTopOpen(atTop)
    setMobileMainGapBottomOpen(atBottom)
  }

  useEffect(() => {
    const id = window.requestAnimationFrame(updateMobileMainGapState)
    return () => window.cancelAnimationFrame(id)
  }, [
    searchMode,
    showTrovePicker,
    fileTypeDropdownOpen,
    searching,
    page,
    duplicatesPage,
    uniquesPage,
    searchResult?.count,
    duplicatesResult?.count,
    uniquesResult?.count,
  ])
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
    const next = new Set(selectedTroveIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedTroveIds(next)
    // Keep URL trove params in lockstep with picker changes.
    setSearchParams(buildSearchParams(null, next), { replace: true })
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
      setSearchParams(buildSearchParamsForMode(searchMode, '', new Set()), { replace: true })
    } else {
      setSelectedTroveIds(new Set())
      setBoostTroveId(null)
      setSearchParams(buildSearchParams(null, new Set(), null), { replace: true })
    }
  }

  function handleBoostClick(troveId) {
    if (!isDupOrUniques) {
      setFreezeTroveListOrder(true)
      setBoostTroveId((prev) => (prev === troveId ? null : troveId))
      if (!query.trim()) {
        queryRef.current = '*'
        setQuery('*')
      }
      setPage(0)
    }
  }

  function handleTargetClick(troveId) {
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
      setSelectedTroveIds(new Set([troveId]))
      setSearchParams(buildSearchParams(null, new Set([troveId])), { replace: true })
      if (!query.trim()) {
        queryRef.current = '*'
        setQuery('*')
      }
      setPage(0)
      fetchSearch(0)
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
    setPage(0)
    const nextParams = buildSearchParams()
    nextParams.set('page', '1')
    nextParams.set('size', String(pageSize))
    setSearchParams(nextParams, { replace: true })
    fetchSearch(0)
  }

  function goToPage(nextPage) {
    fetchSearch(nextPage)
    setPage(nextPage)
    const nextParams = buildSearchParams()
    nextParams.set('page', String(nextPage + 1))
    nextParams.set('size', String(pageSize))
    setSearchParams(nextParams, { replace: true })
  }

  function handlePageSizeChange(e) {
    const newSize = Number(e.target.value)
    setPageSize(newSize)
    if (searchResult != null && query.trim()) fetchSearch(0, null, null, undefined, newSize)
    const nextParams = buildSearchParams()
    nextParams.set('size', String(newSize))
    nextParams.set('page', '1')
    setSearchParams(nextParams, { replace: true })
    setPage(0)
  }

  function handleGalleryDecorateToggle() {
    setGalleryDecorate((v) => !v)
    // Preserve current pagination while toggling gallery decorations.
    const nextParams = buildSearchParams()
    nextParams.set('page', String(page + 1))
    nextParams.set('size', String(pageSize))
    setSearchParams(nextParams, { replace: true })
    setMobileSearchPageInput(String(page + 1))
  }

  function handleMobileSearchPageInputKeyDown(e, totalPages, currentPage) {
    if (e.key !== 'Enter') return
    const raw = e.currentTarget.value.trim()
    const num = Number(raw)
    if (!Number.isFinite(num)) {
      setMobileSearchPageInput(String(currentPage + 1))
      return
    }
    const clamped = Math.min(Math.max(1, num), totalPages || 1)
    setMobileSearchPageInput(String(clamped))
    if (clamped - 1 !== currentPage) {
      goToPage(clamped - 1)
    }
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
  const searchSize = typeof searchResult?.size === 'number' ? searchResult.size : pageSize
  const totalPages = Math.ceil(count / searchSize) || 0
  const showMobileViewModeToggle = useMemo(
    () => Array.isArray(results) && results.some((row) => row?.itemType === 'littlePrinceItem' && hasUsableThumbnail(row)),
    [results]
  )
  const effectiveSearchResultsViewMode = showMobileViewModeToggle ? searchResultsViewMode : 'list'
  const showSearchPaginationControls = totalPages > 1
  const displayFileTypes = useMemo(() => {
    const upper = (s) => (s || '').toUpperCase()
    const seen = new Set(ALL_KNOWN_FILE_TYPES.map(upper))
    const out = [...ALL_KNOWN_FILE_TYPES]
    ;(allAvailableFileTypes || []).forEach((t) => {
      if (!seen.has(upper(t))) {
        seen.add(upper(t))
        out.push(t)
      }
    })
    return out.sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }))
  }, [allAvailableFileTypes])
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
  const mobileTroveDropdownLabel = (() => {
    if (searchMode === 'search') {
      const itemsPart = searchResult != null && count > 0 ? `${formatCount(count)} item${count !== 1 ? 's' : ''} · ` : ''
      const trovePart = selectedTroveIds.size === 0 ? 'All troves' : `${formatCount(selectedTroveIds.size)} trove${selectedTroveIds.size !== 1 ? 's' : ''}`
      const s = itemsPart + trovePart
      return s.trim() || 'Troves?'
    }
    if (searchMode === 'duplicates' && duplicatesResult != null) {
      const total = duplicatesResult.total ?? 0
      const selfCompare = compareTroveIds.size === 1 && compareTroveIds.has(primaryTroveId)
      const name = troves.find((t) => t.id === primaryTroveId)?.name ?? primaryTroveId
      if (selfCompare && total > 0) return `${name} · Self-compare. ${formatCount(total)} item${total !== 1 ? 's' : ''} with possible duplicates.`
      if (total > 0) return `${formatCount(total)} dups · ${primaryTroveId ? `${name} · Compare: ${formatCount(compareTroveIds.size)}` : 'Set primary & compare troves'}`
      return primaryTroveId ? `${name} · Compare: ${formatCount(compareTroveIds.size)}` : 'Set primary & compare troves'
    }
    if (searchMode === 'uniques' && uniquesResult != null) {
      const total = uniquesResult.total ?? 0
      if (compareTroveIds.size === 1 && compareTroveIds.has(primaryTroveId)) return 'Primary trove cannot be in compare list.'
      const uniqPart = total > 0 ? `${formatCount(total)} uniques · ` : ''
      const trovePart = primaryTroveId ? `${troves.find((t) => t.id === primaryTroveId)?.name ?? primaryTroveId} · Compare: ${formatCount(compareTroveIds.size)}` : 'Set primary & compare troves'
      return (uniqPart + trovePart).trim() || 'Troves?'
    }
    return 'Troves?'
  })()
  const filteredTroves = troves.filter((t) => {
    const q = trovePickerFilter.trim().toLowerCase()
    return !q || (t.name && t.name.toLowerCase().includes(q))
  })
  const sortByName = (a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
  const mobileSearchTrovesWithResults = useMemo(() => {
    if (searchMode !== 'search') return { selected: [], notSelected: [...filteredTroves].sort(sortByName) }
    const troveCounts = searchResult?.troveCounts != null && typeof searchResult.troveCounts === 'object' ? searchResult.troveCounts : null
    const hasResults = searchResult?.results != null && Array.isArray(searchResult.results) && searchResult.results.length > 0
    const sortByHitsDesc =
      troveCounts != null
        ? (a, b) => {
            if (searchMode === 'search' && boostTroveId && a.id === boostTroveId && b.id !== boostTroveId) return -1
            if (searchMode === 'search' && boostTroveId && b.id === boostTroveId && a.id !== boostTroveId) return 1
            const c = (troveCounts[b.id] ?? 0) - (troveCounts[a.id] ?? 0)
            return c !== 0 ? c : sortByName(a, b)
          }
        : sortByName
    if (!hasResults || freezeTroveListOrder) {
      const topSectionIds = new Set([...displaySelectedTroveIds, ...(boostTroveId != null ? [boostTroveId] : [])])
      const sortTopSection = (a, b) => {
        if (boostTroveId != null && a.id === boostTroveId && b.id !== boostTroveId) return -1
        if (boostTroveId != null && b.id === boostTroveId && a.id !== boostTroveId) return 1
        return sortByName(a, b)
      }
      const selected = [...filteredTroves.filter((t) => topSectionIds.has(t.id))].sort(sortTopSection)
      const notSelected = [...filteredTroves.filter((t) => !topSectionIds.has(t.id))].sort(sortByName)
      return { selected, notSelected }
    }
    const hitCount = (t) => troveCounts?.[t.id] ?? 0
    const withHits = filteredTroves.filter((t) => hitCount(t) > 0)
    const selectedWithNoHits = filteredTroves.filter((t) => hitCount(t) === 0 && (selectedTroveIds.has(t.id) || (boostTroveId != null && t.id === boostTroveId)))
    const sortByHitsDescThenBoostThenName = (a, b) => {
      const diff = hitCount(b) - hitCount(a)
      if (diff !== 0) return diff
      if (boostTroveId != null && a.id === boostTroveId && b.id !== boostTroveId) return -1
      if (boostTroveId != null && b.id === boostTroveId && a.id !== boostTroveId) return 1
      return sortByName(a, b)
    }
    const selected = [...withHits, ...selectedWithNoHits].sort(sortByHitsDescThenBoostThenName)
    const notSelected = filteredTroves.filter((t) => hitCount(t) === 0 && !selectedTroveIds.has(t.id) && t.id !== boostTroveId).sort(sortByName)
    return { selected, notSelected }
  }, [searchMode, filteredTroves, displaySelectedTroveIds, selectedTroveIds, freezeTroveListOrder, boostTroveId, searchResult?.troveCounts, searchResult?.results])

  function renderCacheLabel() {
    const label = cacheLabel || 'cache'
    const m = /^cache (\d+)(kb|mb|gb)$/.exec(label)
    if (!m) return ` ${label}`
    return (
      <>
        {' cache '}
        {m[1]}
        <span className="mobile-cache-unit">{m[2]}</span>
      </>
    )
  }

  return (
    <div className="mobile-app">
      <header className="mobile-header">
        <Link to="/mobile" className="mobile-brand">Morsor</Link>
        <nav className="mobile-header-nav" aria-label="Header links">
          {searchMode === 'search' && searchResult != null && results.length > 0 && (
            <button
              type="button"
              className={`mobile-share-btn${shareIconFlash ? ' mobile-share-btn--flash' : ''}`}
              onClick={async () => {
                try {
                  const { origin, pathname, search } = window.location
                  const pathWithoutMobile = pathname.replace(/^\/mobile\/?/, '/') || '/'
                  const params = new URLSearchParams(search)
                  params.delete('page')
                  params.delete('size')
                  const query = params.toString()
                  const urlToCopy = `${origin}${pathWithoutMobile}${query ? `?${query}` : ''}`
                  await navigator.clipboard.writeText(urlToCopy)
                  if (copyFlareTimeoutRef.current) clearTimeout(copyFlareTimeoutRef.current)
                  setCopiedUrlFlare(true)
                  copyFlareTimeoutRef.current = setTimeout(() => setCopiedUrlFlare(false), 2000)
                } catch (_) {}
              }}
              aria-label="Copy URL to clipboard"
              title="Copy URL"
            >
              <img src="/share-ios.svg" alt="" aria-hidden="true" className="mobile-share-icon" />
            </button>
          )}
          <Link to="/mobile/about" className="mobile-nav-link">About</Link>
        </nav>
      </header>
      {copiedUrlFlare && (
        <div className="mobile-copied-flare" role="status" aria-live="polite">
          Copied URL
        </div>
      )}

      <main
        ref={mobileMainRef}
        onScroll={updateMobileMainGapState}
        className={`mobile-main${fileTypeDropdownOpen ? ' mobile-filetype-dropdown-open' : ''}${mobileMainGapTopOpen ? ' mobile-main-gap-top-open' : ''}${mobileMainGapBottomOpen ? ' mobile-main-gap-bottom-open' : ''}`}
      >
        <div className="mobile-main-inner">
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
              onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setQuery(''); queryRef.current = ''; setSearchResult({ count: 0, results: [], page: 0, size: pageSize }) } }}
              placeholder="e.g. Greek, Prince, Albanian, Alien — or * for all"
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
                <span className="mobile-search-query-asterisk" aria-hidden="true">*</span>
              </button>
              <button
                type="button"
                className="mobile-search-query-btn mobile-search-query-btn-clear"
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
          <button type="submit" className="mobile-search-btn" disabled={searching} aria-label="Search">
            {searching ? '…' : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
            )}
          </button>
          {searchMode === 'search' && (displayFileTypes.length >= 1 || fileTypeFilters.size > 0) && (() => {
            const urlFileTypes = new Set(searchParams.getAll('fileTypes').filter((f) => f != null && f.trim()).map((f) => f.trim()))
            const fileTypesForLabel = fileTypeFilters.size > 0 ? fileTypeFilters : urlFileTypes
            const upper = (s) => (s || '').toUpperCase()
            const availableUpper = new Set(displayFileTypes.map(upper))
            const selectedUpper = new Set([...fileTypesForLabel].map(upper))
            const allSelected = availableUpper.size > 0 && availableUpper.size === selectedUpper.size && [...availableUpper].every((t) => selectedUpper.has(t))
            const hasFileTypeFilter = fileTypesForLabel.size > 0 && !allSelected
            return (
              <div className="mobile-filetype-dropdown-wrap mobile-filetype-dropdown-wrap--form" ref={fileTypeDropdownRef}>
              <div className={`mobile-filetype-trigger-wrap${hasFileTypeFilter ? ' mobile-filetype-trigger-wrap--filtered' : ''}`}>
                <button
                  type="button"
                  className="mobile-filetype-trigger"
                  onClick={() => setFileTypeDropdownOpen((o) => !o)}
                  aria-haspopup="listbox"
                  aria-expanded={fileTypeDropdownOpen}
                  aria-label="Filter by file type"
                >
                  {fileTypesForLabel.size === 0
                    ? (
                        <span className="mobile-filetype-trigger-icons" aria-hidden="true">
                          <img src="/pdf.svg" alt="" />
                          <img src="/video.svg" alt="" />
                          <img src="/audio.png" alt="" />
                        </span>
                      )
                    : allSelected
                      ? 'Any media'
                      : (() => {
                          if (fileTypesForLabel.size === 1) return `Only ${[...fileTypesForLabel][0]}`
                          const groupName = getGroupNameIfFullySelected(fileTypesForLabel, displayFileTypes)
                          return groupName ? `Only ${groupName}` : `${fileTypesForLabel.size} filetypes`
                        })()}
                </button>
              </div>
              {fileTypeDropdownOpen && fileTypePanelRect && (
                <div
                  className="mobile-filetype-panel mobile-filetype-panel--fixed"
                  role="listbox"
                  aria-label="File type filter"
                  style={{ position: 'fixed', top: fileTypePanelRect.top, left: fileTypePanelRect.left, width: fileTypePanelRect.width, zIndex: 1100 }}
                >
                  <div className="mobile-filetype-quick-actions">
                    <button
                      type="button"
                      className="mobile-filetype-quick-btn"
                      disabled={allSelected}
                      onClick={(e) => {
                        e.preventDefault()
                        skipFileTypeSearchRef.current = true
                        lastFileTypeOrViewSearchRef.current = Date.now()
                        const next = new Set(displayFileTypes)
                        setFileTypeFilters(next)
                        setSearchParams(buildSearchParams(next), { replace: true })
                        fetchSearch(0, null, null, next)
                      }}
                    >
                      <span className="mobile-filetype-quick-prefix mobile-filetype-quick-prefix--asterisk" aria-hidden="true">*</span> Any
                    </button>
                    <button
                      type="button"
                      className="mobile-filetype-quick-btn"
                      disabled={fileTypeFilters.size === 0}
                      onClick={(e) => {
                        e.preventDefault()
                        skipFileTypeSearchRef.current = true
                        lastFileTypeOrViewSearchRef.current = Date.now()
                        const next = new Set()
                        setFileTypeFilters(next)
                        setSearchParams(buildSearchParams(next), { replace: true })
                        fetchSearch(0, null, null, next)
                      }}
                    >
                      <span className="mobile-filetype-quick-prefix" aria-hidden="true">×</span> Meh
                    </button>
                  </div>
                  {groupFileTypes(displayFileTypes).map(({ group, types }) => {
                    const allSelectedGroup = types.every((ft) => fileTypeFilters.has(ft))
                    const someSelected = types.some((ft) => fileTypeFilters.has(ft))
                    return (
                      <div key={group ?? 'other'} className="mobile-filetype-group">
                        {group != null && (
                          <label className="mobile-filetype-group-header">
                            <input
                              type="checkbox"
                              ref={(el) => { if (el) el.indeterminate = someSelected && !allSelectedGroup }}
                              checked={allSelectedGroup}
                              onChange={() => {
                                skipFileTypeSearchRef.current = true
                                lastFileTypeOrViewSearchRef.current = Date.now()
                                const next = new Set(fileTypeFilters)
                                if (allSelectedGroup) types.forEach((t) => next.delete(t))
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
                                skipFileTypeSearchRef.current = true
                                lastFileTypeOrViewSearchRef.current = Date.now()
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
            );
          })()}
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
          <button
            type="button"
            className="mobile-troves-btn"
            onClick={() => setShowTrovePicker((v) => !v)}
            aria-expanded={showTrovePicker}
            aria-label="Select troves"
          >
            <span className="mobile-troves-btn-label">{mobileTroveDropdownLabel}</span>
            <span className="mobile-troves-btn-change" aria-hidden="true">Change</span>
          </button>
          {searchMode === 'search' && searchResult != null && showMobileViewModeToggle && (
            <span className="mobile-view-and-size-wrap mobile-troves-row-right">
              <span className="mobile-view-mode-toggle" role="group" aria-label="Results view">
                <button
                  type="button"
                  className={`mobile-view-mode-btn ${effectiveSearchResultsViewMode === 'list' ? 'mobile-view-mode-btn--active' : ''}`}
                  onClick={() => {
                    skipViewModeSearchRef.current = true
                    lastFileTypeOrViewSearchRef.current = Date.now()
                    setSearchResultsViewMode('list')
                  }}
                  aria-pressed={effectiveSearchResultsViewMode === 'list'}
                  aria-label="List view"
                >
                  <img src="/list.png" alt="" aria-hidden="true" className="mobile-view-mode-btn-icon" />
                </button>
                <button
                  type="button"
                  className={`mobile-view-mode-btn ${effectiveSearchResultsViewMode === 'gallery' ? 'mobile-view-mode-btn--active' : ''}`}
                  onClick={() => {
                    skipViewModeSearchRef.current = true
                    lastFileTypeOrViewSearchRef.current = Date.now()
                    setSearchResultsViewMode('gallery')
                  }}
                  aria-pressed={effectiveSearchResultsViewMode === 'gallery'}
                  aria-label="Gallery view"
                >
                  <img src="/gallery.png" alt="" aria-hidden="true" className="mobile-view-mode-btn-icon" />
                </button>
              </span>
              {effectiveSearchResultsViewMode === 'gallery' && (
                <span className="mobile-gallery-decorate-wrap">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={galleryDecorate}
                    aria-label={galleryDecorate ? 'Hide decorations' : 'Show decorations'}
                    title={galleryDecorate ? 'Hide decorations' : 'Show decorations'}
                    className="mobile-gallery-decorate-toggle"
                    onClick={handleGalleryDecorateToggle}
                  >
                    <img
                      src={galleryDecorate ? '/decorated-picture.png' : '/undecorated-picture.png'}
                      alt=""
                      aria-hidden="true"
                      className="mobile-gallery-decorate-toggle-icon"
                    />
                  </button>
                </span>
              )}
            </span>
          )}
          {searchMode === 'duplicates' && duplicatesResult != null && (() => {
            const total = duplicatesResult.total ?? 0
            const size = duplicatesResult.size ?? DUP_UNIQUES_PAGE_SIZE
            const totalDupPages = size > 0 ? Math.ceil(total / size) : 0
            return totalDupPages > 1 && (
              <nav className="mobile-pagination mobile-troves-row-right" aria-label="Duplicate pages">
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
              <nav className="mobile-pagination mobile-troves-row-right" aria-label="Uniques pages">
                <button type="button" className="mobile-page-btn" disabled={uniquesPage <= 0 || searching} onClick={() => fetchUniques(uniquesPage - 1)} aria-label="Previous">‹</button>
                <span className="mobile-page-info">{formatCount(uniquesPage + 1)} / {formatCount(totalUniqPages)}</span>
                <button type="button" className="mobile-page-btn" disabled={uniquesPage >= totalUniqPages - 1 || searching} onClick={() => fetchUniques(uniquesPage + 1)} aria-label="Next">›</button>
              </nav>
            )
          })()}
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
                  onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setTrovePickerFilter('') } }}
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
            {!isDupOrUniques && (
              <p className="trove-picker-summary mobile-trove-picker-summary" aria-live="polite">
                {selectedTroveIds.size === 0
                  ? 'All troves will be searched.'
                  : `${formatCount(selectedTroveIds.size)} of ${formatCount(troves.length)} selected.`}
                {boostTroveId && (() => {
                  const name = troves.find((t) => t.id === boostTroveId)?.name ?? boostTroveId
                  return name ? ` ${name} will be boosted.` : null
                })()}
              </p>
            )}
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
                              <span className="mobile-trove-only-actions">
                                <button type="button" className="mobile-trove-only-link" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleTargetClick(t.id) }} aria-label={`Search only ${t.name}`} title="Only this trove"><img src="/target.png" alt="" className="mobile-trove-only-icon" /></button>
                                <button type="button" className={`mobile-trove-only-link mobile-trove-only-link--boost${boostTroveId === t.id ? ' mobile-trove-only-link--boost-active' : ''}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleBoostClick(t.id) }} aria-label={boostTroveId === t.id ? `Boost on for ${t.name}` : `Boost ${t.name} in search results`} title={boostTroveId === t.id ? 'Boost on — results from this trove rank higher' : 'Boost this trove in search results'}><span className="trove-booster" aria-hidden="true">↑</span></button>
                              </span>
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
              <div className={`mobile-search-results-grid${fileTypeDropdownOpen ? ' mobile-filetype-dropdown-open' : ''}${!showSearchPaginationControls ? ' mobile-search-results-grid--no-pager' : ''}`}>
                {showSearchPaginationControls && (
                  <div className="mobile-view-mode-row">
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
                        Page{' '}
                        <input
                          type="text"
                          className="mobile-page-input"
                          value={mobileSearchPageInput}
                          onChange={(e) => setMobileSearchPageInput(e.target.value)}
                          onKeyDown={(e) => handleMobileSearchPageInputKeyDown(e, totalPages, page)}
                          aria-label="Current page"
                        />{' '}
                        / {formatCount(totalPages)}
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
                    <label className="mobile-page-size-label mobile-page-size-label--end">
                      Size
                      <select
                        value={pageSize}
                        onChange={handlePageSizeChange}
                        className="mobile-page-size-select"
                        disabled={searching}
                        aria-label="Page size"
                      >
                        {MOBILE_PAGE_SIZE_OPTIONS.map((n) => (
                          <option key={n} value={n}>
                            {formatCount(n)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
                <SearchResultsGrid
                  data={results}
                  sortBy={searchSortBy}
                  sortDir={searchSortDir}
                  onSortChange={(col, dir) => fetchSearch(0, col, dir)}
                  showScoreColumn={query.trim() !== '*'}
                  viewMode={effectiveSearchResultsViewMode}
                  hideTroveInGallery={selectedTroveIds.size === 1}
                  showPdfSashInGallery
                  showGalleryDecorations={galleryDecorate}
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
        </div>
      </main>

      <footer className="mobile-footer">
        <div className="mobile-footer-row mobile-footer-row--singleline">
          <Link to={location.search ? `/?${location.search.slice(1)}` : '/'} className="mobile-footer-link" onClick={() => sessionStorage.setItem('morsorPreferDesktop', 'true')}>Desktop</Link>
          <span className="mobile-footer-middle">
            {statusMessage && (
              <>
                <span className="mobile-status-message" role="status">
                  <span
                    className="mobile-status-icon-wrap"
                    title={`Status: ${statusTooltip || statusMessage}`}
                    aria-label={`Status: ${statusTooltip || statusMessage}`}
                  >
                    <img
                      src={statusMessage === 'Server OK' ? '/data_ok.png' : '/data_error.png'}
                      alt={statusMessage === 'Server OK' ? 'Server OK' : 'Server not OK'}
                      className="mobile-status-icon"
                    />
                  </span>
                </span>
                <span className="mobile-footer-sep" aria-hidden="true">·</span>
              </>
            )}
            {cacheEntries > 0 && (
              <>
                <button
                  type="button"
                  className="mobile-footer-link mobile-clear-cache-btn"
                  aria-label="Clear cache"
                  onClick={() => {
                    const headers = { ...getApiAuthHeaders() }
                    const token = getCsrfToken()
                    if (token) headers['X-XSRF-TOKEN'] = token
                    fetch('/api/cache/clear', { method: 'POST', credentials: 'include', headers })
                      .then((res) => { if (res.status === 401) { window.location.href = '/login'; return }; if (res.ok) refreshStatusMessage() })
                      .catch(() => {})
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                  <span>{renderCacheLabel()}</span>
                </button>
                <span className="mobile-footer-sep" aria-hidden="true">·</span>
              </>
            )}
            <button
              type="button"
              className="mobile-footer-link mobile-clear-cache-btn"
              aria-label="Reload troves"
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17.661 18.993A9 9 0 1 1 16.361 4.13" />
                <path
                  d="M14.108 0.528 L12.709 5.98 L18.21 4.181 Z"
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth="1.1"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
              <span className="mobile-reload-label">troves</span>
            </button>
          </span>
          <button
            type="button"
            className="mobile-footer-link mobile-footer-logout-btn"
            onClick={() => {
              performLogout()
                .then(() => { window.location.href = '/login' })
                .catch(() => { window.alert('Logout failed. Please try again.') })
            }}
          >
            Logout
          </button>
        </div>
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
      </footer>
    </div>
  )
}

export default MobileApp
