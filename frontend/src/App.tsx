import { useMemo, useState, useEffect, useRef, useLayoutEffect } from 'react'
import { Link, useSearchParams, useLocation } from 'react-router-dom'
import type { SearchResultData, Trove, DuplicatesResultData, UniquesResultData } from './types'
import type { FileTypeQuickModeValue } from './fileTypeQuickMode'
import {
  SearchResultsGrid,
  collectExtraFieldKeysFromRows,
  extraFieldKeyMatchesFilter,
  formatLittlePrinceFieldLabel,
  gallerySortSelectValue,
  defaultGallerySortDirForSortBy,
  mergeGalleryExtraSortKeys,
  buildSortedGallerySortOptions,
} from './SearchResultsGrid'
import { DuplicateResultsView } from './DuplicateResultsView'
import { UniquesResultsView } from './UniquesResultsView'
import { getApiAuthHeaders } from './apiAuth'
import { getCsrfToken } from './getCsrfToken'
import { performLogout } from './performLogout'
import { queryCache } from './queryCache'
import { appendQueryHistoryEntry } from './queryHistory'
import { searchHistoryLabels, duplicatesHistoryLabels, uniquesHistoryLabels } from './queryHistoryLabels'
import type { QueryResultTiming } from './queryResultTiming'
import { QueryTimingText } from './QueryTimingText'
import { formatCount, formatCacheBytes } from './formatCount'
import {
  ALL_KNOWN_FILE_TYPES,
  groupFileTypes,
  getGroupNameIfFullySelected,
  getFullySelectedGroupNames,
} from './fileTypeGroups'
import { FileTypeQuickMode, normalizeFileTypeQuickMode } from './fileTypeQuickMode'
import { fileTypeSetHas, normalizeFileTypeToken, pruneRequiredFileTypes } from './fileTypeRequireUtils'
import { isCompareToSelfVisible } from './compareToSelfVisible'
import {
  deserializeActiveTabFromUrl,
  parseFileTypesQueryValues,
  serializeActiveTabToUrl,
  serializeUrlFromTabSessions,
  type TabMode,
} from './tabUrlParams'
import {
  loadSearchTabSession,
  loadDuplicatesTabSession,
  loadUniquesTabSession,
  saveSearchTabSession,
  saveDuplicatesTabSession,
  saveUniquesTabSession,
  type SearchTabSession,
  type DuplicatesTabSession,
  type UniquesTabSession,
} from './sessionTabState'
import { paginationPageWindow } from './paginationPageWindow'
import './App.css'

const DEFAULT_DUP_SESSION: DuplicatesTabSession = {
  dupQuery: '',
  dupPrimaryTroveId: '',
  dupCompareTroveIds: [],
  dupPageSize: 50,
  duplicatesSortBy: null,
  duplicatesSortDir: 'asc',
}
const DEFAULT_UNIQ_SESSION: UniquesTabSession = {
  uniqQuery: '',
  uniqPrimaryTroveId: '',
  uniqCompareTroveIds: [],
  uniqPageSize: 50,
  uniquesSortBy: null,
  uniquesSortDir: 'asc',
}

function App() {
  const [message, setMessage] = useState('')
  const [cacheEntries, setCacheEntries] = useState(0)
  const [troves, setTroves] = useState<Trove[]>([])
  const [searchSelectedTroveIds, setSearchSelectedTroveIds] = useState<Set<string>>(() => new Set())
  const [dupCompareTroveIds, setDupCompareTroveIds] = useState<Set<string>>(() => new Set())
  const [uniqCompareTroveIds, setUniqCompareTroveIds] = useState<Set<string>>(() => new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [dupQuery, setDupQuery] = useState('')
  const [uniqQuery, setUniqQuery] = useState('')
  const [searchResult, setSearchResult] = useState<SearchResultData | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [pageSize, setPageSize] = useState(500)
  const [troveFilter, setTroveFilter] = useState('')
  const [showFilter, setShowFilter] = useState('all')
  const [freezeTroveListOrder, setFreezeTroveListOrder] = useState(false)
  const [boostTroveId, setBoostTroveId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [starSortBy, setStarSortBy] = useState<string | null>(null)
  const [starSortDir, setStarSortDir] = useState<'asc' | 'desc' | null>(null)
  const [otherSortBy, setOtherSortBy] = useState<string | null>(null)
  const [otherSortDir, setOtherSortDir] = useState<'asc' | 'desc' | null>(null)
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
  const [duplicatesResult, setDuplicatesResult] = useState<DuplicatesResultData | null>(null)
  const [duplicatesPage, setDuplicatesPage] = useState(0)
  const [dupPageSize, setDupPageSize] = useState(50)
  const [duplicatesSortBy, setDuplicatesSortBy] = useState<string | null>(null)
  const [duplicatesSortDir, setDuplicatesSortDir] = useState<'asc' | 'desc'>('asc')
  const [uniquesResult, setUniquesResult] = useState<UniquesResultData | null>(null)
  const [uniquesPage, setUniquesPage] = useState(0)
  const [uniqPageSize, setUniqPageSize] = useState(50)
  const [uniquesSortBy, setUniquesSortBy] = useState<string | null>(null)
  const [uniquesSortDir, setUniquesSortDir] = useState<'asc' | 'desc'>('asc')
  const [searchPageInput, setSearchPageInput] = useState('')
  const [fileTypeFilters, setFileTypeFilters] = useState<Set<string>>(() => {
    const ftAll = new URLSearchParams(window.location.search).getAll('fileTypes')
    return new Set(parseFileTypesQueryValues(ftAll))
  })
  const [requiredFileTypes, setRequiredFileTypes] = useState<Set<string>>(() => {
    const p = new URLSearchParams(window.location.search)
    return new Set(parseFileTypesQueryValues(p.getAll('requireFileTypes')))
  })
  const [fileTypeQuickMode, setFileTypeQuickMode] = useState<FileTypeQuickModeValue>(() => normalizeFileTypeQuickMode(new URLSearchParams(window.location.search).get('ftq')))
  const [thumbnailOnly, setThumbnailOnly] = useState(() => new URLSearchParams(window.location.search).get('thumbs') === '1')
  const [allAvailableFileTypes, setAllAvailableFileTypes] = useState<string[]>([])
  const [fileTypeDropdownOpen, setFileTypeDropdownOpen] = useState(false)
  const [extraFieldDropdownOpen, setExtraFieldDropdownOpen] = useState(false)
  const [extraFieldDropdownFilter, setExtraFieldDropdownFilter] = useState('')
  const [extraGridFieldsSelected, setExtraGridFieldsSelected] = useState<Set<string>>(() => new Set())
  const [searchResultsViewMode, setSearchResultsViewMode] = useState<'list' | 'gallery'>('list')
  const [galleryDecorate, setGalleryDecorate] = useState(true)
  const [compareProgress, setCompareProgress] = useState({ current: 0, total: 0 })
  const [compareElapsedSec, setCompareElapsedSec] = useState(0)
  const [compareQueryTiming, setCompareQueryTiming] = useState<QueryResultTiming | null>(null)
  const [searchQueryTiming, setSearchQueryTiming] = useState<QueryResultTiming | null>(null)
  const [compareRawSourceLightbox, setCompareRawSourceLightbox] = useState<{ title: string; rawSourceItem: string } | null>(null)
  const [reloadTrovesInProgress, setReloadTrovesInProgress] = useState(false)
  const [reloadTrovesProgress, setReloadTrovesProgress] = useState({ current: 0, total: 0 })
  const queryRef = useRef('')
  const skipCheckboxSearchRef = useRef(true)
  const skipFileTypeSearchRef = useRef(false)
  const skipViewModeSearchRef = useRef(false)
  const skipPageNavSearchRef = useRef(false)
  const lastFileTypeOrViewSearchRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const searchRequestIdRef = useRef(0)
  const reloadAbortControllerRef = useRef<AbortController | null>(null)
  const reloadRunIdRef = useRef(0)
  const reloadInProgressRef = useRef(false)
  const compareTimerStartRef = useRef<number | null>(null)
  const compareIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const compareEtaHistoryRef = useRef<number[]>([])
  const [showCompareBackToTop, setShowCompareBackToTop] = useState(false)
  const compareSectionRef = useRef<HTMLDivElement | null>(null)
  const compareScrollContainerRef = useRef<HTMLElement | null>(null)
  const [compareBackToTopCenterX, setCompareBackToTopCenterX] = useState<number | null>(null)
  const fileTypeDropdownRef = useRef<HTMLDivElement | null>(null)
  const extraFieldDropdownRef = useRef<HTMLDivElement | null>(null)
  const dupPageSizeRef = useRef(dupPageSize)
  const uniqPageSizeRef = useRef(uniqPageSize)
  dupPageSizeRef.current = dupPageSize
  uniqPageSizeRef.current = uniqPageSize
  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 500, 1000, 5000, 10000]
  useLayoutEffect(() => {
    queryRef.current = searchMode === 'search' ? searchQuery : searchMode === 'duplicates' ? dupQuery : uniqQuery
  }, [searchMode, searchQuery, dupQuery, uniqQuery])
  const isStarQuery = (searchQuery ?? '').trim() === '*'
  const effectiveSortBy = isStarQuery ? (starSortBy ?? 'title') : (otherSortBy ?? 'score')
  const effectiveSortDir = isStarQuery ? (starSortDir ?? 'asc') : (otherSortDir ?? 'desc')

  const extraFieldKeysOnPage = useMemo(() => {
    if (searchMode !== 'search' || !Array.isArray(searchResult?.results)) {
      return [] as string[]
    }
    return collectExtraFieldKeysFromRows(searchResult.results)
  }, [searchMode, searchResult?.results])

  const galleryExtraSortKeys = useMemo(() => {
    if (searchMode !== 'search') {
      return [] as string[]
    }
    return mergeGalleryExtraSortKeys(
      searchResult?.availableExtraFieldKeys,
      searchResult?.results,
      effectiveSortBy
    )
  }, [searchMode, searchResult?.availableExtraFieldKeys, searchResult?.results, effectiveSortBy])

  const gallerySortOptions = useMemo(
    () => buildSortedGallerySortOptions(galleryExtraSortKeys),
    [galleryExtraSortKeys]
  )

  const visibleExtraFieldKeysForGrid = useMemo(
    () => [...extraGridFieldsSelected],
    [extraGridFieldsSelected]
  )

  // Back-to-top for compare results (duplicates/uniques) – mirrors SearchResultsGrid behavior
  useEffect(() => {
    const el = compareSectionRef.current
    if (!el) return
    const scrollContainer = (el.closest('.main') ?? null) as HTMLElement | null
    compareScrollContainerRef.current = scrollContainer
    const threshold = 200
    const getScrollTop = () => (scrollContainer ? scrollContainer.scrollTop : window.scrollY)
    const onScroll = () => setShowCompareBackToTop(getScrollTop() > threshold)
    onScroll()
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', onScroll, { passive: true })
      return () => scrollContainer.removeEventListener('scroll', onScroll)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const el = compareSectionRef.current
    if (!el) return
    const updateCenter = () => {
      const rect = el.getBoundingClientRect()
      setCompareBackToTopCenterX(rect.left + rect.width / 2)
    }
    updateCenter()
    const ro = new ResizeObserver(updateCenter)
    ro.observe(el)
    window.addEventListener('resize', updateCenter)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updateCenter)
    }
  }, [])

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

  function fetchSearch(
    pageNum: number,
    sizeOverride: number | null = null,
    troveIdsOverride: Set<string> | null = null,
    sortByOverride: string | null = null,
    sortDirOverride: 'asc' | 'desc' | null = null,
    fileTypesOverride?: Set<string>,
    requiredFileTypesOverride?: Set<string>
  ) {
    const size = sizeOverride ?? pageSize
    const q = queryRef.current
    if (!q.trim()) {
      setSearchResult({ count: 0, results: [], page: 0, size })
      setSearchQueryTiming(null)
      return
    }
    const troveIds = troveIdsOverride ?? selectedTroveIds
    const qt = q.trim()
    const fetchIsStarQuery = qt === '*'
    const nextSortBy =
      sortByOverride !== undefined && sortByOverride !== null
        ? sortByOverride
        : fetchIsStarQuery
          ? starSortBy ?? 'title'
          : otherSortBy ?? 'score'
    const nextSortDir =
      sortDirOverride !== undefined && sortDirOverride !== null
        ? sortDirOverride
        : fetchIsStarQuery
          ? starSortDir ?? 'asc'
          : otherSortDir ?? 'desc'
    const fileTypesToUseRaw = fileTypesOverride !== undefined ? fileTypesOverride : fileTypeFilters
    const fileTypesToUse = new Set([...fileTypesToUseRaw].map(normalizeFileTypeToken))
    const requiredToUse = requiredFileTypesOverride !== undefined ? requiredFileTypesOverride : requiredFileTypes
    const requiredEffective = new Set(
      [...requiredToUse].map(normalizeFileTypeToken).filter((t) => fileTypesToUse.has(t))
    )
    const params = new URLSearchParams({
      query: qt,
      page: String(pageNum),
      size: String(size),
    })
    troveIds.forEach((id) => params.append('trove', id))
    if (boostTroveId) params.set('boostTrove', boostTroveId)
    if (fileTypesToUse.size > 0) params.set('fileTypes', [...fileTypesToUse].sort().join(','))
    if (requiredEffective.size > 0) params.set('requireFileTypes', [...requiredEffective].sort().join(','))
    if (thumbnailOnly) params.set('thumbs', '1')
    if (sortByOverride !== undefined || sortDirOverride !== undefined) {
      if (fetchIsStarQuery) {
        setStarSortBy(nextSortBy || null)
        setStarSortDir(nextSortDir)
      } else {
        setOtherSortBy(nextSortBy || null)
        setOtherSortDir(nextSortDir)
      }
    }
    if (nextSortBy) {
      params.set('sortBy', nextSortBy)
      params.set('sortDir', nextSortDir)
    }
    const url = `/api/search?${params}`
    abortControllerRef.current?.abort()
    const hit = queryCache.get(url)
    if (hit) {
      const cached = hit.data as SearchResultData
      setSearchResult(cached)
      setSearchQueryTiming({ durationMs: hit.durationMs, receivedAtMs: hit.receivedAtMs })
      if (Array.isArray(cached.availableFileTypes) && cached.availableFileTypes.length > 0) {
        setAllAvailableFileTypes((prev) => {
          const next = new Set(prev)
          cached.availableFileTypes!.forEach((t) => next.add(normalizeFileTypeToken(t)))
          return [...next].sort()
        })
      }
      const sl = searchHistoryLabels(
        troves,
        qt,
        searchResultsViewMode,
        [...troveIds],
        nextSortBy || null,
        nextSortDir,
        fileTypesToUse,
        thumbnailOnly,
        boostTroveId,
        cached.page,
        size
      )
      appendQueryHistoryEntry({
        mode: 'search',
        ranAtMs: hit.receivedAtMs,
        durationMs: hit.durationMs,
        consoleQuery: buildAppUrlParams({ searchPage0BasedOverride: cached.page }).toString(),
        apiCacheKey: url,
        resultCount: cached.count,
        summary: sl.summary,
        detail: sl.detail,
      })
      return
    }
    setSearchQueryTiming(null)
    const searchStartedAt = Date.now()
    const controller = new AbortController()
    abortControllerRef.current = controller
    const requestId = ++searchRequestIdRef.current
    setSearching(true)
    setSearchError(null)
    fetch(url, { credentials: 'include', headers: { ...getApiAuthHeaders() }, signal: controller.signal })
      .then((res) => {
        if (res.status === 401) { window.location.href = '/login'; return Promise.reject() }
        if (!res.ok) throw new Error(res.statusText)
        return res.json()
      })
      .then((data: SearchResultData) => {
        if (searchRequestIdRef.current !== requestId) return
        const receivedAtMs = Date.now()
        const durationMs = receivedAtMs - searchStartedAt
        queryCache.set(url, data, { durationMs, receivedAtMs })
        setSearchQueryTiming({ durationMs, receivedAtMs })
        setSearchResult(data)
        if (Array.isArray(data.availableFileTypes) && data.availableFileTypes.length > 0) {
          setAllAvailableFileTypes((prev) => {
            const next = new Set(prev)
            data.availableFileTypes!.forEach((t) => next.add(normalizeFileTypeToken(t)))
            return [...next].sort()
          })
        }
        const sl = searchHistoryLabels(
          troves,
          qt,
          searchResultsViewMode,
          [...troveIds],
          nextSortBy || null,
          nextSortDir,
          fileTypesToUse,
          thumbnailOnly,
          boostTroveId,
          data.page,
          size
        )
        appendQueryHistoryEntry({
          mode: 'search',
          ranAtMs: receivedAtMs,
          durationMs,
          consoleQuery: buildAppUrlParams({ searchPage0BasedOverride: data.page }).toString(),
          apiCacheKey: url,
          resultCount: data.count,
          summary: sl.summary,
          detail: sl.detail,
        })
        refreshStatusMessage()
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setSearchError(err.message)
      })
      .finally(() => {
        if (searchRequestIdRef.current === requestId) setSearching(false)
      })
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
    if (!extraFieldDropdownOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (extraFieldDropdownRef.current && !extraFieldDropdownRef.current.contains(e.target as Node)) {
        setExtraFieldDropdownOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [extraFieldDropdownOpen])

  useEffect(() => {
    if (!extraFieldDropdownOpen) return
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setExtraFieldDropdownOpen(false)
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [extraFieldDropdownOpen])

  useEffect(() => {
    if (!extraFieldDropdownOpen) {
      setExtraFieldDropdownFilter('')
    }
  }, [extraFieldDropdownOpen])

  useEffect(() => {
    if (searchResultsViewMode === 'gallery') {
      setExtraFieldDropdownOpen(false)
    }
  }, [searchResultsViewMode])

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

  function saveActiveTabSnapshot() {
    if (searchMode === 'search') {
      saveSearchTabSession({
        searchQuery,
        searchSelectedTroveIds: [...searchSelectedTroveIds],
        pageSize,
        fileTypeFilters: [...fileTypeFilters],
        requiredFileTypes: [...requiredFileTypes],
        fileTypeQuickMode,
        thumbnailOnly,
        boostTroveId,
        searchResultsViewMode,
        extraGridFields: [...extraGridFieldsSelected],
        starSortBy,
        starSortDir,
        otherSortBy,
        otherSortDir,
        searchPage0Based: typeof searchResult?.page === 'number' ? searchResult.page : 0,
      })
    } else if (searchMode === 'duplicates') {
      saveDuplicatesTabSession({
        dupQuery,
        dupPrimaryTroveId,
        dupCompareTroveIds: [...dupCompareTroveIds],
        dupPageSize,
        duplicatesSortBy,
        duplicatesSortDir,
        duplicatesPage0Based: typeof duplicatesResult?.page === 'number' ? duplicatesResult.page : duplicatesPage,
      })
    } else {
      saveUniquesTabSession({
        uniqQuery,
        uniqPrimaryTroveId,
        uniqCompareTroveIds: [...uniqCompareTroveIds],
        uniqPageSize,
        uniquesSortBy,
        uniquesSortDir,
        uniquesPage0Based: typeof uniquesResult?.page === 'number' ? uniquesResult.page : uniquesPage,
      })
    }
  }

  function mergeSearchFromSession(s: SearchTabSession | null) {
    const x = s
    if (!x) return
    setSearchQuery(x.searchQuery)
    setSearchSelectedTroveIds(new Set(x.searchSelectedTroveIds))
    setPageSize(x.pageSize)
    setFileTypeFilters(new Set(x.fileTypeFilters.map(normalizeFileTypeToken)))
    setRequiredFileTypes(new Set((x.requiredFileTypes ?? []).map(normalizeFileTypeToken)))
    setFileTypeQuickMode(x.fileTypeQuickMode)
    setThumbnailOnly(x.thumbnailOnly)
    setBoostTroveId(x.boostTroveId)
    setSearchResultsViewMode(x.searchResultsViewMode)
    setExtraGridFieldsSelected(new Set(x.extraGridFields))
    setStarSortBy(x.starSortBy)
    setStarSortDir(x.starSortDir)
    setOtherSortBy(x.otherSortBy)
    setOtherSortDir(x.otherSortDir)
  }

  function mergeDupFromSession(s: DuplicatesTabSession | null) {
    const x = s ?? DEFAULT_DUP_SESSION
    setDupQuery(x.dupQuery)
    setDupPrimaryTroveId(x.dupPrimaryTroveId)
    setDupCompareTroveIds(new Set(x.dupCompareTroveIds))
    setDupPageSize(x.dupPageSize)
    setDuplicatesSortBy(x.duplicatesSortBy)
    setDuplicatesSortDir(x.duplicatesSortDir)
  }

  function mergeUniqFromSession(s: UniquesTabSession | null) {
    const x = s ?? DEFAULT_UNIQ_SESSION
    setUniqQuery(x.uniqQuery)
    setUniqPrimaryTroveId(x.uniqPrimaryTroveId)
    setUniqCompareTroveIds(new Set(x.uniqCompareTroveIds))
    setUniqPageSize(x.uniqPageSize)
    setUniquesSortBy(x.uniquesSortBy)
    setUniquesSortDir(x.uniquesSortDir)
  }

  /** Active tab only — `mode` comes from the URL. Inactive tabs from session. */
  useEffect(() => {
    const u = deserializeActiveTabFromUrl(searchParams, troves, urlTroveId)
    const sSearch = loadSearchTabSession()
    const sDup = loadDuplicatesTabSession()
    const sUniq = loadUniquesTabSession()

    if (u.mode === 'search') {
      setSearchQuery(u.searchQuery)
      setSearchSelectedTroveIds(new Set(u.searchTroveIds))
      if (u.pageSize != null) setPageSize(u.pageSize)
      setFileTypeFilters(new Set(u.fileTypeFilters.map(normalizeFileTypeToken)))
      setRequiredFileTypes(new Set(u.requireFileTypes.map(normalizeFileTypeToken)))
      setFileTypeQuickMode(u.fileTypeQuickMode)
      setThumbnailOnly(u.thumbnailOnly)
      setBoostTroveId(u.boostTroveId)
      setSearchResultsViewMode(u.searchView)
      setExtraGridFieldsSelected(new Set(u.extraGridFields))
      const sq = u.searchQuery.trim()
      const isStar = sq === '*'
      if (u.searchSortBy) {
        if (isStar) {
          setStarSortBy(u.searchSortBy)
          setStarSortDir(u.searchSortDir === 'desc' ? 'desc' : 'asc')
        } else {
          setOtherSortBy(u.searchSortBy)
          setOtherSortDir(u.searchSortDir === 'asc' ? 'asc' : 'desc')
        }
      } else if (u.searchView === 'gallery') {
        if (isStar) {
          setStarSortBy('title')
          setStarSortDir('asc')
        } else if (sq) {
          setOtherSortBy('score')
          setOtherSortDir('desc')
        }
      }
      mergeDupFromSession(sDup)
      mergeUniqFromSession(sUniq)
    } else if (u.mode === 'duplicates') {
      setDupQuery(u.dupQuery)
      setDupPrimaryTroveId(u.dupPrimary)
      setDupCompareTroveIds(new Set(u.dupCompare))
      if (u.dupPageSize != null) setDupPageSize(u.dupPageSize)
      setDuplicatesSortBy(u.duplicatesSortBy)
      setDuplicatesSortDir(u.duplicatesSortDir)
      mergeSearchFromSession(sSearch)
      mergeUniqFromSession(sUniq)
    } else {
      setUniqQuery(u.uniqQuery)
      setUniqPrimaryTroveId(u.uniqPrimary)
      setUniqCompareTroveIds(new Set(u.uniqCompare))
      if (u.uniqPageSize != null) setUniqPageSize(u.uniqPageSize)
      setUniquesSortBy(u.uniquesSortBy)
      setUniquesSortDir(u.uniquesSortDir)
      mergeSearchFromSession(sSearch)
      mergeDupFromSession(sDup)
    }
  }, [searchParams, troves])

  function buildAppUrlParams(
    overrides: {
      mode?: TabMode
      searchTroveIds?: Set<string>
      fileTypeFilters?: Set<string>
      requiredFileTypes?: Set<string>
      boostTroveId?: string | null
      searchView?: 'list' | 'gallery'
      thumbnailOnly?: boolean
      fileTypeQuickMode?: FileTypeQuickModeValue
      dupQuery?: string
      dupPrimary?: string
      dupCompare?: Set<string>
      dupPageSize?: number
      uniqQuery?: string
      uniqPrimary?: string
      uniqCompare?: Set<string>
      uniqPageSize?: number
      searchPage0BasedOverride?: number | null
      dupPage0BasedOverride?: number | null
      uniqPage0BasedOverride?: number | null
    } = {}
  ): URLSearchParams {
    const mode = overrides.mode ?? searchMode
    const ft = overrides.fileTypeFilters ?? fileTypeFilters
    const rft = overrides.requiredFileTypes !== undefined ? overrides.requiredFileTypes : requiredFileTypes
    const sq = (searchQuery ?? '').trim()
    const isStar = sq === '*'
    const effBy = mode === 'search' ? (isStar ? (starSortBy ?? 'title') : (otherSortBy ?? 'score')) : effectiveSortBy
    const effDir = mode === 'search' ? (isStar ? (starSortDir ?? 'asc') : (otherSortDir ?? 'desc')) : effectiveSortDir
    return serializeActiveTabToUrl({
      mode,
      searchQuery,
      searchTroveIds: overrides.searchTroveIds ?? searchSelectedTroveIds,
      pageSize,
      searchPage0Based:
        overrides.searchPage0BasedOverride !== undefined ? overrides.searchPage0BasedOverride : searchResult?.page,
      fileTypeFilters: ft,
      requiredFileTypes: rft,
      fileTypeQuickMode: overrides.fileTypeQuickMode ?? fileTypeQuickMode,
      thumbnailOnly: overrides.thumbnailOnly ?? thumbnailOnly,
      boostTroveId: overrides.boostTroveId !== undefined ? overrides.boostTroveId : boostTroveId,
      searchView: overrides.searchView ?? searchResultsViewMode,
      extraGridFields: extraGridFieldsSelected,
      dupQuery: overrides.dupQuery ?? dupQuery,
      dupPrimary: overrides.dupPrimary ?? dupPrimaryTroveId,
      dupCompare: overrides.dupCompare ?? dupCompareTroveIds,
      dupPageSize: overrides.dupPageSize ?? dupPageSize,
      dupPage0Based:
        overrides.dupPage0BasedOverride !== undefined ? overrides.dupPage0BasedOverride : duplicatesResult?.page,
      duplicatesSortBy,
      duplicatesSortDir,
      uniqQuery: overrides.uniqQuery ?? uniqQuery,
      uniqPrimary: overrides.uniqPrimary ?? uniqPrimaryTroveId,
      uniqCompare: overrides.uniqCompare ?? uniqCompareTroveIds,
      uniqPageSize: overrides.uniqPageSize ?? uniqPageSize,
      uniqPage0Based:
        overrides.uniqPage0BasedOverride !== undefined ? overrides.uniqPage0BasedOverride : uniquesResult?.page,
      uniquesSortBy,
      uniquesSortDir,
      effectiveSearchSortBy: effBy,
      effectiveSearchSortDir: effDir,
      troves,
      urlTroveId,
    })
  }

  /** Build URL for the active tab; pass explicit trove/query overrides when state has not flushed yet (e.g. clear). */
  function buildSearchParams(
    mode: string,
    searchTroves: Set<string>,
    dupPrimary: string,
    dupCompare: Set<string>,
    uniqPrimary: string,
    uniqCompare: Set<string>,
    fileTypesSet: Set<string> | null = null,
    boostTrove: string | null = null,
    view: 'list' | 'gallery' | null = null,
    thumbnailOnlyOverride?: boolean,
    quickModeOverride?: FileTypeQuickModeValue,
    requiredFileTypesOverride?: Set<string>
  ): URLSearchParams {
    const m = (mode === 'duplicates' || mode === 'uniques' ? mode : 'search') as TabMode
    return buildAppUrlParams({
      mode: m,
      searchTroveIds: searchTroves,
      dupPrimary,
      dupCompare,
      uniqPrimary,
      uniqCompare,
      fileTypeFilters: fileTypesSet ?? undefined,
      ...(requiredFileTypesOverride !== undefined ? { requiredFileTypes: requiredFileTypesOverride } : {}),
      boostTroveId: boostTrove === undefined ? undefined : boostTrove,
      searchView: view ?? undefined,
      thumbnailOnly: thumbnailOnlyOverride,
      fileTypeQuickMode: quickModeOverride,
    })
  }

  // Persist **active tab only** to the URL. Other tabs live in session (save on tab switch).
  useEffect(() => {
    const mode = searchParams.get('mode')
    const urlMode: TabMode = mode === 'duplicates' || mode === 'uniques' ? mode : 'search'
    if (urlMode !== searchMode) return
    const urlHasPrimaryOrCompare =
      (searchParams.get('mode') === 'duplicates' || searchParams.get('mode') === 'uniques') &&
      (searchParams.get('primary') || searchParams.getAll('compare').length > 0)
    const stateHasNone = !primaryTroveId && (searchMode === 'duplicates' ? !dupCompareTroveIds.size : !uniqCompareTroveIds.size)
    if (urlHasPrimaryOrCompare && stateHasNone) return
    const urlHasQuery = searchParams.get('q') != null && searchParams.get('q') !== ''
    const urlHasTrove = searchParams.getAll('trove').length > 0
    const urlHasFileTypes = parseFileTypesQueryValues(searchParams.getAll('fileTypes')).length > 0
    const urlHasRequireFileTypes = parseFileTypesQueryValues(searchParams.getAll('requireFileTypes')).length > 0
    const urlQuickMode = normalizeFileTypeQuickMode(searchParams.get('ftq'))
    const urlHasThumbs = searchParams.get('thumbs') === '1'
    const urlHasExtraFields = searchParams.getAll('extraFields').length > 0
    const searchStateNotSynced =
      searchMode === 'search' &&
      ((urlHasQuery && (!searchQuery || (searchQuery ?? '').trim() === '')) ||
        (urlHasTrove && searchSelectedTroveIds.size === 0) ||
        (urlHasFileTypes && fileTypeFilters.size === 0) ||
        (urlHasRequireFileTypes && requiredFileTypes.size === 0) ||
        (urlQuickMode !== fileTypeQuickMode) ||
        (urlHasThumbs && !thumbnailOnly) ||
        (urlHasExtraFields && extraGridFieldsSelected.size === 0))
    if (searchStateNotSynced) return
    const next = buildAppUrlParams()
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [
    searchQuery,
    dupQuery,
    uniqQuery,
    searchMode,
    searchSelectedTroveIds,
    primaryTroveId,
    dupCompareTroveIds,
    uniqCompareTroveIds,
    fileTypeFilters,
    requiredFileTypes,
    fileTypeQuickMode,
    thumbnailOnly,
    boostTroveId,
    searchResultsViewMode,
    extraGridFieldsSelected,
    searchResult?.page,
    searchResult?.size,
    duplicatesResult?.page,
    uniquesResult?.page,
    pageSize,
    dupPageSize,
    uniqPageSize,
    duplicatesSortBy,
    duplicatesSortDir,
    uniquesSortBy,
    uniquesSortDir,
    starSortBy,
    starSortDir,
    otherSortBy,
    otherSortDir,
    searchParams,
  ])

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
      const urlFileTypes = new Set(parseFileTypesQueryValues(searchParams.getAll('fileTypes')))
      const fileTypesToUse = fileTypeFilters.size > 0 ? undefined : (urlFileTypes.size > 0 ? urlFileTypes : undefined)
      fetchSearch(initialPage, null, null, null, null, fileTypesToUse)
    }, 400)
    return () => clearTimeout(t)
  }, [searchMode, selectedTroveIds, searchParams, pageSize])

  useEffect(() => {
    setFreezeTroveListOrder(false)
  }, [searchMode])

  const prevBoostTroveIdRef = useRef<string | null | undefined>(undefined)
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

  useEffect(() => {
    if (!compareRawSourceLightbox) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCompareRawSourceLightbox(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [compareRawSourceLightbox])

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
    if (!searchQuery.trim()) {
      queryRef.current = '*'
      setSearchQuery('*')
    }
  }

  function handleTargetClick(troveId) {
    setFreezeTroveListOrder(true)
    selectOnlyTrove(troveId)
    if (searchMode === 'search' && !searchQuery.trim()) {
      queryRef.current = '*'
      setSearchQuery('*')
    } else if (searchMode === 'duplicates' && !dupQuery.trim()) {
      queryRef.current = '*'
      setDupQuery('*')
    } else if (searchMode === 'uniques' && !uniqQuery.trim()) {
      queryRef.current = '*'
      setUniqQuery('*')
    }
    if (searchMode === 'search') fetchSearch(0, null, new Set([troveId]))
  }

  /** Compare tab: set compare selection to this trove only (duplicates: allows self-compare). Uniques cannot use primary as compare — clear compare when target is primary. */
  function handleCompareTargetClick(troveId: string) {
    setFreezeTroveListOrder(true)
    if (searchMode === 'uniques' && troveId === primaryTroveId) {
      setSelectedTroveIds(new Set())
    } else {
      selectOnlyTrove(troveId)
    }
    if (searchMode === 'duplicates' && !dupQuery.trim()) {
      queryRef.current = '*'
      setDupQuery('*')
    } else if (searchMode === 'uniques' && !uniqQuery.trim()) {
      queryRef.current = '*'
      setUniqQuery('*')
    }
  }

  function cancelSearch() {
    abortControllerRef.current?.abort()
  }

  async function readCompareStream(
    url: string,
    signal: AbortSignal,
    onProgress: (current: number, total: number) => void,
    onDone: (result: unknown) => void
  ) {
    const res = await fetch(url, { credentials: 'include', headers: { ...getApiAuthHeaders() }, signal })
    if (res.status === 401) { window.location.href = '/login'; throw new Error('Unauthorized') }
    if (!res.ok) throw new Error(res.statusText)
    if (!res.body) throw new Error('No response body')
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

  function fetchDuplicates(
    pageNum: number,
    sizeOverride: number | null = null,
    sortByOverride: string | null = null,
    sortDirOverride: 'asc' | 'desc' | null = null
  ) {
    const q = queryRef.current.trim() || '*'
    const size = sizeOverride ?? dupPageSizeRef.current
    if (!primaryTroveId.trim()) {
      setDuplicatesResult({ total: 0, page: 0, size, rows: [] })
      return
    }
    const sortBy = sortByOverride !== undefined && sortByOverride !== null ? sortByOverride : duplicatesSortBy
    const sortDir = sortDirOverride !== undefined && sortDirOverride !== null ? sortDirOverride : duplicatesSortDir
    if (sortByOverride != null || sortDirOverride != null) {
      setDuplicatesSortBy(sortBy || null)
      setDuplicatesSortDir(sortDir)
    }
    const params = new URLSearchParams({
      primaryTrove: primaryTroveId.trim(),
      query: q,
      page: String(pageNum),
      size: String(size),
      maxMatches: '20',
    })
    if (sortBy) {
      params.set('sortBy', sortBy)
      params.set('sortDir', sortDir)
    }
    const compareIdsToSend = selectedTroveIds.size > 0 ? selectedTroveIds : new Set([primaryTroveId.trim()])
    compareIdsToSend.forEach((id) => params.append('compareTrove', id))
    const streamUrl = `/api/search/duplicates/stream?${params}`
    const restUrl = `/api/search/duplicates?${params}`
    const dupHit = queryCache.get(restUrl)
    if (dupHit) {
      const cached = dupHit.data as DuplicatesResultData
      setDuplicatesResult(cached)
      setDuplicatesPage(pageNum)
      setCompareQueryTiming({ durationMs: dupHit.durationMs, receivedAtMs: dupHit.receivedAtMs })
      const compareIdsToSend = selectedTroveIds.size > 0 ? selectedTroveIds : new Set([primaryTroveId.trim()])
      const dl = duplicatesHistoryLabels(
        troves,
        q,
        primaryTroveId.trim(),
        [...compareIdsToSend],
        sortBy || null,
        sortDir,
        cached.page,
        size
      )
      appendQueryHistoryEntry({
        mode: 'duplicates',
        ranAtMs: dupHit.receivedAtMs,
        durationMs: dupHit.durationMs,
        consoleQuery: buildAppUrlParams({ dupPage0BasedOverride: cached.page }).toString(),
        apiCacheKey: restUrl,
        resultCount: cached.total,
        summary: dl.summary,
        detail: dl.detail,
      })
      return
    }
    setCompareQueryTiming(null)
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    setSearching(true)
    setSearchError(null)
    setCompareProgress({ current: 0, total: 0 })
    if (compareIntervalRef.current) clearInterval(compareIntervalRef.current)
    compareTimerStartRef.current = Date.now()
    setCompareElapsedSec(0)
    compareIntervalRef.current = setInterval(() => {
      setCompareElapsedSec(Math.floor((Date.now() - (compareTimerStartRef.current ?? 0)) / 1000))
    }, 1000)
    readCompareStream(
      streamUrl,
      controller.signal,
      (current, total) => setCompareProgress({ current, total }),
      (data) => {
        const dup = data as DuplicatesResultData
        const receivedAtMs = Date.now()
        const durationMs = compareTimerStartRef.current != null ? receivedAtMs - compareTimerStartRef.current : 0
        queryCache.set(restUrl, dup, { durationMs, receivedAtMs })
        setCompareQueryTiming({ durationMs, receivedAtMs })
        setDuplicatesResult(dup)
        setDuplicatesPage(pageNum)
        setCompareProgress({ current: 0, total: 0 })
        const compareIdsToSend = selectedTroveIds.size > 0 ? selectedTroveIds : new Set([primaryTroveId.trim()])
        const dl = duplicatesHistoryLabels(
          troves,
          q,
          primaryTroveId.trim(),
          [...compareIdsToSend],
          sortBy || null,
          sortDir,
          dup.page,
          size
        )
        appendQueryHistoryEntry({
          mode: 'duplicates',
          ranAtMs: receivedAtMs,
          durationMs,
          consoleQuery: buildAppUrlParams({ dupPage0BasedOverride: dup.page }).toString(),
          apiCacheKey: restUrl,
          resultCount: dup.total,
          summary: dl.summary,
          detail: dl.detail,
        })
        refreshStatusMessage()
      }
    ).catch((err) => {
      if (err.name !== 'AbortError') setSearchError(err.message)
    }).finally(() => {
      if (compareIntervalRef.current) {
        clearInterval(compareIntervalRef.current)
        compareIntervalRef.current = null
      }
      if (compareTimerStartRef.current != null) {
        compareTimerStartRef.current = null
      }
      setCompareElapsedSec(0)
      setSearching(false)
      setCompareProgress({ current: 0, total: 0 })
    })
  }

  function fetchUniques(
    pageNum: number,
    sortByOverride: string | null = null,
    sortDirOverride: 'asc' | 'desc' | null = null,
    sizeOverride: number | null = null
  ) {
    const q = queryRef.current.trim() || '*'
    const size = sizeOverride ?? uniqPageSizeRef.current
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
    const uniqHit = queryCache.get(restUrl)
    if (uniqHit) {
      const cached = uniqHit.data as UniquesResultData
      setUniquesResult(cached)
      setUniquesPage(pageNum)
      setCompareQueryTiming({ durationMs: uniqHit.durationMs, receivedAtMs: uniqHit.receivedAtMs })
      const ul = uniquesHistoryLabels(
        troves,
        q,
        primaryTroveId.trim(),
        [...selectedTroveIds],
        sortBy || null,
        sortDir,
        cached.page,
        size
      )
      appendQueryHistoryEntry({
        mode: 'uniques',
        ranAtMs: uniqHit.receivedAtMs,
        durationMs: uniqHit.durationMs,
        consoleQuery: buildAppUrlParams({ uniqPage0BasedOverride: cached.page }).toString(),
        apiCacheKey: restUrl,
        resultCount: cached.total,
        summary: ul.summary,
        detail: ul.detail,
      })
      return
    }
    setCompareQueryTiming(null)
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    setSearching(true)
    setSearchError(null)
    setCompareProgress({ current: 0, total: 0 })
    if (compareIntervalRef.current) clearInterval(compareIntervalRef.current)
    compareTimerStartRef.current = Date.now()
    setCompareElapsedSec(0)
    compareIntervalRef.current = setInterval(() => {
      setCompareElapsedSec(Math.floor((Date.now() - (compareTimerStartRef.current ?? 0)) / 1000))
    }, 1000)
    readCompareStream(
      streamUrl,
      controller.signal,
      (current, total) => setCompareProgress({ current, total }),
      (data) => {
        const uniq = data as UniquesResultData
        const receivedAtMs = Date.now()
        const durationMs = compareTimerStartRef.current != null ? receivedAtMs - compareTimerStartRef.current : 0
        queryCache.set(restUrl, uniq, { durationMs, receivedAtMs })
        setCompareQueryTiming({ durationMs, receivedAtMs })
        setUniquesResult(uniq)
        setUniquesPage(pageNum)
        setCompareProgress({ current: 0, total: 0 })
        const ul = uniquesHistoryLabels(
          troves,
          q,
          primaryTroveId.trim(),
          [...selectedTroveIds],
          sortBy || null,
          sortDir,
          uniq.page,
          size
        )
        appendQueryHistoryEntry({
          mode: 'uniques',
          ranAtMs: receivedAtMs,
          durationMs,
          consoleQuery: buildAppUrlParams({ uniqPage0BasedOverride: uniq.page }).toString(),
          apiCacheKey: restUrl,
          resultCount: uniq.total,
          summary: ul.summary,
          detail: ul.detail,
        })
        refreshStatusMessage()
      }
    ).catch((err) => {
      if (err.name !== 'AbortError') setSearchError(err.message)
    }).finally(() => {
      if (compareIntervalRef.current) {
        clearInterval(compareIntervalRef.current)
        compareIntervalRef.current = null
      }
      if (compareTimerStartRef.current != null) {
        compareTimerStartRef.current = null
      }
      setCompareElapsedSec(0)
      setSearching(false)
      setCompareProgress({ current: 0, total: 0 })
    })
  }

  function handleSearch(e) {
    e?.preventDefault()
    if (searchMode === 'duplicates') {
      if (!primaryTroveId.trim()) return
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
    if (!searchQuery.trim()) {
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
    if (searchResult != null && searchQuery.trim()) fetchSearch(0, newSize)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('size', String(newSize))
    nextParams.set('page', '1')
    setSearchParams(nextParams, { replace: true })
  }
  function handleDupPageSizeChange(e) {
    const newSize = Number(e.target.value)
    setDupPageSize(newSize)
    if (duplicatesResult != null && primaryTroveId.trim()) fetchDuplicates(0, newSize)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('size', String(newSize))
    nextParams.set('page', '1')
    setSearchParams(nextParams, { replace: true })
  }
  function handleUniqPageSizeChange(e) {
    const newSize = Number(e.target.value)
    setUniqPageSize(newSize)
    if (uniquesResult != null && primaryTroveId.trim() && selectedTroveIds.size > 0) fetchUniques(0, null, null, newSize)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('size', String(newSize))
    nextParams.set('page', '1')
    setSearchParams(nextParams, { replace: true })
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
    const nextSortDir = defaultGallerySortDirForSortBy(nextSortBy)
    if (isStarQuery) {
      setStarSortBy(nextSortBy)
      setStarSortDir(nextSortDir)
    } else {
      setOtherSortBy(nextSortBy)
      setOtherSortDir(nextSortDir)
    }
    const q = queryRef.current
    if (!q.trim()) return
    const pageNum = searchResult != null && typeof searchResult.page === 'number' ? searchResult.page : 0
    fetchSearch(pageNum, null, null, nextSortBy, nextSortDir)
  }

  function toggleGallerySortDir() {
    const nextDir = effectiveSortDir === 'asc' ? 'desc' : 'asc'
    if (isStarQuery) {
      setStarSortDir(nextDir)
    } else {
      setOtherSortDir(nextDir)
    }
    const q = queryRef.current
    if (!q.trim()) return
    const pageNum = searchResult != null && typeof searchResult.page === 'number' ? searchResult.page : 0
    fetchSearch(pageNum, null, null, effectiveSortBy, nextDir)
  }

  const gallerySortValue = gallerySortSelectValue(effectiveSortBy)
  const gallerySortAfterFilterSlot = searchResultsViewMode === 'gallery'
    ? (
      <div className="gallery-sort-wrap">
        <div className="gallery-sort-trigger-wrap" role="group" aria-label="Gallery sort">
          <span className="gallery-sort-by-prefix">Sort</span>
          <button
            type="button"
            className="gallery-sort-dir-btn"
            onClick={toggleGallerySortDir}
            aria-label={effectiveSortDir === 'asc' ? 'Sort ascending, click to sort descending' : 'Sort descending, click to sort ascending'}
            title={effectiveSortDir === 'asc' ? 'Sort ascending (click to toggle)' : 'Sort descending (click to toggle)'}
          >
            {effectiveSortDir === 'asc' ? '↑' : '↓'}
          </button>
          <span className="gallery-sort-divider" aria-hidden="true" />
          <select
            value={gallerySortValue}
            onChange={handleGallerySortChange}
            className="gallery-sort-select"
            aria-label="Sort field"
          >
            {gallerySortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
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
    let bottomPoolExclusive: typeof withCounts = []
    if (doSplit) {
      let pool = withCounts
      if (showFilter === 'selected') {
        pool = pool.filter((t) => selectedTroveIds.has(t.id))
      } else if (showFilter === 'notSelected') {
        pool = pool.filter((t) => !selectedTroveIds.has(t.id))
      }
      bottomPoolExclusive = pool.filter(textMatches).filter((t) => !idsForSplit.has(t.id))
    }
    const selected = doSplit ? withCounts.filter((t) => idsForSplit.has(t.id)).sort(selectedSort) : []
    const notSelected = doSplit ? [...bottomPoolExclusive].sort(sortByName) : [...filtered].sort(sortByName)
    return { selected, notSelected, displaySelectedTroveIds: idsForSplit }
  }, [troves, searchResult, troveFilter, showFilter, selectedTroveIds, searchMode, freezeTroveListOrder, boostTroveId])

  return (
    <div className="desktop-app">
      <h1 className="app-title">
        <span className="search-title-brand">Morsor</span> <span className="sidebar-title-note">More lists than you needed</span>
      </h1>
      <div className="app-layout">
        <div className={`sidebar-wrapper ${sidebarOpen ? 'sidebar-wrapper--open' : ''}`}>
          <aside className="sidebar">
            <div className="trove-picker-panel">
              {(searchMode === 'duplicates' || searchMode === 'uniques') ? ((() => {
                const compareIds = searchMode === 'duplicates' ? dupCompareTroveIds : uniqCompareTroveIds
                const compareToSelfVisible = isCompareToSelfVisible(primaryTroveId, compareIds)
                return (
                  <>
                  <h2 className="trove-picker-heading">Troves</h2>
                  <div className="trove-picker-tabs" role="tablist" aria-label="Trove selection">
                    {(() => {
                      const primaryTabInvalid = searchMode === 'duplicates' ? !dupPrimaryTroveId : !uniqPrimaryTroveId
                      const compareTabInvalid = searchMode === 'duplicates'
                        ? false
                        : (uniqCompareTroveIds.size === 0 || uniqCompareTroveIds.has(uniqPrimaryTroveId))
                      return (
                        <>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={duplicatesTroveTab === 'primary'}
                            className={`trove-picker-tab ${duplicatesTroveTab === 'primary' ? 'trove-picker-tab--active' : ''}`}
                            onClick={() => setDuplicatesTroveTab('primary')}
                          >
                            <span>Primary</span>
                            {primaryTabInvalid && <img src="/exclamation.png" alt="" className="trove-picker-tab-invalid-icon" aria-hidden="true" />}
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={duplicatesTroveTab === 'compare'}
                            className={`trove-picker-tab ${duplicatesTroveTab === 'compare' ? 'trove-picker-tab--active' : ''}`}
                            onClick={() => setDuplicatesTroveTab('compare')}
                          >
                            <span>Compare</span>
                            {compareTabInvalid && <img src="/exclamation.png" alt="" className="trove-picker-tab-invalid-icon" aria-hidden="true" />}
                          </button>
                        </>
                      )
                    })()}
                  </div>
                  {duplicatesTroveTab === 'primary' && (() => {
                    const primarySelectedTrove = primaryTroveId ? troves.find((t) => t.id === primaryTroveId) : undefined
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
                            {primaryTroveId && (
                              <span
                                className={`trove-picker-compare-to-self-text ${compareToSelfVisible ? '' : 'trove-picker-compare-to-self-text--invisible'}`}
                                aria-hidden="true"
                              >
                                Comparing to self
                              </span>
                            )}
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
                          {primaryTroveFilter && (
                            <button
                              type="button"
                              className="sidebar-trove-filter-clear"
                              onClick={() => setPrimaryTroveFilter('')}
                              aria-label="Clear filter"
                            >
                              ×
                            </button>
                          )}
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
                          {primaryTroveId && (
                            <span
                              className={`trove-picker-compare-to-self-text ${compareToSelfVisible ? '' : 'trove-picker-compare-to-self-text--invisible'}`}
                              aria-hidden="true"
                            >
                              Comparing to self
                            </span>
                          )}
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
                        {troveFilter && (
                          <button
                            type="button"
                            className="sidebar-trove-filter-clear"
                            onClick={() => setTroveFilter('')}
                            aria-label="Clear filter"
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <ul className="trove-list">
                        {selectedTroves.map((t) => {
                          const isPrimaryDisabled = t.id === primaryTroveId
                          return (
                          <li
                            key={t.id}
                            className={`trove-item trove-item--selected ${searchResult != null && t.resultCount > 0 ? 'trove-item--has-results' : ''} ${isPrimaryDisabled ? 'trove-item--disabled' : ''}`}
                          >
                            <label className="trove-checkbox">
                              <input
                                type="checkbox"
                                checked={selectedTroveIds.has(t.id)}
                                disabled={isPrimaryDisabled}
                                onChange={() => !isPrimaryDisabled && toggleTrove(t.id)}
                              />
                              <span className="trove-name">
                                {t.name} {searchResult != null ? <span className="trove-count-suffix">({formatCount(t.resultCount)}/{formatCount(t.count)})</span> : `(${formatCount(t.count)})`}
                              </span>
                            </label>
                            {(selectedTroveIds.size !== 1 || !selectedTroveIds.has(t.id) || t.id === primaryTroveId) && (
                              <span className="trove-only-actions">
                                <button
                                  type="button"
                                  className="trove-only-link"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCompareTargetClick(t.id) }}
                                  aria-label={`Compare only ${t.name}`}
                                  title="Only this trove"
                                >
                                  <img src="/target.png" alt="" className="trove-only-icon" />
                                </button>
                              </span>
                            )}
                          </li>
                          )
                        })}
                        {selectedTroves.length > 0 && notSelectedTroves.length > 0 && (
                          <li className="trove-list-separator" aria-hidden="true">
                            <hr className="sidebar-separator" />
                          </li>
                        )}
                        {notSelectedTroves.map((t) => {
                          const isPrimaryDisabled = t.id === primaryTroveId
                          return (
                          <li
                            key={t.id}
                            className={`trove-item ${selectedTroveIds.has(t.id) ? 'trove-item--selected' : ''} ${searchResult != null && t.resultCount > 0 ? 'trove-item--has-results' : ''} ${isPrimaryDisabled ? 'trove-item--disabled' : ''}`}
                          >
                            <label className="trove-checkbox">
                              <input
                                type="checkbox"
                                checked={selectedTroveIds.has(t.id)}
                                disabled={isPrimaryDisabled}
                                onChange={() => !isPrimaryDisabled && toggleTrove(t.id)}
                              />
                              <span className="trove-name">
                                {t.name} {searchResult != null ? <span className="trove-count-suffix">({formatCount(t.resultCount)}/{formatCount(t.count)})</span> : `(${formatCount(t.count)})`}
                              </span>
                            </label>
                            {(selectedTroveIds.size !== 1 || !selectedTroveIds.has(t.id) || t.id === primaryTroveId) && (
                              <span className="trove-only-actions">
                                <button
                                  type="button"
                                  className="trove-only-link"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCompareTargetClick(t.id) }}
                                  aria-label={`Compare only ${t.name}`}
                                  title="Only this trove"
                                >
                                  <img src="/target.png" alt="" className="trove-only-icon" />
                                </button>
                              </span>
                            )}
                          </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                  </>
                )
              })()) : (
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
              placeholder={(searchMode as string) === 'duplicates' ? 'Filter compare troves…' : 'Filter troves…'}
              className="sidebar-trove-filter-input"
              aria-label={(searchMode as string) === 'duplicates' ? 'Filter compare troves by name' : 'Filter troves by name'}
            />
            {troveFilter && (
              <button
                type="button"
                className="sidebar-trove-filter-clear"
                onClick={() => setTroveFilter('')}
                aria-label="Clear trove filter"
              >
                ×
              </button>
            )}
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
                    {t.name} {searchResult != null ? <span className="trove-count-suffix">({formatCount(t.resultCount)}/{formatCount(t.count)})</span> : `(${formatCount(t.count)})`}
                  </span>
                </label>
                {(selectedTroveIds.size !== 1 || !selectedTroveIds.has(t.id)) && (
                  <span className="trove-only-actions">
                    <button
                      type="button"
                      className="trove-only-link"
                      disabled={selectedTroveIds.size === 1 && !selectedTroveIds.has(t.id)}
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
                    {t.name} {searchResult != null ? <span className="trove-count-suffix">({formatCount(t.resultCount)}/{formatCount(t.count)})</span> : `(${formatCount(t.count)})`}
                  </span>
                </label>
                {(selectedTroveIds.size !== 1 || !selectedTroveIds.has(t.id)) && (
                  <span className="trove-only-actions">
                    <button
                      type="button"
                      className="trove-only-link"
                      disabled={selectedTroveIds.size === 1 && !selectedTroveIds.has(t.id)}
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
                  saveActiveTabSnapshot()
                  setSearchParams(
                    serializeUrlFromTabSessions(
                      'search',
                      {
                        search: loadSearchTabSession(),
                        duplicates: loadDuplicatesTabSession(),
                        uniques: loadUniquesTabSession(),
                      },
                      troves,
                      urlTroveId
                    ),
                    { replace: true }
                  )
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
                  saveActiveTabSnapshot()
                  let dup = loadDuplicatesTabSession() ?? DEFAULT_DUP_SESSION
                  const uniq = loadUniquesTabSession()
                  const dupEmpty = !dup.dupPrimaryTroveId && dup.dupCompareTroveIds.length === 0
                  if (dupEmpty && uniq && (uniq.uniqPrimaryTroveId || uniq.uniqCompareTroveIds.length > 0)) {
                    dup = {
                      ...dup,
                      dupPrimaryTroveId: uniq.uniqPrimaryTroveId,
                      dupCompareTroveIds: [...uniq.uniqCompareTroveIds],
                    }
                  }
                  setSearchParams(
                    serializeUrlFromTabSessions(
                      'duplicates',
                      {
                        search: loadSearchTabSession(),
                        duplicates: dup,
                        uniques: loadUniquesTabSession(),
                      },
                      troves,
                      urlTroveId
                    ),
                    { replace: true }
                  )
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
                  saveActiveTabSnapshot()
                  let uniq = loadUniquesTabSession() ?? DEFAULT_UNIQ_SESSION
                  const dup = loadDuplicatesTabSession()
                  const uniqEmpty = !uniq.uniqPrimaryTroveId && uniq.uniqCompareTroveIds.length === 0
                  const dupSelfCompare =
                    !!dup &&
                    dup.dupCompareTroveIds.length === 1 &&
                    dup.dupCompareTroveIds[0] === dup.dupPrimaryTroveId
                  if (uniqEmpty && dup && (dup.dupPrimaryTroveId || dup.dupCompareTroveIds.length > 0) && !dupSelfCompare) {
                    uniq = {
                      ...uniq,
                      uniqPrimaryTroveId: dup.dupPrimaryTroveId,
                      uniqCompareTroveIds: [...dup.dupCompareTroveIds],
                    }
                  }
                  setSearchParams(
                    serializeUrlFromTabSessions(
                      'uniques',
                      {
                        search: loadSearchTabSession(),
                        duplicates: loadDuplicatesTabSession(),
                        uniques: uniq,
                      },
                      troves,
                      urlTroveId
                    ),
                    { replace: true }
                  )
                }}
              >
                Find uniques
              </button>
            </div>
            <form onSubmit={handleSearch} className="search-form">
              <div className="search-form-row">
                <div className="search-query-wrap">
                  <div className="search-query-input-wrap">
                    <input
                      type="text"
                      value={searchMode === 'search' ? searchQuery : searchMode === 'duplicates' ? dupQuery : uniqQuery}
                      onChange={(e) => {
                        const v = e.target.value
                        if (searchMode === 'search') setSearchQuery(v)
                        else if (searchMode === 'duplicates') setDupQuery(v)
                        else setUniqQuery(v)
                        setFreezeTroveListOrder(false)
                      }}
                      onKeyDown={(e) => {
                        if (e.key !== 'Escape') return
                        e.preventDefault()
                        e.stopPropagation()
                        queryRef.current = ''
                        if (searchMode === 'search') {
                          setSearchQuery('')
                          setSearchResult({ count: 0, results: [], page: 0, size: pageSize })
                        } else if (searchMode === 'duplicates') {
                          setDupQuery('')
                          setDuplicatesResult({ total: 0, page: 0, size: dupPageSize, rows: [] })
                        } else {
                          setUniqQuery('')
                          setUniquesResult({ total: 0, page: 0, size: uniqPageSize, results: [] })
                        }
                      }}
                      placeholder="e.g. Greek, Prince, Albanian, Alien — or * for all"
                      className="search-query-input"
                      aria-label="Query"
                    />
                    {(searchMode === 'search' ? searchQuery : searchMode === 'duplicates' ? dupQuery : uniqQuery) && (
                      <button
                        type="button"
                        className="search-query-clear"
                        onClick={() => {
                          queryRef.current = ''
                          setFreezeTroveListOrder(false)
                          if (searchMode === 'search') {
                            setSearchQuery('')
                            setSearchResult({ count: 0, results: [], page: 0, size: pageSize })
                            setDuplicatesResult(null)
                            setUniquesResult(null)
                          } else if (searchMode === 'duplicates') {
                            setDupQuery('')
                            setDuplicatesResult({ total: 0, page: 0, size: dupPageSize, rows: [] })
                          } else {
                            setUniqQuery('')
                            setUniquesResult({ total: 0, page: 0, size: uniqPageSize, results: [] })
                          }
                        }}
                        aria-label="Clear query"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <span className="search-query-actions">
                    <button
                      type="button"
                      className="search-query-btn"
                      title="Search all (*)"
                      onClick={() => {
                        queryRef.current = '*'
                        if (searchMode === 'search') setSearchQuery('*')
                        else if (searchMode === 'duplicates') setDupQuery('*')
                        else setUniqQuery('*')
                        setFreezeTroveListOrder(false)
                        if (searchMode === 'duplicates') {
                          if (primaryTroveId.trim()) {
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
                  </span>
                </div>
                <button type="submit" disabled={searching} className="search-submit-btn" aria-label="Search" title="Search">
                  {searching ? 'Searching\u2026' : 'Go!'}
                </button>
                {searchMode === 'search' && (() => {
                  const upper = (s) => (s || '').toUpperCase()
                  const seenDisplay = new Set(ALL_KNOWN_FILE_TYPES.map(upper))
                  const displayFileTypes = [...ALL_KNOWN_FILE_TYPES]
                  ;(allAvailableFileTypes || []).forEach((t) => {
                    if (!seenDisplay.has(upper(t))) {
                      seenDisplay.add(upper(t))
                      displayFileTypes.push(t)
                    }
                  })
                  displayFileTypes.sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }))
                  const showMediaDropdown = (displayFileTypes.length >= 1 || fileTypeFilters.size > 0)
                  const showExtraFieldsPicker = extraFieldKeysOnPage.length > 0 && searchResultsViewMode === 'list'
                  if (!showMediaDropdown && !showExtraFieldsPicker) {
                    return null
                  }
                  const urlFileTypes = new Set(parseFileTypesQueryValues(searchParams.getAll('fileTypes')))
                  const fileTypesForLabel = fileTypeFilters.size > 0 ? fileTypeFilters : urlFileTypes
                  const availableUpper = new Set(displayFileTypes.map(upper))
                  const selectedUpper = new Set([...fileTypesForLabel].map(upper))
                  const allSelected = availableUpper.size > 0 && availableUpper.size === selectedUpper.size && [...availableUpper].every((t) => selectedUpper.has(t))
                  const hasFileTypeFilter = fileTypesForLabel.size > 0 && !allSelected
                  const anyQuickSelected = fileTypeQuickMode === FileTypeQuickMode.Any
                  const mehQuickSelected = fileTypeQuickMode === FileTypeQuickMode.Meh
                  const mehQuickActiveStyle = mehQuickSelected && fileTypesForLabel.size === 0
                  const hasThumbFilter = thumbnailOnly
                  const extraFieldKeysSelectedInPanel = extraFieldKeysOnPage.filter((k) => extraGridFieldsSelected.has(k))
                  const extraFieldKeysNotSelectedInPanel = extraFieldKeysOnPage.filter((k) => !extraGridFieldsSelected.has(k))
                  const extraFieldKeysSelectedFiltered = extraFieldKeysSelectedInPanel.filter((k) =>
                    extraFieldKeyMatchesFilter(k, extraFieldDropdownFilter)
                  )
                  const extraFieldKeysNotSelectedFiltered = extraFieldKeysNotSelectedInPanel.filter((k) =>
                    extraFieldKeyMatchesFilter(k, extraFieldDropdownFilter)
                  )
                  const renderExtraFieldOption = (jsonKey: string) => (
                    <label key={jsonKey} className="search-extra-fields-option" title={jsonKey}>
                      <input
                        type="checkbox"
                        checked={extraGridFieldsSelected.has(jsonKey)}
                        onChange={() => {
                          setExtraGridFieldsSelected((prev) => {
                            const next = new Set(prev)
                            if (next.has(jsonKey)) {
                              next.delete(jsonKey)
                            } else {
                              next.add(jsonKey)
                            }
                            return next
                          })
                        }}
                      />
                      {formatLittlePrinceFieldLabel(jsonKey)}
                    </label>
                  )
                  return (
                  <div className="search-form-media-extras-group">
                  {showMediaDropdown && (
                  <div className="search-filetype-dropdown-wrap" ref={fileTypeDropdownRef}>
                    <div className={`search-filetype-trigger-wrap${!(mehQuickSelected && !hasThumbFilter) ? ' search-filetype-trigger-wrap--filtered search-filetype-trigger-wrap--has-clear' : ''}`}>
                      <button
                        type="button"
                        className="search-filetype-dropdown-trigger"
                        onClick={() => setFileTypeDropdownOpen((o) => !o)}
                        aria-haspopup="listbox"
                        aria-expanded={fileTypeDropdownOpen}
                        aria-label="Filter by file type"
                      >
                        {hasThumbFilter
                          ? (anyQuickSelected || allSelected
                              ? <>Any media + {' '}<img src="/thumb-thumbnail.png" alt="" className="search-filetype-trigger-inline-icon" aria-hidden="true" /></>
                              : mehQuickSelected || fileTypesForLabel.size === 0
                                ? <>Must have {' '}<img src="/thumb-thumbnail.png" alt="" className="search-filetype-trigger-inline-icon" aria-hidden="true" /></>
                                : (() => {
                                    const groupNames = getFullySelectedGroupNames(fileTypesForLabel, displayFileTypes)
                                    const label = (groupNames != null && groupNames.length > 0) ? groupNames.join(', ') : (getGroupNameIfFullySelected(fileTypesForLabel, displayFileTypes) ?? [...fileTypesForLabel].sort().join(', '))
                                    return <>Only {label} + {' '}<img src="/thumb-thumbnail.png" alt="" className="search-filetype-trigger-inline-icon" aria-hidden="true" /></>
                                  })())
                          : (fileTypesForLabel.size === 0
                              ? (
                                  <>
                                    <span className="search-filetype-trigger-icons" aria-hidden="true">
                                      <img src="/pdf.svg" alt="" />
                                      <img src="/video.svg" alt="" />
                                      <img src="/audio.png" alt="" />
                                    </span>
                                    <span className="search-filetype-trigger-media-label">Media</span>
                                  </>
                                )
                              : allSelected
                                ? 'Any media'
                                : (() => {
                                    const groupNames = getFullySelectedGroupNames(fileTypesForLabel, displayFileTypes)
                                    const label = (groupNames != null && groupNames.length > 0) ? groupNames.join(', ') : (getGroupNameIfFullySelected(fileTypesForLabel, displayFileTypes) ?? [...fileTypesForLabel].sort().join(', '))
                                    return `Only ${label}`
                                  })())}
                      </button>
                      {!(mehQuickSelected && !hasThumbFilter) && (
                        <button
                          type="button"
                          className="search-filetype-clear"
                          title="Clear file type filter"
                          onClick={(e) => {
                            e.stopPropagation()
                            skipFileTypeSearchRef.current = true
                            lastFileTypeOrViewSearchRef.current = Date.now()
                            setThumbnailOnly(false)
                            setFileTypeQuickMode(FileTypeQuickMode.Meh)
                            setFileTypeFilters(new Set())
                            setRequiredFileTypes(new Set())
                            setSearchParams(buildSearchParams('search', searchSelectedTroveIds, dupPrimaryTroveId, dupCompareTroveIds, uniqPrimaryTroveId, uniqCompareTroveIds, new Set(), boostTroveId, searchResultsViewMode, false, FileTypeQuickMode.Meh, new Set()), { replace: true })
                            fetchSearch(0, null, null, null, null, new Set(), new Set())
                          }}
                          aria-label="Clear file type filter"
                        >
                          ×
                        </button>
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
                            className={`search-filetype-quick-btn search-filetype-quick-btn--thumb ${hasThumbFilter ? 'search-filetype-quick-btn--active' : ''}`}
                            onClick={(e) => {
                              e.preventDefault()
                              const nextThumbs = !thumbnailOnly
                              setThumbnailOnly(nextThumbs)
                              setSearchParams(buildSearchParams('search', searchSelectedTroveIds, dupPrimaryTroveId, dupCompareTroveIds, uniqPrimaryTroveId, uniqCompareTroveIds, null, boostTroveId, searchResultsViewMode, nextThumbs, fileTypeQuickMode), { replace: true })
                            }}
                            title="Must have a thumbnail image"
                            aria-label="Must have a thumbnail image"
                          >
                            <img src="/thumb-thumbnail.png" alt="" className="search-filetype-quick-icon" />
                          </button>
                          <button
                            type="button"
                            className={`search-filetype-quick-btn ${anyQuickSelected ? 'search-filetype-quick-btn--active' : ''}`}
                            title="Must have additional media (thumbnails and cover art excluded)"
                            onClick={(e) => {
                              e.preventDefault()
                              if (anyQuickSelected) return
                              skipFileTypeSearchRef.current = true
                              lastFileTypeOrViewSearchRef.current = Date.now()
                              const next = new Set(displayFileTypes.map(normalizeFileTypeToken))
                              const nextReq = pruneRequiredFileTypes(next, requiredFileTypes)
                              setFileTypeQuickMode(FileTypeQuickMode.Any)
                              setFileTypeFilters(next)
                              setRequiredFileTypes(nextReq)
                              setSearchParams(buildSearchParams('search', searchSelectedTroveIds, dupPrimaryTroveId, dupCompareTroveIds, uniqPrimaryTroveId, uniqCompareTroveIds, next, boostTroveId, searchResultsViewMode, undefined, FileTypeQuickMode.Any, nextReq), { replace: true })
                              fetchSearch(0, null, null, null, null, next, nextReq)
                            }}
                          >
                            <span className="search-filetype-quick-prefix search-filetype-quick-prefix--asterisk" aria-hidden="true">*</span> Any
                          </button>
                          <button
                            type="button"
                            className={`search-filetype-quick-btn ${mehQuickActiveStyle ? 'search-filetype-quick-btn--active' : ''}`}
                            title="Additional media not required"
                            onClick={(e) => {
                              e.preventDefault()
                              if (mehQuickSelected && fileTypesForLabel.size === 0) return
                              skipFileTypeSearchRef.current = true
                              lastFileTypeOrViewSearchRef.current = Date.now()
                              const next = new Set<string>()
                              setFileTypeQuickMode(FileTypeQuickMode.Meh)
                              setFileTypeFilters(next)
                              setRequiredFileTypes(new Set())
                              setSearchParams(buildSearchParams('search', searchSelectedTroveIds, dupPrimaryTroveId, dupCompareTroveIds, uniqPrimaryTroveId, uniqCompareTroveIds, next, boostTroveId, searchResultsViewMode, undefined, FileTypeQuickMode.Meh, new Set()), { replace: true })
                              fetchSearch(0, null, null, null, null, next, new Set())
                            }}
                          >
                            <span className="search-filetype-quick-prefix" aria-hidden="true">×</span> Meh
                          </button>
                        </div>
                        <div className="search-filetype-dropdown-require-header" aria-hidden="true">
                          <span className="search-filetype-dropdown-require-header-label">Must include</span>
                          <span className="search-filetype-dropdown-require-header-mark">!</span>
                        </div>
                        {groupFileTypes(displayFileTypes).map(({ group, types }) => {
                          const allSelected = types.every((ft) => fileTypeSetHas(fileTypeFilters, ft))
                          const someSelected = types.some((ft) => fileTypeSetHas(fileTypeFilters, ft))
                          return (
                          <div key={group ?? 'other'} className="search-filetype-group">
                            {group != null && (
                              <div className="search-filetype-group-header-row">
                                <label className="search-filetype-group-header">
                                  <input
                                    type="checkbox"
                                    ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
                                    checked={allSelected}
                                    onChange={() => {
                                      skipFileTypeSearchRef.current = true
                                      lastFileTypeOrViewSearchRef.current = Date.now()
                                      const next = new Set([...fileTypeFilters].map(normalizeFileTypeToken))
                                      if (allSelected) types.forEach((t) => next.delete(normalizeFileTypeToken(t)))
                                      else types.forEach((t) => next.add(normalizeFileTypeToken(t)))
                                      const nextReq = pruneRequiredFileTypes(next, requiredFileTypes)
                                      if (anyQuickSelected) setFileTypeQuickMode(FileTypeQuickMode.Meh)
                                      setFileTypeFilters(next)
                                      setRequiredFileTypes(nextReq)
                                      setSearchParams(buildSearchParams('search', searchSelectedTroveIds, dupPrimaryTroveId, dupCompareTroveIds, uniqPrimaryTroveId, uniqCompareTroveIds, next, boostTroveId, searchResultsViewMode, undefined, anyQuickSelected ? FileTypeQuickMode.Meh : fileTypeQuickMode, nextReq), { replace: true })
                                      fetchSearch(0, null, null, null, null, next, nextReq)
                                    }}
                                  />
                                  {group}
                                </label>
                                <button
                                  type="button"
                                  className="search-filetype-group-complement"
                                  title={`Complement selection in ${group}`}
                                  aria-label={`Complement selection in ${group}`}
                                  disabled={!someSelected || allSelected}
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    skipFileTypeSearchRef.current = true
                                    lastFileTypeOrViewSearchRef.current = Date.now()
                                    const next = new Set([...fileTypeFilters].map(normalizeFileTypeToken))
                                    types.forEach((t) => {
                                      const nt = normalizeFileTypeToken(t)
                                      if (next.has(nt)) next.delete(nt)
                                      else next.add(nt)
                                    })
                                    const nextReq = pruneRequiredFileTypes(next, requiredFileTypes)
                                    if (anyQuickSelected) setFileTypeQuickMode(FileTypeQuickMode.Meh)
                                    setFileTypeFilters(next)
                                    setRequiredFileTypes(nextReq)
                                    setSearchParams(buildSearchParams('search', searchSelectedTroveIds, dupPrimaryTroveId, dupCompareTroveIds, uniqPrimaryTroveId, uniqCompareTroveIds, next, boostTroveId, searchResultsViewMode, undefined, anyQuickSelected ? FileTypeQuickMode.Meh : fileTypeQuickMode, nextReq), { replace: true })
                                    fetchSearch(0, null, null, null, null, next, nextReq)
                                  }}
                                >
                                  <img src="/complement.png" alt="" aria-hidden="true" />
                                </button>
                              </div>
                            )}
                            {types.map((ft) => (
                              <div key={ft} className="search-filetype-option-row">
                                <label className="search-filetype-option">
                                  <input
                                    type="checkbox"
                                    checked={fileTypeSetHas(fileTypeFilters, ft)}
                                    onChange={() => {
                                      skipFileTypeSearchRef.current = true
                                      lastFileTypeOrViewSearchRef.current = Date.now()
                                      const nft = normalizeFileTypeToken(ft)
                                      const next = new Set([...fileTypeFilters].map(normalizeFileTypeToken))
                                      if (next.has(nft)) next.delete(nft)
                                      else next.add(nft)
                                      const nextReq = pruneRequiredFileTypes(next, requiredFileTypes)
                                      if (anyQuickSelected) setFileTypeQuickMode(FileTypeQuickMode.Meh)
                                      setFileTypeFilters(next)
                                      setRequiredFileTypes(nextReq)
                                      setSearchParams(buildSearchParams('search', searchSelectedTroveIds, dupPrimaryTroveId, dupCompareTroveIds, uniqPrimaryTroveId, uniqCompareTroveIds, next, boostTroveId, searchResultsViewMode, undefined, anyQuickSelected ? FileTypeQuickMode.Meh : fileTypeQuickMode, nextReq), { replace: true })
                                      fetchSearch(0, null, null, null, null, next, nextReq)
                                    }}
                                  />
                                  {ft}
                                  {searchResult?.fileTypeCounts != null && typeof searchResult.fileTypeCounts[ft] === 'number' && (
                                    <span className="search-filetype-option-count" aria-hidden="true"> ({formatCount(searchResult.fileTypeCounts[ft])})</span>
                                  )}
                                  {ft === 'Link' && <img src="/link.png" alt="" className="search-filetype-option-icon" aria-hidden="true" />}
                                  {ft === 'PDF' && <img src="/pdf.png" alt="" className="search-filetype-option-icon" aria-hidden="true" />}
                                  {['JPG', 'JPEG', 'GIF', 'WEBP', 'TIFF', 'PNG'].includes(ft) && <img src="/image.png" alt="" className="search-filetype-option-icon" aria-hidden="true" />}
                                  {['RDF', 'TXT', 'DOC', 'DOCX'].includes(ft) && <img src="/document.png" alt="" className="search-filetype-option-icon" aria-hidden="true" />}
                                  {['MP4', 'M4V', 'AVI', 'MOV', 'MKV'].includes(ft) && <img src="/video.svg" alt="" className="search-filetype-option-icon" aria-hidden="true" />}
                                  {ft === 'MP3' && <img src="/audio.png" alt="" className="search-filetype-option-icon" aria-hidden="true" />}
                                  {['EPUB', 'MOBI'].includes(ft) && <img src="/book.svg" alt="" className="search-filetype-option-icon" aria-hidden="true" />}
                                  {ft === 'ZIP' && <img src="/zip.png" alt="" className="search-filetype-option-icon" aria-hidden="true" />}
                                </label>
                                <button
                                  type="button"
                                  className={`search-filetype-require-btn${fileTypeSetHas(requiredFileTypes, ft) ? ' search-filetype-require-btn--active' : ''}`}
                                  title={
                                    fileTypeSetHas(requiredFileTypes, ft)
                                      ? 'Must include this type (on)'
                                      : fileTypeSetHas(fileTypeFilters, ft)
                                        ? 'Require this type: result must include it'
                                        : 'Require this type (adds it to the filter if needed)'
                                  }
                                  aria-label={fileTypeSetHas(requiredFileTypes, ft) ? `Required: ${ft}` : `Require ${ft}`}
                                  aria-pressed={fileTypeSetHas(requiredFileTypes, ft)}
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    skipFileTypeSearchRef.current = true
                                    lastFileTypeOrViewSearchRef.current = Date.now()
                                    const nft = normalizeFileTypeToken(ft)
                                    const nextFt = new Set([...fileTypeFilters].map(normalizeFileTypeToken))
                                    const nextReq = new Set([...requiredFileTypes].map(normalizeFileTypeToken))
                                    if (nextReq.has(nft)) {
                                      nextReq.delete(nft)
                                    } else {
                                      nextReq.add(nft)
                                      nextFt.add(nft)
                                    }
                                    if (anyQuickSelected) setFileTypeQuickMode(FileTypeQuickMode.Meh)
                                    setFileTypeFilters(nextFt)
                                    setRequiredFileTypes(nextReq)
                                    setSearchParams(
                                      buildSearchParams(
                                        'search',
                                        searchSelectedTroveIds,
                                        dupPrimaryTroveId,
                                        dupCompareTroveIds,
                                        uniqPrimaryTroveId,
                                        uniqCompareTroveIds,
                                        nextFt,
                                        boostTroveId,
                                        searchResultsViewMode,
                                        undefined,
                                        anyQuickSelected ? FileTypeQuickMode.Meh : fileTypeQuickMode,
                                        nextReq
                                      ),
                                      { replace: true }
                                    )
                                    fetchSearch(0, null, null, null, null, nextFt, nextReq)
                                  }}
                                >
                                  !
                                </button>
                              </div>
                            ))}
                          </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  )}
                  {showExtraFieldsPicker && (
                    <div
                      className="search-extra-fields-dropdown-wrap"
                      ref={extraFieldDropdownRef}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className={`search-extra-fields-trigger-wrap${extraGridFieldsSelected.size > 0 ? ' search-extra-fields-trigger-wrap--active' : ''}`}>
                        <button
                          type="button"
                          className="search-extra-fields-dropdown-trigger"
                          onClick={() => setExtraFieldDropdownOpen((o) => !o)}
                          aria-haspopup="listbox"
                          aria-expanded={extraFieldDropdownOpen}
                          aria-label="Choose extra fields to show in the list"
                        >
                          <img
                            src="/add-column.png"
                            alt=""
                            className="search-extra-fields-trigger-icon"
                            aria-hidden="true"
                          />
                          {extraGridFieldsSelected.size === 0
                            ? 'Extra fields'
                            : `${extraGridFieldsSelected.size} extra field${extraGridFieldsSelected.size !== 1 ? 's' : ''}`}
                        </button>
                      </div>
                      {extraFieldDropdownOpen && (
                        <div
                          className="search-extra-fields-dropdown-panel"
                          role="listbox"
                          aria-label="Extra fields to show as columns"
                        >
                          <div className="search-extra-fields-panel-header">
                            <div className="search-extra-fields-panel-filter-wrap">
                              <input
                                type="search"
                                className="search-extra-fields-panel-filter"
                                value={extraFieldDropdownFilter}
                                onChange={(e) => setExtraFieldDropdownFilter(e.target.value)}
                                onKeyDown={(e) => e.stopPropagation()}
                                placeholder="Filter…"
                                aria-label="Filter extra fields list"
                              />
                              {extraFieldDropdownFilter.trim() !== '' && (
                                <button
                                  type="button"
                                  className="search-extra-fields-panel-filter-clear"
                                  title="Clear filter"
                                  aria-label="Clear filter"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setExtraFieldDropdownFilter('')
                                  }}
                                >
                                  ×
                                </button>
                              )}
                            </div>
                            <button
                              type="button"
                              className="search-extra-fields-panel-clear-btn"
                              disabled={extraGridFieldsSelected.size === 0}
                              onClick={() => {
                                if (extraGridFieldsSelected.size === 0) {
                                  return
                                }
                                setExtraGridFieldsSelected(new Set())
                              }}
                              aria-label="Clear all selected extra field columns"
                            >
                              Clear
                            </button>
                          </div>
                          {extraFieldKeysSelectedFiltered.map(renderExtraFieldOption)}
                          {extraFieldKeysSelectedFiltered.length > 0 && extraFieldKeysNotSelectedFiltered.length > 0 && (
                            <div className="search-extra-fields-separator" aria-hidden="true">
                              <hr className="sidebar-separator" />
                            </div>
                          )}
                          {extraFieldKeysNotSelectedFiltered.map(renderExtraFieldOption)}
                        </div>
                      )}
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
            <div ref={compareSectionRef}>
            {(searchMode === 'duplicates' || searchMode === 'uniques') &&
              !searching &&
              ((searchMode === 'duplicates' && duplicatesResult == null) ||
                (searchMode === 'uniques' && uniquesResult == null)) && (
              <p className="search-count search-count-detail">
                Select <strong>Primary</strong> & <strong>Comparison</strong> troves
              </p>
            )}
            {(searchMode === 'duplicates' || searchMode === 'uniques') && searching && (() => {
              const hasTotal = compareProgress.total > 0
              const hasProgress = hasTotal && compareProgress.current > 0 && compareElapsedSec > 0
              let etaSec: number | null = null
              if (hasProgress) {
                const rate = compareProgress.current / compareElapsedSec
                if (rate > 0) {
                  const remaining = (compareProgress.total - compareProgress.current) / rate
                  etaSec = Math.max(0, Math.round(remaining))
                }
              }
              // Smooth ETA using a moving average of the most recent 5 measurements
              let smoothedEtaSec: number | null = null
              if (etaSec != null) {
                const history = compareEtaHistoryRef.current
                history.push(etaSec)
                if (history.length > 5) history.splice(0, history.length - 5)
                const sum = history.reduce((acc, v) => acc + v, 0)
                smoothedEtaSec = Math.round(sum / history.length)
              } else {
                smoothedEtaSec = null
              }
              const etaLabel = smoothedEtaSec != null ? smoothedEtaSec : null
              return (
                <div className="duplicates-search-loading" aria-live="polite">
                  <span>{searchMode === 'duplicates' ? 'Finding duplicates…' : 'Finding uniques…'}</span>
                  <div
                    className="search-compare-progress-wrap"
                    role="progressbar"
                    aria-valuenow={hasTotal ? compareProgress.current : undefined}
                    aria-valuemin={0}
                    aria-valuemax={hasTotal ? compareProgress.total : undefined}
                    aria-label="Analysis progress"
                  >
                    <div className="search-compare-progress-track">
                      <div
                        className={`search-compare-progress-bar ${!hasTotal ? 'search-compare-progress-indeterminate' : ''}`}
                        style={hasTotal ? { width: `${(compareProgress.current / compareProgress.total) * 100}%` } : undefined}
                      />
                      {hasTotal && (() => {
                        const pct = Math.round((compareProgress.current / compareProgress.total) * 100)
                        return (
                          <span className={`search-compare-progress-percent ${pct < 50 ? 'search-compare-progress-percent-over-track' : ''}`}>{pct}%</span>
                        )
                      })()}
                    </div>
                    <span className="search-compare-progress-stats">
                      <span className="search-compare-progress-timer" aria-label="Estimated time remaining">
                        {etaLabel == null ? (
                          'ETA —'
                        ) : (() => {
                          let remaining = etaLabel
                          const h = Math.floor(remaining / 3600)
                          remaining %= 3600
                          const m = Math.floor(remaining / 60)
                          const s = remaining % 60
                          const parts: React.ReactNode[] = []
                          if (h > 0) parts.push(<><strong>{h}</strong>h</>)
                          if (m > 0 || h > 0) parts.push(<><strong>{m}</strong>m</>)
                          parts.push(<><strong>{s}</strong>s</>)
                          return (
                            <>
                              <span className="search-compare-progress-eta-label">ETA</span>
                              {parts.map((p, idx) => (
                                <span key={idx}>{p}</span>
                              ))}
                            </>
                          )
                        })()}
                      </span>
                      {hasTotal && <span className="search-compare-progress-stats-sep" aria-hidden="true">·</span>}
                      {hasTotal && (
                        <span className="search-compare-progress-count">{compareProgress.current}/{compareProgress.total}</span>
                      )}
                    </span>
                  </div>
                </div>
              )
            })()}
            {searchMode === 'duplicates' && duplicatesResult != null && !searching && (() => {
              const total = duplicatesResult.total ?? 0
              const pageNum = duplicatesResult.page ?? 0
              const size = duplicatesResult.size ?? 50
              const rows = Array.isArray(duplicatesResult.rows) ? duplicatesResult.rows : []
              const totalPages = size > 0 ? Math.ceil(total / size) : 0
              const from = total === 0 ? 0 : pageNum * size + 1
              const to = Math.min((pageNum + 1) * size, total)
              const primaryName = troves.find((t) => t.id === primaryTroveId)?.name ?? primaryTroveId
              const compareNamesList = [...selectedTroveIds].map((id) => troves.find((t) => t.id === id)?.name ?? id).join(', ')
              const compareDisplay = compareNamesList.length < 50 ? compareNamesList : `${selectedTroveIds.size} troves`
              const isSelfCompareDup = selectedTroveIds.size === 0 || (selectedTroveIds.size === 1 && selectedTroveIds.has(primaryTroveId))
              const compareSummary = isSelfCompareDup ? <strong>Self-compare</strong> : <><strong>Compare:</strong> {compareDisplay}</>
              return (
                <>
                  <p className="search-count search-count-detail">
                    <><strong>Primary:</strong> {primaryName} · {compareSummary}.<QueryTimingText timing={compareQueryTiming} /> </>{formatCount(total)} {isSelfCompareDup ? '' : 'primary '}item{total !== 1 ? 's' : ''} with possible duplicates.
                    {totalPages > 1 && ` Showing ${formatCount(from)}–${formatCount(to)}.`}
                  </p>
                  <div className="search-results-options">
                    <label className="page-size-label pagination-group-well">
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
                    const { start, end, pageNumbers } = paginationPageWindow(pageNum, totalPages, 5)
                    return (
                      <nav className="pagination" aria-label="Duplicate results pages">
                        <span className="pagination-group-well pagination-group-well--page">
                          <span className="pagination-info">
                            Page {formatCount(pageNum + 1)} of {formatCount(totalPages)}
                          </span>
                        </span>
                        <span className="pagination-group-well pagination-group-well--pages">
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
                        </span>
                      </nav>
                    )
                  })()}
                  </div>
                  <DuplicateResultsView
                    rows={rows}
                    sortBy={duplicatesSortBy}
                    sortDir={duplicatesSortDir}
                    onSortChange={(col, dir) => fetchDuplicates(0, null, col, dir)}
                    onOpenRawSource={(payload) => setCompareRawSourceLightbox(payload)}
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
              const isSelfCompareUniq = selectedTroveIds.size === 1 && selectedTroveIds.has(primaryTroveId)
              const compareSummary = isSelfCompareUniq ? <strong>Self-compare</strong> : <><strong>Compare:</strong> {compareDisplay}</>
              return (
                <>
                  <p className="search-count search-count-detail">
                    <><strong>Primary:</strong> {primaryName} · {compareSummary}.<QueryTimingText timing={compareQueryTiming} /> </>{formatCount(total)} item{total !== 1 ? 's' : ''}{isSelfCompareUniq ? ' ' : ' in primary '}are either unique or have no obvious match.
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
                    const { start, end, pageNumbers } = paginationPageWindow(pageNum, totalPages, 5)
                    return (
                      <nav className="pagination" aria-label="Uniques results pages">
                        <span className="pagination-group-well pagination-group-well--page">
                          <span className="pagination-info">
                            Page {formatCount(pageNum + 1)} of {formatCount(totalPages)}
                          </span>
                        </span>
                        <span className="pagination-group-well pagination-group-well--pages">
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
                        </span>
                      </nav>
                    )
                  })()}
                  </div>
                  <UniquesResultsView
                    results={results}
                    sortBy={uniquesSortBy}
                    sortDir={uniquesSortDir}
                    onSortChange={(col, dir) => fetchUniques(0, col, dir)}
                    onOpenRawSource={(payload) => setCompareRawSourceLightbox(payload)}
                  />
                </>
              )
            })()}
            {showCompareBackToTop && (
              <button
                type="button"
                className="back-to-top-btn"
                style={compareBackToTopCenterX != null ? { left: compareBackToTopCenterX } : undefined}
                onClick={() => {
                  const sc = compareScrollContainerRef.current
                  if (sc && 'scrollTo' in sc) sc.scrollTo({ top: 0, behavior: 'smooth' })
                  else window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                aria-label="Back to top"
                title="Back to top"
              >
                <span aria-hidden="true">▲</span>
              </button>
            )}
            </div>
            {searchMode === 'search' && searchResult != null && (() => {
              const results = Array.isArray(searchResult.results) ? searchResult.results : []
              const hasQuery = searchQuery.trim() !== ''
              if (!hasQuery) {
                return (
                  <>
                    <p className="search-count search-count-detail">
                      Enter a query to search. Optionally, select troves.
                    </p>
                    <SearchResultsGrid
                      data={results}
                      sortBy={effectiveSortBy}
                      sortDir={effectiveSortDir}
                      onSortChange={handleGridSortChange}
                      showScoreColumn={searchQuery.trim() !== '*'}
                      viewMode={searchResultsViewMode}
                      afterFilterSlot={gallerySortAfterFilterSlot}
                      showPdfSashInGallery
                      showGalleryDecorations={galleryDecorate}
                      visibleExtraFieldKeys={visibleExtraFieldKeysForGrid}
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
                    <QueryTimingText timing={searchQueryTiming} />
                  </p>
                  <div className="search-results-options">
                    <span className="search-results-options-view-group pagination-group-well">
                      <span className="view-mode-toggle" role="group" aria-label="Results view">
                        <span className="view-mode-label">View</span>
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
                          <img src="/list.png" alt="" aria-hidden="true" className="view-mode-btn-icon" />
                          <span className="view-mode-btn-label">List</span>
                        </button>
                        <button
                          type="button"
                          className={`view-mode-btn ${searchResultsViewMode === 'gallery' ? 'view-mode-btn--active' : ''}`}
                          onClick={() => {
                            skipViewModeSearchRef.current = true
                            lastFileTypeOrViewSearchRef.current = Date.now()
                            setSearchResultsViewMode('gallery')
                            const q = queryRef.current
                            if (q.trim()) {
                              const pageNum = searchResult != null && typeof searchResult.page === 'number' ? searchResult.page : 0
                              fetchSearch(pageNum, null, null, effectiveSortBy, effectiveSortDir)
                            }
                          }}
                          aria-pressed={searchResultsViewMode === 'gallery'}
                        >
                          <img src="/gallery.png" alt="" aria-hidden="true" className="view-mode-btn-icon" />
                          <span className="view-mode-btn-label">Gallery</span>
                        </button>
                      </span>
                      <span className={`gallery-decorate-wrap ${searchResultsViewMode !== 'gallery' ? 'gallery-decorate-wrap--hidden' : ''}`}>
                        <span className="gallery-decorate-label">Show Media Types</span>
                        <img
                          src={galleryDecorate ? '/decorated-picture.png' : '/undecorated-picture.png'}
                          alt=""
                          className="gallery-decorate-icon"
                          aria-hidden="true"
                        />
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
                      const { start, end, pageNumbers } = paginationPageWindow(pageNum, totalPages, 5)
                      return (
                        <nav className="pagination" aria-label="Search results pages">
                          <span className="pagination-group-well pagination-group-well--page">
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
                          </span>
                          <span className="pagination-group-well pagination-group-well--pages">
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
                          </span>
                        </nav>
                      )
                    })()}
                    <label className="page-size-label pagination-group-well">
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
                    sortBy={effectiveSortBy}
                    sortDir={effectiveSortDir}
                    onSortChange={handleGridSortChange}
                    showScoreColumn={searchQuery.trim() !== '*'}
                    viewMode={searchResultsViewMode}
                    afterFilterSlot={gallerySortAfterFilterSlot}
                    hideTroveInGallery={selectedTroveIds.size === 1}
                    hideTroveInList={selectedTroveIds.size === 1}
                    showPdfSashInGallery
                    showGalleryDecorations={galleryDecorate}
                    visibleExtraFieldKeys={visibleExtraFieldKeysForGrid}
                  />
                </>
              )
            })()}
          </section>
        </main>
      </div>
      {compareRawSourceLightbox && (
        <div
          className="search-raw-source-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Raw source"
          onClick={() => setCompareRawSourceLightbox(null)}
        >
          <button type="button" className="search-thumb-lightbox-close" onClick={() => setCompareRawSourceLightbox(null)} aria-label="Close">×</button>
          <div className="search-raw-source-lightbox-content" onClick={(e) => e.stopPropagation()}>
            {compareRawSourceLightbox.title && (
              <div className="search-thumb-lightbox-title">
                {compareRawSourceLightbox.title}
              </div>
            )}
            <pre className="search-raw-source-lightbox-pre">{compareRawSourceLightbox.rawSourceItem}</pre>
          </div>
          <div className="search-raw-source-lightbox-footer" onClick={(e) => e.stopPropagation()}>
            <div className="search-thumb-lightbox-raw-wrap">
              <span className="search-thumb-lightbox-raw-btn search-thumb-lightbox-raw-btn--label" aria-hidden="true">RAW</span>
            </div>
          </div>
        </div>
      )}
      <hr className="backend-status-divider" />
      <footer className="app-footer">
        <div className="app-footer-row">
          <Link to="/about" className="app-footer-link">About</Link>
          <Link to="/history" className="app-footer-link">History</Link>
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
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                    Clear Cache
                  </button>
                </>
              )}
              {' · '}
              <button
                type="button"
                className="app-footer-link app-footer-clear-cache"
                onClick={async () => {
                  if (reloadInProgressRef.current) return
                  reloadInProgressRef.current = true
                  const runId = ++reloadRunIdRef.current
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
                      if (runId === reloadRunIdRef.current) {
                        reloadInProgressRef.current = false
                        setReloadTrovesInProgress(false)
                      }
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
                            queryCache.clear()
                            const r = await fetch('/api/troves', { credentials: 'include', headers: { ...getApiAuthHeaders() } })
                            if (r.ok) { const arr = await r.json(); if (Array.isArray(arr)) setTroves(arr) }
                            refreshStatusMessage()
                          }
                        } catch (_) {}
                      }
                    }
                  } catch (_) {}
                  setReloadTrovesProgress({ current: 0, total: 0 })
                  if (runId === reloadRunIdRef.current) {
                    reloadInProgressRef.current = false
                    setReloadTrovesInProgress(false)
                  }
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
            {reloadTrovesProgress.total > 0 && (
              <div className="reload-troves-progress-wrap">
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
              </div>
            )}
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
