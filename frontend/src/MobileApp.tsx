import { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams, useLocation } from 'react-router-dom'
import type { SearchResultData, SearchResultRow, Trove, DuplicatesResultData, UniquesResultData } from './types'
import type { FileTypeQuickModeValue } from './fileTypeQuickMode'
import { getApiAuthHeaders } from './apiAuth'
import { getCsrfToken } from './getCsrfToken'
import { performLogout } from './performLogout'
import { queryCache } from './queryCache'
import { appendQueryHistoryEntry } from './queryHistory'
import { searchHistoryLabels, duplicatesHistoryLabels, uniquesHistoryLabels } from './queryHistoryLabels'
import type { QueryResultTiming } from './queryResultTiming'
import { QueryTimingText } from './QueryTimingText'
import { formatCount } from './formatCount'
import { groupFileTypes, getGroupNameIfFullySelected, ALL_KNOWN_FILE_TYPES } from './fileTypeGroups'
import { FileTypeQuickMode, normalizeFileTypeQuickMode } from './fileTypeQuickMode'
import { fileTypeSetHas, normalizeFileTypeToken, pruneRequiredFileTypes } from './fileTypeRequireUtils'
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
import './MobileApp.css'

const MOBILE_PAGE_SIZE = 100
const MOBILE_PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250, 500]
const DUP_UNIQUES_PAGE_SIZE = 50

const DEFAULT_DUP_SESSION: DuplicatesTabSession = {
  dupQuery: '',
  dupPrimaryTroveId: '',
  dupCompareTroveIds: [],
  dupPageSize: DUP_UNIQUES_PAGE_SIZE,
  duplicatesSortBy: null,
  duplicatesSortDir: 'asc',
}
const DEFAULT_UNIQ_SESSION: UniquesTabSession = {
  uniqQuery: '',
  uniqPrimaryTroveId: '',
  uniqCompareTroveIds: [],
  uniqPageSize: DUP_UNIQUES_PAGE_SIZE,
  uniquesSortBy: null,
  uniquesSortDir: 'asc',
}
const AMAZON_PLACEHOLDER_THUMB = 'https://m.media-amazon.com/images/I/01RmK+J4pJL._SS135_.gif'

interface FileTypePanelRect {
  top: number
  left: number
  width: number
}

function hasUsableThumbnail(row: SearchResultRow | undefined | null): boolean {
  if (row?.hasThumbnail === true) return true
  const thumbnailUrl = row?.thumbnailUrl
  if (!thumbnailUrl || !String(thumbnailUrl).trim()) return false
  const normalized = String(thumbnailUrl).trim()
  return normalized !== AMAZON_PLACEHOLDER_THUMB && !normalized.includes('/no_image')
}

function MobileApp() {
  const [troves, setTroves] = useState<Trove[]>([])
  const [searchParams, setSearchParams] = useSearchParams()
  const searchMode = (() => {
    const m = searchParams.get('mode')
    return (m === 'duplicates' || m === 'uniques' ? m : 'search') as 'search' | 'duplicates' | 'uniques'
  })()
  const [selectedTroveIds, setSelectedTroveIds] = useState<Set<string>>(() => new Set())
  const [dupPrimaryTroveId, setDupPrimaryTroveId] = useState('')
  const [dupCompareTroveIds, setDupCompareTroveIds] = useState<Set<string>>(() => new Set())
  const [uniqPrimaryTroveId, setUniqPrimaryTroveId] = useState('')
  const [uniqCompareTroveIds, setUniqCompareTroveIds] = useState<Set<string>>(() => new Set())
  const [trovePickerSubTab, setTrovePickerSubTab] = useState<'primary' | 'compare'>('primary')
  const [freezeTroveListOrder, setFreezeTroveListOrder] = useState(false)
  const [boostTroveId, setBoostTroveId] = useState<string | null>(null)
  const primaryTroveId = searchMode === 'duplicates' ? dupPrimaryTroveId : uniqPrimaryTroveId
  const compareTroveIds = searchMode === 'duplicates' ? dupCompareTroveIds : uniqCompareTroveIds
  const setPrimaryTroveId = searchMode === 'duplicates' ? setDupPrimaryTroveId : setUniqPrimaryTroveId
  const setCompareTroveIds = searchMode === 'duplicates' ? setDupCompareTroveIds : setUniqCompareTroveIds
  const [searchQuery, setSearchQuery] = useState('')
  const [dupQuery, setDupQuery] = useState('')
  const [uniqQuery, setUniqQuery] = useState('')
  const [urlSearchTroveIds, setUrlSearchTroveIds] = useState<Set<string>>(() => new Set())
  const [searchResult, setSearchResult] = useState<SearchResultData | null>(null)
  const [starSortBy, setStarSortBy] = useState<string | null>(null)
  const [starSortDir, setStarSortDir] = useState<'asc' | 'desc' | null>(null)
  const [otherSortBy, setOtherSortBy] = useState<string | null>(null)
  const [otherSortDir, setOtherSortDir] = useState<'asc' | 'desc' | null>(null)
  const [searching, setSearching] = useState(false)
  const [page, setPage] = useState(0)
  const [duplicatesResult, setDuplicatesResult] = useState<DuplicatesResultData | null>(null)
  const [duplicatesSortBy, setDuplicatesSortBy] = useState<string | null>(null)
  const [duplicatesSortDir, setDuplicatesSortDir] = useState<'asc' | 'desc'>('asc')
  const [duplicatesPage, setDuplicatesPage] = useState(0)
  const [dupPageSize, setDupPageSize] = useState(DUP_UNIQUES_PAGE_SIZE)
  const [uniquesResult, setUniquesResult] = useState<UniquesResultData | null>(null)
  const [uniquesPage, setUniquesPage] = useState(0)
  const [uniqPageSize, setUniqPageSize] = useState(DUP_UNIQUES_PAGE_SIZE)
  const [uniquesSortBy, setUniquesSortBy] = useState<string | null>(null)
  const [uniquesSortDir, setUniquesSortDir] = useState<'asc' | 'desc'>('asc')
  const [comparePageSizeDropdownOpen, setComparePageSizeDropdownOpen] = useState(false)
  const [mobileSearchPageInput, setMobileSearchPageInput] = useState('')
  const [showTrovePicker, setShowTrovePicker] = useState(false)
  const [trovePickerFilter, setTrovePickerFilter] = useState('')
  const [searchError, setSearchError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [statusTooltip, setStatusTooltip] = useState('')
  const [cacheEntries, setCacheEntries] = useState(0)
  const [cacheLabel, setCacheLabel] = useState('')
  const [compareProgress, setCompareProgress] = useState({ current: 0, total: 0 })
  const [compareElapsedSec, setCompareElapsedSec] = useState(0)
  const [compareQueryTiming, setCompareQueryTiming] = useState<QueryResultTiming | null>(null)
  const [searchQueryTiming, setSearchQueryTiming] = useState<QueryResultTiming | null>(null)
  const [compareRawSourceLightbox, setCompareRawSourceLightbox] = useState<{ title: string; rawSourceItem: string } | null>(null)
  const [reloadTrovesInProgress, setReloadTrovesInProgress] = useState(false)
  const [reloadTrovesProgress, setReloadTrovesProgress] = useState({ current: 0, total: 0 })
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
  const [fileTypePanelRect, setFileTypePanelRect] = useState<FileTypePanelRect | null>(null)
  const [pageSizeDropdownOpen, setPageSizeDropdownOpen] = useState(false)
  const [gallerySortDropdownOpen, setGallerySortDropdownOpen] = useState(false)
  const [searchResultsViewMode, setSearchResultsViewMode] = useState<'list' | 'gallery'>('list')
  const [extraGridFieldsSelected, setExtraGridFieldsSelected] = useState<Set<string>>(() => new Set())
  const [extraFieldDropdownOpen, setExtraFieldDropdownOpen] = useState(false)
  const [extraFieldDropdownFilter, setExtraFieldDropdownFilter] = useState('')
  const [galleryDecorate, setGalleryDecorate] = useState(true)
  const [copiedUrlFlare, setCopiedUrlFlare] = useState(false)
  const [shareIconFlash, setShareIconFlash] = useState(false)
  const [pageSize, setPageSize] = useState(() => {
    const p = new URLSearchParams(window.location.search)
    const s = Number(p.get('size'))
    return Number.isFinite(s) && s > 0 ? s : MOBILE_PAGE_SIZE
  })
  const queryRef = useRef('')
  const skipSearchRef = useRef(true)
  const skipFileTypeSearchRef = useRef(false)
  const skipViewModeSearchRef = useRef(false)
  const skipPageNavSearchRef = useRef(false)
  const lastFileTypeOrViewSearchRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const searchRequestIdRef = useRef(0)
  /** Holds the full (unpaged) search result rows from the most recent fetchSearch. Used by onFetchAllForCopy. */
  const fullSearchResultsRef = useRef<import('./types').SearchResultRow[] | null>(null)
  const reloadAbortControllerRef = useRef<AbortController | null>(null)
  const reloadRunIdRef = useRef(0)
  const reloadInProgressRef = useRef(false)
  const compareTimerStartRef = useRef<number | null>(null)
  const compareIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const compareEtaHistoryRef = useRef<number[]>([])
  const fileTypeDropdownRef = useRef<HTMLDivElement | null>(null)
  const extraFieldDropdownRef = useRef<HTMLDivElement | null>(null)
  const pageSizeDropdownRef = useRef<HTMLDivElement | null>(null)
  const comparePageSizeDropdownRef = useRef<HTMLDivElement | null>(null)
  const gallerySortDropdownRef = useRef<HTMLDivElement | null>(null)
  const copyFlareTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mobileMainRef = useRef<HTMLElement | null>(null)
  const [mobileMainGapTopOpen, setMobileMainGapTopOpen] = useState(true)
  const [mobileMainGapBottomOpen, setMobileMainGapBottomOpen] = useState(false)
  const location = useLocation()
  useLayoutEffect(() => {
    queryRef.current = searchMode === 'search' ? searchQuery : searchMode === 'duplicates' ? dupQuery : uniqQuery
  }, [searchMode, searchQuery, dupQuery, uniqQuery])
  const isStarQuery = (searchQuery ?? '').trim() === '*'
  const effectiveSortBy = isStarQuery ? (starSortBy ?? 'title') : (otherSortBy ?? 'score')
  const effectiveSortDir = isStarQuery ? (starSortDir ?? 'asc') : (otherSortDir ?? 'desc')

  const isDupOrUniques = searchMode === 'duplicates' || searchMode === 'uniques'

  const extraFieldKeysOnPage = useMemo(() => {
    if (searchMode !== 'search' || !Array.isArray(searchResult?.results)) {
      return [] as string[]
    }
    return collectExtraFieldKeysFromRows(searchResult.results)
  }, [searchMode, searchResult?.results])

  const visibleExtraFieldKeysForGrid = useMemo(
    () => [...extraGridFieldsSelected],
    [extraGridFieldsSelected]
  )

  const mobileOverflowDropdownOpen = fileTypeDropdownOpen || extraFieldDropdownOpen

  useLayoutEffect(() => {
    if (!fileTypeDropdownOpen) {
      setFileTypePanelRect(null)
      return
    }
    const el = fileTypeDropdownRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || rect.width
    const edgePadding = 8
    const minPanelWidth = 176
    const panelWidth = Math.min(
      Math.max(rect.width, minPanelWidth),
      Math.max(minPanelWidth, viewportWidth - edgePadding * 2)
    )
    const maxLeft = Math.max(edgePadding, viewportWidth - panelWidth - edgePadding)
    const left = Math.min(Math.max(edgePadding, rect.left), maxLeft)
    setFileTypePanelRect({ top: rect.bottom + 4, left, width: panelWidth })
  }, [fileTypeDropdownOpen])

  function urlTroveId(value: string | null | undefined, troveList: Trove[] | undefined | null): string | null {
    if (!value || !troveList?.length) return value || null
    const t = troveList.find((x) => x.id === value || (x.name && x.name === value))
    return t ? t.id : value
  }

  function saveActiveTabSnapshot() {
    if (searchMode === 'search') {
      saveSearchTabSession({
        searchQuery,
        searchSelectedTroveIds: [...urlSearchTroveIds],
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
        searchPage0Based: typeof searchResult?.page === 'number' ? searchResult.page : page,
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
    if (!s) return
    setSearchQuery(s.searchQuery)
    const ids = new Set(s.searchSelectedTroveIds)
    setUrlSearchTroveIds(ids)
    setSelectedTroveIds(ids)
    setPageSize(s.pageSize)
    setFileTypeFilters(new Set(s.fileTypeFilters.map(normalizeFileTypeToken)))
    setRequiredFileTypes(new Set((s.requiredFileTypes ?? []).map(normalizeFileTypeToken)))
    setFileTypeQuickMode(s.fileTypeQuickMode)
    setThumbnailOnly(s.thumbnailOnly)
    setBoostTroveId(s.boostTroveId)
    setSearchResultsViewMode(s.searchResultsViewMode)
    setExtraGridFieldsSelected(new Set(s.extraGridFields))
    setStarSortBy(s.starSortBy)
    setStarSortDir(s.starSortDir)
    setOtherSortBy(s.otherSortBy)
    setOtherSortDir(s.otherSortDir)
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

  /** Active tab from URL; inactive tabs from session. */
  useEffect(() => {
    const u = deserializeActiveTabFromUrl(searchParams, troves, urlTroveId)
    const sSearch = loadSearchTabSession()
    const sDup = loadDuplicatesTabSession()
    const sUniq = loadUniquesTabSession()

    if (u.mode === 'search') {
      setSearchQuery(u.searchQuery)
      const st = new Set(u.searchTroveIds)
      setUrlSearchTroveIds(st)
      setSelectedTroveIds(st)
      if (u.pageSize != null) setPageSize(u.pageSize)
      if (u.searchPageOneBased != null) setPage(u.searchPageOneBased - 1)
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
      if (u.dupPageOneBased != null) setDuplicatesPage(u.dupPageOneBased - 1)
      setDuplicatesSortBy(u.duplicatesSortBy)
      setDuplicatesSortDir(u.duplicatesSortDir)
      mergeSearchFromSession(sSearch)
      mergeUniqFromSession(sUniq)
    } else {
      setUniqQuery(u.uniqQuery)
      setUniqPrimaryTroveId(u.uniqPrimary)
      setUniqCompareTroveIds(new Set(u.uniqCompare))
      if (u.uniqPageSize != null) setUniqPageSize(u.uniqPageSize)
      if (u.uniqPageOneBased != null) setUniquesPage(u.uniqPageOneBased - 1)
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
      fileTypeFilters?: Set<string> | null
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
    const ft =
      overrides.fileTypeFilters !== undefined && overrides.fileTypeFilters !== null
        ? overrides.fileTypeFilters
        : fileTypeFilters
    const rft = overrides.requiredFileTypes !== undefined ? overrides.requiredFileTypes : requiredFileTypes
    const sq = (searchQuery ?? '').trim()
    const isStar = sq === '*'
    const effBy = mode === 'search' ? (isStar ? (starSortBy ?? 'title') : (otherSortBy ?? 'score')) : effectiveSortBy
    const effDir = mode === 'search' ? (isStar ? (starSortDir ?? 'asc') : (otherSortDir ?? 'desc')) : effectiveSortDir
    return serializeActiveTabToUrl({
      mode,
      searchQuery,
      searchTroveIds: overrides.searchTroveIds ?? urlSearchTroveIds,
      pageSize,
      searchPage0Based: searchResult?.page ?? page,
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
        overrides.dupPage0BasedOverride !== undefined
          ? overrides.dupPage0BasedOverride
          : duplicatesResult?.page ?? duplicatesPage,
      duplicatesSortBy,
      duplicatesSortDir,
      uniqQuery: overrides.uniqQuery ?? uniqQuery,
      uniqPrimary: overrides.uniqPrimary ?? uniqPrimaryTroveId,
      uniqCompare: overrides.uniqCompare ?? uniqCompareTroveIds,
      uniqPageSize: overrides.uniqPageSize ?? uniqPageSize,
      uniqPage0Based:
        overrides.uniqPage0BasedOverride !== undefined
          ? overrides.uniqPage0BasedOverride
          : uniquesResult?.page ?? uniquesPage,
      uniquesSortBy,
      uniquesSortDir,
      effectiveSearchSortBy: effBy,
      effectiveSearchSortDir: effDir,
      troves,
      urlTroveId,
    })
  }

  function buildSearchParams(
    fileTypesSet: Set<string> | null = null,
    searchTrovesOverride: Set<string> | null = null,
    boostOverride: string | null | undefined = undefined,
    thumbnailOnlyOverride?: boolean,
    quickModeOverride?: FileTypeQuickModeValue,
    requiredFileTypesOverride?: Set<string>
  ): URLSearchParams {
    const searchTroves = searchTrovesOverride !== null ? searchTrovesOverride : urlSearchTroveIds
    return buildAppUrlParams({
      searchTroveIds: searchTroves,
      fileTypeFilters: fileTypesSet,
      ...(requiredFileTypesOverride !== undefined ? { requiredFileTypes: requiredFileTypesOverride } : {}),
      boostTroveId: boostOverride,
      thumbnailOnly: thumbnailOnlyOverride,
      fileTypeQuickMode: quickModeOverride,
    })
  }

  function buildSearchParamsForMode(mode: 'search' | 'duplicates' | 'uniques', primary: string, compare: Set<string>): URLSearchParams {
    const dp = mode === 'duplicates' ? primary : dupPrimaryTroveId
    const dc = mode === 'duplicates' ? compare : dupCompareTroveIds
    const up = mode === 'uniques' ? primary : uniqPrimaryTroveId
    const uc = mode === 'uniques' ? compare : uniqCompareTroveIds
    return buildAppUrlParams({
      mode,
      dupPrimary: dp,
      dupCompare: dc,
      uniqPrimary: up,
      uniqCompare: uc,
    })
  }

  // Persist **active tab only** to the URL.
  useEffect(() => {
    const mode = searchParams.get('mode')
    const urlMode: TabMode = mode === 'duplicates' || mode === 'uniques' ? mode : 'search'
    if (urlMode !== searchMode) return
    const urlHasPrimaryOrCompare =
      (searchParams.get('mode') === 'duplicates' || searchParams.get('mode') === 'uniques') &&
      (searchParams.get('primary') || searchParams.getAll('compare').length > 0)
    const primaryTroveIdLocal = searchMode === 'duplicates' ? dupPrimaryTroveId : uniqPrimaryTroveId
    const stateHasNone =
      !primaryTroveIdLocal && (searchMode === 'duplicates' ? !dupCompareTroveIds.size : !uniqCompareTroveIds.size)
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
        (urlHasTrove && urlSearchTroveIds.size === 0) ||
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
    urlSearchTroveIds,
    dupPrimaryTroveId,
    dupCompareTroveIds,
    uniqPrimaryTroveId,
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
    page,
    pageSize,
    dupPageSize,
    uniqPageSize,
    duplicatesPage,
    uniquesPage,
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

  // Keep mobile search page input in sync with the current page (1-based)
  useEffect(() => {
    if (searchMode !== 'search') return
    setMobileSearchPageInput(String(page + 1))
  }, [searchMode, page])

  useEffect(() => {
    if (!fileTypeDropdownOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (fileTypeDropdownRef.current && !fileTypeDropdownRef.current.contains(e.target as Node)) {
        setFileTypeDropdownOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [fileTypeDropdownOpen])

  useEffect(() => {
    if (!pageSizeDropdownOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (pageSizeDropdownRef.current && !pageSizeDropdownRef.current.contains(e.target as Node)) {
        setPageSizeDropdownOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [pageSizeDropdownOpen])

  useEffect(() => {
    if (!fileTypeDropdownOpen) return
    function handleEscape(e: KeyboardEvent) {
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
    if (!pageSizeDropdownOpen) return
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setPageSizeDropdownOpen(false)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [pageSizeDropdownOpen])

  useEffect(() => {
    if (!comparePageSizeDropdownOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (comparePageSizeDropdownRef.current && !comparePageSizeDropdownRef.current.contains(e.target as Node)) {
        setComparePageSizeDropdownOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [comparePageSizeDropdownOpen])

  useEffect(() => {
    if (!comparePageSizeDropdownOpen) return
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setComparePageSizeDropdownOpen(false)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [comparePageSizeDropdownOpen])

  useEffect(() => {
    if (!gallerySortDropdownOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (gallerySortDropdownRef.current && !gallerySortDropdownRef.current.contains(e.target as Node)) {
        setGallerySortDropdownOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [gallerySortDropdownOpen])

  useEffect(() => {
    if (!gallerySortDropdownOpen) return
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setGallerySortDropdownOpen(false)
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [gallerySortDropdownOpen])

  useEffect(() => {
    if (!compareRawSourceLightbox) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCompareRawSourceLightbox(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [compareRawSourceLightbox])

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

  function fetchSearch(
    pageNum: number,
    sortByOverride: string | null = null,
    sortDirOverride: 'asc' | 'desc' | null = null,
    fileTypesOverride?: Set<string> | null,
    sizeOverride?: number | null,
    requiredFileTypesOverride?: Set<string>
  ): void {
    const size = sizeOverride ?? pageSize
    const q = queryRef.current.trim()
    if (!q) {
      setSearchResult({ count: 0, results: [], page: 0, size })
      setSearchQueryTiming(null)
      fullSearchResultsRef.current = null
      return
    }
    const fetchIsStarQuery = q === '*'
    const sortBy =
      sortByOverride != null
        ? sortByOverride
        : fetchIsStarQuery
          ? starSortBy ?? 'title'
          : otherSortBy ?? 'score'
    const sortDir =
      sortDirOverride != null
        ? sortDirOverride
        : fetchIsStarQuery
          ? starSortDir ?? 'asc'
          : otherSortDir ?? 'desc'
    const fileTypesToUseRaw =
      fileTypesOverride !== undefined && fileTypesOverride !== null ? fileTypesOverride : fileTypeFilters
    const fileTypesToUse = new Set([...fileTypesToUseRaw].map(normalizeFileTypeToken))
    const requiredToUse = requiredFileTypesOverride !== undefined ? requiredFileTypesOverride : requiredFileTypes
    const requiredEffective = new Set(
      [...requiredToUse].map(normalizeFileTypeToken).filter((t) => fileTypesToUse.has(t))
    )
    if (sortByOverride != null || sortDirOverride != null) {
      if (fetchIsStarQuery) {
        setStarSortBy(sortBy || null)
        setStarSortDir(sortDir)
      } else {
        setOtherSortBy(sortBy || null)
        setOtherSortDir(sortDir)
      }
    }

    // Build the full-result cache key (no page/size) so all pages of the same query share one cache entry.
    const fullKeyParams = new URLSearchParams({ query: q })
    selectedTroveIds.forEach((id) => fullKeyParams.append('trove', id))
    if (boostTroveId) fullKeyParams.set('boostTrove', boostTroveId)
    if (fileTypesToUse.size > 0) fullKeyParams.set('fileTypes', [...fileTypesToUse].sort().join(','))
    if (requiredEffective.size > 0) fullKeyParams.set('requireFileTypes', [...requiredEffective].sort().join(','))
    if (thumbnailOnly) fullKeyParams.set('thumbs', '1')
    if (sortBy) { fullKeyParams.set('sortBy', sortBy); fullKeyParams.set('sortDir', sortDir) }
    const fullCacheKey = `full:/api/search?${fullKeyParams}`

    abortRef.current?.abort()

    const fullHit = queryCache.get(fullCacheKey)
    if (fullHit) {
      const allData = fullHit.data as SearchResultData
      const pageResults = allData.results.slice(pageNum * size, (pageNum + 1) * size)
      const pagedData: SearchResultData = { ...allData, results: pageResults, page: pageNum, size }
      fullSearchResultsRef.current = allData.results
      setSearchResult(pagedData)
      setSearchQueryTiming({ durationMs: fullHit.durationMs, receivedAtMs: fullHit.receivedAtMs })
      if (Array.isArray(allData?.availableFileTypes) && allData.availableFileTypes.length > 0) {
        setAllAvailableFileTypes((prev) => {
          const next = new Set<string>(prev)
          allData.availableFileTypes!.forEach((t) => next.add(normalizeFileTypeToken(t)))
          return [...next].sort()
        })
      }
      const sl = searchHistoryLabels(
        troves, q, searchResultsViewMode, [...selectedTroveIds], sortBy || null, sortDir,
        fileTypesToUse, thumbnailOnly, boostTroveId, pageNum, size
      )
      appendQueryHistoryEntry({
        mode: 'search',
        ranAtMs: fullHit.receivedAtMs,
        durationMs: fullHit.durationMs,
        consoleQuery: buildAppUrlParams({ searchPage0BasedOverride: pageNum }).toString(),
        apiCacheKey: fullCacheKey,
        resultCount: allData.count,
        summary: sl.summary,
        detail: sl.detail,
      })
      return
    }

    // Cache miss: fetch the full result set in one request (page=0, large size).
    setSearchQueryTiming(null)
    const searchStartedAt = Date.now()
    const controller = new AbortController()
    abortRef.current = controller
    const requestId = ++searchRequestIdRef.current
    setSearching(true)
    const fullFetchParams = new URLSearchParams(fullKeyParams)
    fullFetchParams.set('page', '0')
    fullFetchParams.set('size', '10000')
    const fullFetchUrl = `/api/search?${fullFetchParams}`
    fetch(fullFetchUrl, { credentials: 'include', headers: { ...getApiAuthHeaders() }, signal: controller.signal })
      .then((res) => {
        if (res.status === 401) { window.location.href = '/login'; return Promise.reject() }
        return res.ok ? res.json() : Promise.reject(new Error(res.statusText))
      })
      .then((allData: SearchResultData) => {
        if (searchRequestIdRef.current !== requestId) return
        const receivedAtMs = Date.now()
        const durationMs = receivedAtMs - searchStartedAt
        queryCache.set(fullCacheKey, allData, { durationMs, receivedAtMs })
        fullSearchResultsRef.current = allData.results
        const pageResults = allData.results.slice(pageNum * size, (pageNum + 1) * size)
        const pagedData: SearchResultData = { ...allData, results: pageResults, page: pageNum, size }
        setSearchQueryTiming({ durationMs, receivedAtMs })
        setSearchResult(pagedData)
        if (Array.isArray(allData?.availableFileTypes) && allData.availableFileTypes.length > 0) {
          setAllAvailableFileTypes((prev) => {
            const next = new Set<string>(prev)
            allData.availableFileTypes!.forEach((t) => next.add(normalizeFileTypeToken(t)))
            return [...next].sort()
          })
        }
        const sl = searchHistoryLabels(
          troves, q, searchResultsViewMode, [...selectedTroveIds], sortBy || null, sortDir,
          fileTypesToUse, thumbnailOnly, boostTroveId, pageNum, size
        )
        appendQueryHistoryEntry({
          mode: 'search',
          ranAtMs: receivedAtMs,
          durationMs,
          consoleQuery: buildAppUrlParams({ searchPage0BasedOverride: pageNum }).toString(),
          apiCacheKey: fullCacheKey,
          resultCount: allData.count,
          summary: sl.summary,
          detail: sl.detail,
        })
        refreshStatusMessage()
      })
      .catch((err: { name?: string }) => {
        if (err.name !== 'AbortError' && searchRequestIdRef.current === requestId) {
          setSearchResult({ count: 0, results: [], page: 0, size })
        }
      })
      .finally(() => {
        if (searchRequestIdRef.current === requestId) setSearching(false)
      })
  }

  async function readCompareStream(
    url: string,
    signal: AbortSignal,
    onProgress: (current: number, total: number) => void,
    onDone: (result: unknown) => void
  ): Promise<void> {
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
  ): void {
    const q = queryRef.current.trim() || '*'
    const size = sizeOverride ?? dupPageSize
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
    const compareIdsToSend = compareTroveIds.size > 0 ? compareTroveIds : new Set([primaryTroveId.trim()])

    // Build the full-result cache key (no page/size) so all pages of the same query share one cache entry.
    const fullKeyParams = new URLSearchParams({ primaryTrove: primaryTroveId.trim(), query: q, maxMatches: '20' })
    if (sortBy) { fullKeyParams.set('sortBy', sortBy); fullKeyParams.set('sortDir', sortDir) }
    compareIdsToSend.forEach((id) => fullKeyParams.append('compareTrove', id))
    const fullCacheKey = `full:/api/search/duplicates?${fullKeyParams}`

    const dupHit = queryCache.get(fullCacheKey)
    if (dupHit) {
      const allData = dupHit.data as DuplicatesResultData
      const pageRows = allData.rows.slice(pageNum * size, (pageNum + 1) * size)
      const pagedData: DuplicatesResultData = { ...allData, rows: pageRows, page: pageNum, size }
      setDuplicatesResult(pagedData)
      setDuplicatesPage(pageNum)
      setCompareQueryTiming({ durationMs: dupHit.durationMs, receivedAtMs: dupHit.receivedAtMs })
      const dl = duplicatesHistoryLabels(
        troves, q, primaryTroveId.trim(), [...compareIdsToSend], sortBy || null, sortDir, pageNum, size
      )
      appendQueryHistoryEntry({
        mode: 'duplicates',
        ranAtMs: dupHit.receivedAtMs,
        durationMs: dupHit.durationMs,
        consoleQuery: buildAppUrlParams({ dupPage0BasedOverride: pageNum }).toString(),
        apiCacheKey: fullCacheKey,
        resultCount: allData.total,
        summary: dl.summary,
        detail: dl.detail,
      })
      return
    }

    // Cache miss: stream the full result set (page=0, large size) and cache it.
    setCompareQueryTiming(null)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setSearching(true)
    setSearchError(null)
    setCompareProgress({ current: 0, total: 0 })
    if (compareIntervalRef.current) clearInterval(compareIntervalRef.current)
    compareTimerStartRef.current = Date.now()
    setCompareElapsedSec(0)
    compareIntervalRef.current = setInterval(() => {
      setCompareElapsedSec(Math.floor((Date.now() - (compareTimerStartRef.current ?? 0)) / 1000))
    }, 1000)
    const fullStreamParams = new URLSearchParams(fullKeyParams)
    fullStreamParams.set('page', '0')
    fullStreamParams.set('size', '10000')
    const fullStreamUrl = `/api/search/duplicates/stream?${fullStreamParams}`
    readCompareStream(fullStreamUrl, controller.signal, (current, total) => setCompareProgress({ current, total }), (result) => {
      const allDup = result as DuplicatesResultData
      const receivedAtMs = Date.now()
      const durationMs = compareTimerStartRef.current != null ? receivedAtMs - compareTimerStartRef.current : 0
      queryCache.set(fullCacheKey, allDup, { durationMs, receivedAtMs })
      setCompareQueryTiming({ durationMs, receivedAtMs })
      const pageRows = allDup.rows.slice(pageNum * size, (pageNum + 1) * size)
      const pagedDup: DuplicatesResultData = { ...allDup, rows: pageRows, page: pageNum, size }
      setDuplicatesResult(pagedDup)
      setDuplicatesPage(pageNum)
      setCompareProgress({ current: 0, total: 0 })
      const dl = duplicatesHistoryLabels(
        troves, q, primaryTroveId.trim(), [...compareIdsToSend], sortBy || null, sortDir, pageNum, size
      )
      appendQueryHistoryEntry({
        mode: 'duplicates',
        ranAtMs: receivedAtMs,
        durationMs,
        consoleQuery: buildAppUrlParams({ dupPage0BasedOverride: pageNum }).toString(),
        apiCacheKey: fullCacheKey,
        resultCount: allDup.total,
        summary: dl.summary,
        detail: dl.detail,
      })
      refreshStatusMessage()
    }).catch((err) => { if (err.name !== 'AbortError') setSearchError(err.message) }).finally(() => {
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

  function fetchUniques(pageNum: number, sortByOverride: string | null = null, sortDirOverride: 'asc' | 'desc' | null = null, sizeOverride: number | null = null): void {
    const q = queryRef.current.trim() || '*'
    const size = sizeOverride ?? uniqPageSize
    if (!primaryTroveId.trim()) {
      setUniquesResult({ total: 0, page: 0, size, results: [] })
      return
    }
    if (compareTroveIds.size === 0) {
      setUniquesResult({ total: 0, page: 0, size, results: [] })
      return
    }
    const sortBy = sortByOverride ?? uniquesSortBy
    const sortDir = sortDirOverride ?? uniquesSortDir
    if (sortByOverride != null || sortDirOverride != null) {
      setUniquesSortBy(sortBy || null)
      setUniquesSortDir(sortDir)
    }

    // Build the full-result cache key (no page/size) so all pages of the same query share one cache entry.
    const fullKeyParams = new URLSearchParams({ primaryTrove: primaryTroveId.trim(), query: q })
    if (sortBy) { fullKeyParams.set('sortBy', sortBy); fullKeyParams.set('sortDir', sortDir) }
    compareTroveIds.forEach((id) => fullKeyParams.append('compareTrove', id))
    const fullCacheKey = `full:/api/search/uniques?${fullKeyParams}`

    const uniqHit = queryCache.get(fullCacheKey)
    if (uniqHit) {
      const allData = uniqHit.data as UniquesResultData
      const pageResults = allData.results.slice(pageNum * size, (pageNum + 1) * size)
      const pagedData: UniquesResultData = { ...allData, results: pageResults, page: pageNum, size }
      setUniquesResult(pagedData)
      setUniquesPage(pageNum)
      setCompareQueryTiming({ durationMs: uniqHit.durationMs, receivedAtMs: uniqHit.receivedAtMs })
      const ul = uniquesHistoryLabels(
        troves, q, primaryTroveId.trim(), [...compareTroveIds], sortBy || null, sortDir, pageNum, size
      )
      appendQueryHistoryEntry({
        mode: 'uniques',
        ranAtMs: uniqHit.receivedAtMs,
        durationMs: uniqHit.durationMs,
        consoleQuery: buildAppUrlParams({ uniqPage0BasedOverride: pageNum }).toString(),
        apiCacheKey: fullCacheKey,
        resultCount: allData.total,
        summary: ul.summary,
        detail: ul.detail,
      })
      return
    }

    // Cache miss: stream the full result set (page=0, large size) and cache it.
    setCompareQueryTiming(null)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setSearching(true)
    setSearchError(null)
    setCompareProgress({ current: 0, total: 0 })
    if (compareIntervalRef.current) clearInterval(compareIntervalRef.current)
    compareTimerStartRef.current = Date.now()
    setCompareElapsedSec(0)
    compareIntervalRef.current = setInterval(() => {
      setCompareElapsedSec(Math.floor((Date.now() - (compareTimerStartRef.current ?? 0)) / 1000))
    }, 1000)
    const fullStreamParams = new URLSearchParams(fullKeyParams)
    fullStreamParams.set('page', '0')
    fullStreamParams.set('size', '10000')
    const fullStreamUrl = `/api/search/uniques/stream?${fullStreamParams}`
    readCompareStream(fullStreamUrl, controller.signal, (current, total) => setCompareProgress({ current, total }), (result) => {
      const allUniq = result as UniquesResultData
      const receivedAtMs = Date.now()
      const durationMs = compareTimerStartRef.current != null ? receivedAtMs - compareTimerStartRef.current : 0
      queryCache.set(fullCacheKey, allUniq, { durationMs, receivedAtMs })
      setCompareQueryTiming({ durationMs, receivedAtMs })
      const pageResults = allUniq.results.slice(pageNum * size, (pageNum + 1) * size)
      const pagedUniq: UniquesResultData = { ...allUniq, results: pageResults, page: pageNum, size }
      setUniquesResult(pagedUniq)
      setUniquesPage(pageNum)
      setCompareProgress({ current: 0, total: 0 })
      const ul = uniquesHistoryLabels(
        troves, q, primaryTroveId.trim(), [...compareTroveIds], sortBy || null, sortDir, pageNum, size
      )
      appendQueryHistoryEntry({
        mode: 'uniques',
        ranAtMs: receivedAtMs,
        durationMs,
        consoleQuery: buildAppUrlParams({ uniqPage0BasedOverride: pageNum }).toString(),
        apiCacheKey: fullCacheKey,
        resultCount: allUniq.total,
        summary: ul.summary,
        detail: ul.detail,
      })
      refreshStatusMessage()
    }).catch((err) => { if (err.name !== 'AbortError') setSearchError(err.message) }).finally(() => {
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

  function cancelSearch() {
    abortRef.current?.abort()
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
    if ((searchResult?.results?.length ?? 0) > 0) {
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
    if (skipPageNavSearchRef.current) {
      skipPageNavSearchRef.current = false
      return
    }
    if (Date.now() - lastFileTypeOrViewSearchRef.current < 600) return
    const t = setTimeout(() => {
      const pageParam = Number(searchParams.get('page'))
      const initialPage = Number.isFinite(pageParam) && pageParam > 0 ? pageParam - 1 : 0
      setPage(initialPage)
      const urlFileTypes = new Set(parseFileTypesQueryValues(searchParams.getAll('fileTypes')))
      const fileTypesToUse = fileTypeFilters.size > 0 ? undefined : (urlFileTypes.size > 0 ? urlFileTypes : undefined)
      fetchSearch(initialPage, null, null, fileTypesToUse)
    }, 300)
    return () => clearTimeout(t)
  }, [searchMode, selectedTroveIds, searchParams])

  useEffect(() => {
    setFreezeTroveListOrder(false)
  }, [searchMode])

  const prevBoostTroveIdRef = useRef<string | null | undefined>(undefined)

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
    extraFieldDropdownOpen,
    searching,
    page,
    duplicatesPage,
    uniquesPage,
    searchResult?.results?.length ?? 0,
    duplicatesResult?.total,
    uniquesResult?.total,
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
    if (searchMode === 'search') setUrlSearchTroveIds(next)
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
      setUrlSearchTroveIds(new Set())
      setBoostTroveId(null)
      setSearchParams(buildSearchParams(null, new Set(), null), { replace: true })
    }
  }

  function clearPrimaryTroves() {
    if (!isDupOrUniques) return
    setPrimaryTroveId('')
    setSearchParams(buildSearchParamsForMode(searchMode, '', compareTroveIds), { replace: true })
  }

  function clearCompareTroves() {
    if (!isDupOrUniques) return
    setCompareTroveIds(new Set())
    setSearchParams(buildSearchParamsForMode(searchMode, primaryTroveId, new Set()), { replace: true })
  }

  function handleBoostClick(troveId) {
    if (!isDupOrUniques) {
      setFreezeTroveListOrder(true)
      setBoostTroveId((prev) => (prev === troveId ? null : troveId))
      if (!searchQuery.trim()) {
        queryRef.current = '*'
        setSearchQuery('*')
      }
      setPage(0)
    }
  }

  function handleCompareTargetClick(troveId) {
    if (!isDupOrUniques) return
    if (searchMode === 'uniques' && troveId === primaryTroveId) {
      setCompareTroveIds(new Set())
    } else {
      setCompareTroveIds(new Set([troveId]))
    }
    setShowTrovePicker(false)
  }

  function handleTargetClick(troveId) {
    if (isDupOrUniques) {
      if (searchMode === 'duplicates' && !dupQuery.trim()) {
        queryRef.current = '*'
        setDupQuery('*')
      } else if (searchMode === 'uniques' && !uniqQuery.trim()) {
        queryRef.current = '*'
        setUniqQuery('*')
      }
      setPrimaryTroveId(troveId)
      setCompareTroveIds(new Set())
      setShowTrovePicker(false)
    } else {
      setFreezeTroveListOrder(true)
      const only = new Set([troveId])
      setSelectedTroveIds(only)
      setUrlSearchTroveIds(only)
      setSearchParams(buildSearchParams(null, only), { replace: true })
      if (!searchQuery.trim()) {
        queryRef.current = '*'
        setSearchQuery('*')
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
    if (!searchQuery.trim()) return
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
    skipPageNavSearchRef.current = true
    const nextParams = buildSearchParams()
    nextParams.set('page', String(nextPage + 1))
    nextParams.set('size', String(pageSize))
    setSearchParams(nextParams, { replace: true })
  }

  function applyPageSizeChange(newSize) {
    setPageSize(newSize)
    if (searchResult != null && searchQuery.trim()) fetchSearch(0, null, null, undefined, newSize)
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

  function applyGallerySortChange(nextSortBy) {
    const nextSortDir = defaultGallerySortDirForSortBy(nextSortBy)
    if (isStarQuery) {
      setStarSortBy(nextSortBy)
      setStarSortDir(nextSortDir)
    } else {
      setOtherSortBy(nextSortBy)
      setOtherSortDir(nextSortDir)
    }
    const q = queryRef.current.trim()
    if (q) fetchSearch(page, nextSortBy, nextSortDir)
  }

  function toggleGallerySortDir() {
    const nextDir = effectiveSortDir === 'asc' ? 'desc' : 'asc'
    if (isStarQuery) {
      setStarSortDir(nextDir)
    } else {
      setOtherSortDir(nextDir)
    }
    const q = queryRef.current.trim()
    if (q) fetchSearch(page, effectiveSortBy, nextDir)
  }

  const results = searchResult?.results ?? []
  const count = searchResult?.count ?? 0
  const searchSize = typeof searchResult?.size === 'number' ? searchResult.size : pageSize
  const totalPages = Math.ceil(count / searchSize) || 0
  const showMobileViewModeToggle = useMemo(
    () => Array.isArray(results) && results.some((row) => row?.itemType === 'littlePrinceItem' && hasUsableThumbnail(row)),
    [results]
  )
  const showMobileFileTypePicker = useMemo(
    () => (
      galleryDecorate || (
        Array.isArray(results) && (
        results.length === 0 ||
        results.some((row) => Array.isArray(row?.files) && row.files.some((f) => typeof f === 'string' && f.trim() !== ''))
        )
      )
    ),
    [results, galleryDecorate]
  )
  const effectiveSearchResultsViewMode = showMobileViewModeToggle ? searchResultsViewMode : 'list'
  const mobileGallerySortOptions = useMemo(() => {
    if (searchMode !== 'search') {
      return buildSortedGallerySortOptions([])
    }
    return buildSortedGallerySortOptions(
      mergeGalleryExtraSortKeys(
        searchResult?.availableExtraFieldKeys,
        searchResult?.results,
        effectiveSortBy
      )
    )
  }, [searchMode, searchResult?.availableExtraFieldKeys, searchResult?.results, effectiveSortBy])
  const mobileGallerySortValue = gallerySortSelectValue(effectiveSortBy)
  const mobileGallerySortAfterFilterSlot = effectiveSearchResultsViewMode === 'gallery'
    ? (
      <div className="mobile-gallery-sort-dropdown-wrap" ref={gallerySortDropdownRef}>
        <div className="mobile-gallery-sort-trigger-wrap" role="group" aria-label="Gallery sort">
          <span className="mobile-gallery-sort-by-prefix">Sort</span>
          <button
            type="button"
            className="mobile-gallery-sort-dir-btn"
            onClick={(e) => { e.stopPropagation(); toggleGallerySortDir() }}
            aria-label={effectiveSortDir === 'asc' ? 'Sort ascending, click to sort descending' : 'Sort descending, click to sort ascending'}
            title={effectiveSortDir === 'asc' ? 'Sort ascending (click to toggle)' : 'Sort descending (click to toggle)'}
          >
            {effectiveSortDir === 'asc' ? '↑' : '↓'}
          </button>
          <span className="mobile-gallery-sort-divider" aria-hidden="true" />
          <button
            type="button"
            className="mobile-gallery-sort-trigger"
            onClick={() => setGallerySortDropdownOpen((o) => !o)}
            aria-expanded={gallerySortDropdownOpen}
            aria-haspopup="listbox"
            aria-label="Sort field"
          >
            {mobileGallerySortOptions.find((o) => o.value === mobileGallerySortValue)?.label ?? mobileGallerySortValue}
          </button>
        </div>
        {gallerySortDropdownOpen && (
          <div className="mobile-gallery-sort-panel" role="listbox" aria-label="Gallery sort">
            {mobileGallerySortOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={mobileGallerySortValue === opt.value}
                className={`mobile-gallery-sort-option${mobileGallerySortValue === opt.value ? ' mobile-gallery-sort-option--selected' : ''}`}
                onClick={() => {
                  applyGallerySortChange(opt.value)
                  setGallerySortDropdownOpen(false)
                }}
              >
                {mobileGallerySortValue === opt.value ? '✓ ' : ''}{opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    )
    : null
  const wouldProduceMultiplePages = count > Math.min(...MOBILE_PAGE_SIZE_OPTIONS)
  const showSearchPaginationControls = totalPages > 1 || wouldProduceMultiplePages
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

  useEffect(() => {
    if (!showMobileFileTypePicker && fileTypeDropdownOpen) setFileTypeDropdownOpen(false)
  }, [showMobileFileTypePicker, fileTypeDropdownOpen])

  useEffect(() => {
    if (extraFieldKeysOnPage.length === 0 && extraFieldDropdownOpen) {
      setExtraFieldDropdownOpen(false)
    }
  }, [extraFieldKeysOnPage.length, extraFieldDropdownOpen])

  useEffect(() => {
    if (effectiveSearchResultsViewMode === 'gallery' && extraFieldDropdownOpen) {
      setExtraFieldDropdownOpen(false)
    }
  }, [effectiveSearchResultsViewMode, extraFieldDropdownOpen])

  const troveLabel = isDupOrUniques
    ? (primaryTroveId
        ? <><strong>Primary:</strong> {troves.find((t) => t.id === primaryTroveId)?.name ?? primaryTroveId} · {(compareTroveIds.size === 0 || (compareTroveIds.size === 1 && compareTroveIds.has(primaryTroveId))) ? <strong>Self-compare</strong> : <><strong>Compare:</strong> {formatCount(compareTroveIds.size)}</>}</>
        : 'Set primary & compare troves')
    : (selectedTroveIds.size === 0 ? 'All troves' : `${formatCount(selectedTroveIds.size)} trove${selectedTroveIds.size !== 1 ? 's' : ''}`)
  const invalidCompareHint = <>Select <strong>Primary</strong> & <strong>Comparison</strong> troves</>
  const invalidCompareSelection = (searchMode === 'duplicates' && !dupPrimaryTroveId) ||
    (searchMode === 'uniques' && (!uniqPrimaryTroveId || uniqCompareTroveIds.size === 0 || uniqCompareTroveIds.has(uniqPrimaryTroveId)))
  const mobileTroveDropdownLabel = (() => {
    if (searchMode === 'search') {
      const trovePart = selectedTroveIds.size === 0 ? 'All troves. Click to change' : `${formatCount(selectedTroveIds.size)} trove${selectedTroveIds.size !== 1 ? 's' : ''}`
      if (searchResult != null && count > 0) {
        return (
          <>
            {formatCount(count)} item{count !== 1 ? 's' : ''}
            <QueryTimingText timing={searchQueryTiming} />
            {' · '}
            {trovePart}
          </>
        )
      }
      return trovePart.trim() || 'All troves. Click to change'
    }
    if (searchMode === 'duplicates' && duplicatesResult != null) {
      const total = duplicatesResult.total ?? 0
      const selfCompare = compareTroveIds.size === 1 && compareTroveIds.has(primaryTroveId)
      const name = troves.find((t) => t.id === primaryTroveId)?.name ?? primaryTroveId
      const durationPart = <QueryTimingText timing={compareQueryTiming} />
      if (selfCompare && total > 0) return <>{name} · Self-compare.{durationPart} {formatCount(total)} item{total !== 1 ? 's' : ''} with possible duplicates.</>
      if (total > 0) return <>{formatCount(total)} dups · {primaryTroveId ? <>{name} · {compareTroveIds.size === 0 ? 'Self-compare' : <>Compare: {formatCount(compareTroveIds.size)}</>}.{durationPart}</> : invalidCompareHint}</>
      return primaryTroveId ? <>{name} · {compareTroveIds.size === 0 ? 'Self-compare' : <>Compare: {formatCount(compareTroveIds.size)}</>}.{durationPart}</> : invalidCompareHint
    }
    if (searchMode === 'uniques' && uniquesResult != null) {
      const total = uniquesResult.total ?? 0
      if (compareTroveIds.size === 1 && compareTroveIds.has(primaryTroveId)) return 'Primary trove cannot be in compare list.'
      const durationPart = <QueryTimingText timing={compareQueryTiming} />
      const uniqPart = total > 0 ? `${formatCount(total)} uniques · ` : ''
      const troveName = primaryTroveId ? troves.find((t) => t.id === primaryTroveId)?.name ?? primaryTroveId : ''
      const trovePart = primaryTroveId ? <>{troveName} · Compare: {formatCount(compareTroveIds.size)}.{durationPart}</> : invalidCompareHint
      return (uniqPart ? <>{uniqPart}{trovePart}</> : trovePart) as React.ReactNode
    }
    if (searchMode === 'duplicates') {
      const name = troves.find((t) => t.id === primaryTroveId)?.name ?? primaryTroveId
      return primaryTroveId ? <>{name} · {compareTroveIds.size === 0 ? 'Self-compare' : <>Compare: {formatCount(compareTroveIds.size)}</>}</> : invalidCompareHint
    }
    if (searchMode === 'uniques') {
      if (compareTroveIds.size === 1 && compareTroveIds.has(primaryTroveId)) return 'Primary trove cannot be in compare list.'
      const troveName = primaryTroveId ? troves.find((t) => t.id === primaryTroveId)?.name ?? primaryTroveId : ''
      return primaryTroveId && compareTroveIds.size > 0 ? <>{troveName} · Compare: {formatCount(compareTroveIds.size)}</> : invalidCompareHint
    }
    return 'All troves. Click to change'
  })()
  const filteredTroves = troves.filter((t) => {
    const q = trovePickerFilter.trim().toLowerCase()
    return !q || (t.name && t.name.toLowerCase().includes(q)) || (t.id && t.id.toLowerCase().includes(q))
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
      const selected = [...troves.filter((t) => topSectionIds.has(t.id))].sort(sortTopSection)
      const notSelected = [...filteredTroves.filter((t) => !topSectionIds.has(t.id))].sort(sortByName)
      return { selected, notSelected }
    }
    const hitCount = (t) => troveCounts?.[t.id] ?? 0
    const withHits = troves.filter((t) => hitCount(t) > 0)
    const selectedWithNoHits = troves.filter((t) => hitCount(t) === 0 && (selectedTroveIds.has(t.id) || (boostTroveId != null && t.id === boostTroveId)))
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
  }, [searchMode, troves, filteredTroves, displaySelectedTroveIds, selectedTroveIds, freezeTroveListOrder, boostTroveId, searchResult?.troveCounts, searchResult?.results])

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
          <Link to="/history" className="mobile-nav-link">History</Link>
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
        className={`mobile-main${mobileOverflowDropdownOpen ? ' mobile-filetype-dropdown-open' : ''}${mobileMainGapTopOpen ? ' mobile-main-gap-top-open' : ''}${mobileMainGapBottomOpen ? ' mobile-main-gap-bottom-open' : ''}`}
      >
        <div className="mobile-main-inner">
        <div className="mobile-mode-tabs" role="tablist" aria-label="Search mode">
          <button
            type="button"
            role="tab"
            aria-selected={searchMode === 'search'}
            className={`mobile-mode-tab ${searchMode === 'search' ? 'mobile-mode-tab--active' : ''}`}
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
              setSearchResult(null)
              setDuplicatesResult(null)
            }}
          >
          Uniques
          </button>
        </div>

        <form onSubmit={handleSearch} className="mobile-search-form">
          <div className="mobile-search-query-wrap">
            <div className="mobile-search-input-wrap">
              <input
                type="search"
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
                className="mobile-search-input"
                autoCapitalize="off"
                autoCorrect="off"
                aria-label="Query"
              />
              {(searchMode === 'search' ? searchQuery : searchMode === 'duplicates' ? dupQuery : uniqQuery) && (
                <button
                  type="button"
                  className="mobile-search-query-clear"
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
            <span className="mobile-search-query-actions">
              <button
                type="button"
                className="mobile-search-query-btn"
                title="Search all (*)"
                onClick={() => {
                  queryRef.current = '*'
                  if (searchMode === 'search') setSearchQuery('*')
                  else if (searchMode === 'duplicates') setDupQuery('*')
                  else setUniqQuery('*')
                  setFreezeTroveListOrder(false)
                  setPage(0)
                  if (searchMode === 'duplicates') {
                    if (primaryTroveId.trim()) {
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
            </span>
          </div>
          <button type="submit" className="mobile-search-btn" disabled={searching || (searchMode === 'duplicates' ? !primaryTroveId : (searchMode === 'uniques' && (!primaryTroveId || compareTroveIds.size === 0)))} aria-label="Search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </button>
          {searchMode === 'search' && showMobileFileTypePicker && (displayFileTypes.length >= 1 || fileTypeFilters.size > 0) && (() => {
            const urlFileTypes = new Set(parseFileTypesQueryValues(searchParams.getAll('fileTypes')))
            const fileTypesForLabel = fileTypeFilters.size > 0 ? fileTypeFilters : urlFileTypes
            const upper = (s) => (s || '').toUpperCase()
            const availableUpper = new Set(displayFileTypes.map(upper))
            const selectedUpper = new Set([...fileTypesForLabel].map(upper))
            const allSelected = availableUpper.size > 0 && availableUpper.size === selectedUpper.size && [...availableUpper].every((t) => selectedUpper.has(t))
            const hasFileTypeFilter = fileTypesForLabel.size > 0 && !allSelected
            const anyQuickSelected = fileTypeQuickMode === FileTypeQuickMode.Any
            const mehQuickSelected = fileTypeQuickMode === FileTypeQuickMode.Meh
            const mehQuickActiveStyle = mehQuickSelected && fileTypesForLabel.size === 0
            const hasThumbFilter = thumbnailOnly
            const mediaPickerHasSelection =
              hasThumbFilter || fileTypesForLabel.size > 0 || anyQuickSelected
            return (
              <div className="mobile-filetype-dropdown-wrap mobile-filetype-dropdown-wrap--form" ref={fileTypeDropdownRef}>
              <div className={`mobile-filetype-trigger-wrap${mediaPickerHasSelection ? ' mobile-filetype-trigger-wrap--filtered' : ''}`}>
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
                      className={`mobile-filetype-quick-btn mobile-filetype-quick-btn--thumb ${hasThumbFilter ? 'mobile-filetype-quick-btn--active' : ''}`}
                      onClick={(e) => {
                        e.preventDefault()
                        const nextThumbs = !thumbnailOnly
                        setThumbnailOnly(nextThumbs)
                        setSearchParams(buildSearchParams(null, null, undefined, nextThumbs, fileTypeQuickMode), { replace: true })
                      }}
                      title="Only items with thumbnails"
                      aria-label="Only items with thumbnails"
                    >
                      <img src="/thumb-thumbnail.png" alt="" className="mobile-filetype-quick-icon" />
                    </button>
                    <button
                      type="button"
                      className={`mobile-filetype-quick-btn ${anyQuickSelected ? 'mobile-filetype-quick-btn--active' : ''}`}
                      onClick={(e) => {
                        e.preventDefault()
                        if (anyQuickSelected) return
                        skipFileTypeSearchRef.current = true
                        lastFileTypeOrViewSearchRef.current = Date.now()
                        const next = new Set<string>(displayFileTypes.map(normalizeFileTypeToken))
                        const nextReq = pruneRequiredFileTypes(next, requiredFileTypes)
                        setFileTypeQuickMode(FileTypeQuickMode.Any)
                        setFileTypeFilters(next)
                        setRequiredFileTypes(nextReq)
                        setSearchParams(buildSearchParams(next, null, undefined, undefined, FileTypeQuickMode.Any, nextReq), { replace: true })
                        fetchSearch(0, null, null, next, null, nextReq)
                      }}
                    >
                      <span className="mobile-filetype-quick-prefix mobile-filetype-quick-prefix--asterisk" aria-hidden="true">*</span> Any
                    </button>
                    <button
                      type="button"
                      className={`mobile-filetype-quick-btn ${mehQuickActiveStyle ? 'mobile-filetype-quick-btn--active' : ''}`}
                      onClick={(e) => {
                        e.preventDefault()
                        if (mehQuickSelected && fileTypesForLabel.size === 0) return
                        skipFileTypeSearchRef.current = true
                        lastFileTypeOrViewSearchRef.current = Date.now()
                        const next = new Set<string>()
                        setFileTypeQuickMode(FileTypeQuickMode.Meh)
                        setFileTypeFilters(next)
                        setRequiredFileTypes(new Set())
                        setSearchParams(buildSearchParams(next, null, undefined, undefined, FileTypeQuickMode.Meh, new Set()), { replace: true })
                        fetchSearch(0, null, null, next, null, new Set())
                      }}
                    >
                      <span className="mobile-filetype-quick-prefix" aria-hidden="true">×</span> Meh
                    </button>
                  </div>
                  <div className="mobile-filetype-dropdown-require-header" aria-hidden="true">
                    <span className="mobile-filetype-dropdown-require-header-label">Must include</span>
                    <span className="mobile-filetype-dropdown-require-header-mark">!</span>
                  </div>
                  {groupFileTypes(displayFileTypes).map(({ group, types }) => {
                    const allSelectedGroup = types.every((ft) => fileTypeSetHas(fileTypeFilters, ft))
                    const someSelected = types.some((ft) => fileTypeSetHas(fileTypeFilters, ft))
                    return (
                      <div key={group ?? 'other'} className="mobile-filetype-group">
                        {group != null && (
                          <div className="mobile-filetype-group-header-row">
                            <label className="mobile-filetype-group-header">
                              <input
                                type="checkbox"
                                ref={(el) => { if (el) el.indeterminate = someSelected && !allSelectedGroup }}
                                checked={allSelectedGroup}
                                onChange={() => {
                                  skipFileTypeSearchRef.current = true
                                  lastFileTypeOrViewSearchRef.current = Date.now()
                                  const next = new Set([...fileTypeFilters].map(normalizeFileTypeToken))
                                  if (allSelectedGroup) types.forEach((t) => next.delete(normalizeFileTypeToken(t)))
                                  else types.forEach((t) => next.add(normalizeFileTypeToken(t)))
                                  const nextReq = pruneRequiredFileTypes(next, requiredFileTypes)
                                  if (anyQuickSelected) setFileTypeQuickMode(FileTypeQuickMode.Meh)
                                  setFileTypeFilters(next)
                                  setRequiredFileTypes(nextReq)
                                  setSearchParams(buildSearchParams(next, null, undefined, undefined, anyQuickSelected ? FileTypeQuickMode.Meh : fileTypeQuickMode, nextReq), { replace: true })
                                  fetchSearch(0, null, null, next, null, nextReq)
                                }}
                              />
                              {group}
                            </label>
                            <button
                              type="button"
                              className="mobile-filetype-group-complement"
                              title={`Complement selection in ${group}`}
                              aria-label={`Complement selection in ${group}`}
                              disabled={!someSelected || allSelectedGroup}
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
                                setSearchParams(buildSearchParams(next, null, undefined, undefined, anyQuickSelected ? FileTypeQuickMode.Meh : fileTypeQuickMode, nextReq), { replace: true })
                                fetchSearch(0, null, null, next, null, nextReq)
                              }}
                            >
                              <img src="/complement.png" alt="" aria-hidden="true" />
                            </button>
                          </div>
                        )}
                        {types.map((ft) => (
                          <div key={ft} className="mobile-filetype-option-row">
                            <label className="mobile-filetype-option">
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
                                  setSearchParams(buildSearchParams(next, null, undefined, undefined, anyQuickSelected ? FileTypeQuickMode.Meh : fileTypeQuickMode, nextReq), { replace: true })
                                  fetchSearch(0, null, null, next, null, nextReq)
                                }}
                              />
                              {ft}
                              {searchResult?.fileTypeCounts != null && typeof searchResult.fileTypeCounts[ft] === 'number' && (
                                <span className="mobile-filetype-option-count" aria-hidden="true"> ({formatCount(searchResult.fileTypeCounts[ft])})</span>
                              )}
                              {ft === 'Link' && <img src="/link.png" alt="" className="mobile-filetype-option-icon" aria-hidden="true" />}
                              {ft === 'PDF' && <img src="/pdf.png" alt="" className="mobile-filetype-option-icon" aria-hidden="true" />}
                              {['JPG', 'JPEG', 'GIF', 'WEBP', 'TIFF', 'PNG'].includes(ft) && <img src="/image.png" alt="" className="mobile-filetype-option-icon" aria-hidden="true" />}
                              {['RDF', 'TXT', 'DOC', 'DOCX'].includes(ft) && <img src="/document.png" alt="" className="mobile-filetype-option-icon" aria-hidden="true" />}
                              {['MP4', 'M4V', 'AVI', 'MOV', 'MKV'].includes(ft) && <img src="/video.svg" alt="" className="mobile-filetype-option-icon" aria-hidden="true" />}
                              {ft === 'MP3' && <img src="/audio.png" alt="" className="mobile-filetype-option-icon" aria-hidden="true" />}
                              {['EPUB', 'MOBI'].includes(ft) && <img src="/book.svg" alt="" className="mobile-filetype-option-icon" aria-hidden="true" />}
                              {ft === 'ZIP' && <img src="/zip.png" alt="" className="mobile-filetype-option-icon" aria-hidden="true" />}
                            </label>
                            <button
                              type="button"
                              className={`mobile-filetype-require-btn${fileTypeSetHas(requiredFileTypes, ft) ? ' mobile-filetype-require-btn--active' : ''}`}
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
                                    nextFt,
                                    null,
                                    undefined,
                                    undefined,
                                    anyQuickSelected ? FileTypeQuickMode.Meh : fileTypeQuickMode,
                                    nextReq
                                  ),
                                  { replace: true }
                                )
                                fetchSearch(0, null, null, nextFt, null, nextReq)
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
            );
          })()}
        </form>

        {searchError && <p className="mobile-search-error" role="alert">{searchError}</p>}
        {((searchMode === 'search' && searchResult?.warning) || (searchMode === 'duplicates' && duplicatesResult?.warning) || (searchMode === 'uniques' && uniquesResult?.warning)) && (
          <p className="search-cache-warning" role="status">
            {(searchMode === 'search' && searchResult?.warning) || (searchMode === 'duplicates' && duplicatesResult?.warning) || (searchMode === 'uniques' && uniquesResult?.warning)}
          </p>
        )}

        {isDupOrUniques && searching && (() => {
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
          const etaLabel = smoothedEtaSec != null ? `${smoothedEtaSec}s` : '—'
          return (
            <div className="mobile-search-loading" aria-live="polite" aria-busy="true">
              <span className="mobile-search-spinner" aria-hidden="true" />
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
                    {etaLabel}
                  </span>
                  {hasTotal && <span className="search-compare-progress-stats-sep" aria-hidden="true">·</span>}
                  {hasTotal && (
                    <span className="search-compare-progress-count">{compareProgress.current}/{compareProgress.total}</span>
                  )}
                </span>
                <button type="button" className="mobile-search-cancel" onClick={cancelSearch} aria-label="Cancel search">
                  Cancel
                </button>
                <span className="search-compare-progress-spacer" aria-hidden="true" />
              </div>
            </div>
          )
        })()}

        <div className="mobile-troves-row">
          <button
            type="button"
            className="mobile-troves-btn"
            onClick={() => setShowTrovePicker((v) => !v)}
            aria-expanded={showTrovePicker}
            aria-label="Select troves"
          >
            <span className="mobile-troves-btn-label">{mobileTroveDropdownLabel}</span>
            <span className="mobile-troves-btn-change" aria-hidden="true" />
          </button>
          {searchMode === 'search' && searchResult != null && (showMobileViewModeToggle || (effectiveSearchResultsViewMode === 'list' && extraFieldKeysOnPage.length > 0)) && (
            <span className="mobile-view-and-size-wrap mobile-troves-row-right">
              {showMobileViewModeToggle && (
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
                    const q = queryRef.current.trim()
                    if (q) fetchSearch(page, effectiveSortBy, effectiveSortDir)
                  }}
                  aria-pressed={effectiveSearchResultsViewMode === 'gallery'}
                  aria-label="Gallery view"
                >
                  <img src="/gallery.png" alt="" aria-hidden="true" className="mobile-view-mode-btn-icon" />
                </button>
              </span>
              )}
              {effectiveSearchResultsViewMode === 'list' && extraFieldKeysOnPage.length > 0 && (() => {
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
                  <div
                    className="search-extra-fields-dropdown-wrap mobile-extra-fields-dropdown-wrap--toolbar"
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
                        aria-label={
                          extraGridFieldsSelected.size === 0
                            ? 'Choose extra fields to show in the list'
                            : `Extra fields, ${extraGridFieldsSelected.size} selected`
                        }
                      >
                        <img
                          src="/add-column.png"
                          alt=""
                          className="mobile-extra-fields-trigger-icon"
                          aria-hidden="true"
                        />
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
                )
              })()}
              {showMobileViewModeToggle && effectiveSearchResultsViewMode === 'gallery' && (
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
        </div>
        {(searchMode === 'duplicates' && duplicatesResult != null) || (searchMode === 'uniques' && uniquesResult != null) ? (
          <div className="mobile-compare-options-row">
            {searchMode === 'duplicates' && duplicatesResult != null && (() => {
              const total = duplicatesResult.total ?? 0
              const size = duplicatesResult.size ?? dupPageSize
              const totalDupPages = size > 0 ? Math.ceil(total / size) : 0
              return (
                <>
                  {totalDupPages > 1 && (
                    <nav className="mobile-pagination mobile-troves-row-right" aria-label="Duplicate pages">
                      <button type="button" className="mobile-page-btn" disabled={duplicatesPage <= 0 || searching} onClick={() => fetchDuplicates(0)} aria-label="First page">«</button>
                      <button type="button" className="mobile-page-btn" disabled={duplicatesPage <= 0 || searching} onClick={() => fetchDuplicates(duplicatesPage - 1)} aria-label="Previous">‹</button>
                      <span className="mobile-page-info">{formatCount(duplicatesPage + 1)} / {formatCount(totalDupPages)}</span>
                      <button type="button" className="mobile-page-btn" disabled={duplicatesPage >= totalDupPages - 1 || searching} onClick={() => fetchDuplicates(duplicatesPage + 1)} aria-label="Next">›</button>
                      <button type="button" className="mobile-page-btn" disabled={duplicatesPage >= totalDupPages - 1 || searching} onClick={() => fetchDuplicates(totalDupPages - 1)} aria-label="Last page">»</button>
                    </nav>
                  )}
                  <div className="mobile-page-size-dropdown-wrap mobile-page-size-label mobile-page-size-label--end" ref={comparePageSizeDropdownRef}>
                    Size
                    <div className="mobile-page-size-trigger-wrap">
                      <button
                        type="button"
                        className="mobile-page-size-trigger"
                        onClick={() => setComparePageSizeDropdownOpen((o) => !o)}
                        disabled={searching}
                        aria-expanded={comparePageSizeDropdownOpen}
                        aria-haspopup="listbox"
                        aria-label="Page size"
                      >
                        {formatCount(dupPageSize)}
                      </button>
                    </div>
                    {comparePageSizeDropdownOpen && (
                      <div className="mobile-page-size-panel" role="listbox" aria-label="Page size">
                        {MOBILE_PAGE_SIZE_OPTIONS.map((n) => (
                          <button
                            key={n}
                            type="button"
                            role="option"
                            aria-selected={dupPageSize === n}
                            className={`mobile-page-size-option${dupPageSize === n ? ' mobile-page-size-option--selected' : ''}`}
                            onClick={() => {
                              setDupPageSize(n)
                              if (primaryTroveId.trim()) fetchDuplicates(0, n)
                              const nextParams = buildSearchParams()
                              nextParams.set('size', String(n))
                              setSearchParams(nextParams, { replace: true })
                              setComparePageSizeDropdownOpen(false)
                            }}
                          >
                            {dupPageSize === n ? '✓ ' : ''}{formatCount(n)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )
            })()}
            {searchMode === 'uniques' && uniquesResult != null && (() => {
              const total = uniquesResult.total ?? 0
              const size = uniquesResult.size ?? uniqPageSize
              const totalUniqPages = size > 0 ? Math.ceil(total / size) : 0
              return (
                <>
                  {totalUniqPages > 1 && (
                    <nav className="mobile-pagination mobile-troves-row-right" aria-label="Uniques pages">
                      <button type="button" className="mobile-page-btn" disabled={uniquesPage <= 0 || searching} onClick={() => fetchUniques(0)} aria-label="First page">«</button>
                      <button type="button" className="mobile-page-btn" disabled={uniquesPage <= 0 || searching} onClick={() => fetchUniques(uniquesPage - 1)} aria-label="Previous">‹</button>
                      <span className="mobile-page-info">{formatCount(uniquesPage + 1)} / {formatCount(totalUniqPages)}</span>
                      <button type="button" className="mobile-page-btn" disabled={uniquesPage >= totalUniqPages - 1 || searching} onClick={() => fetchUniques(uniquesPage + 1)} aria-label="Next">›</button>
                      <button type="button" className="mobile-page-btn" disabled={uniquesPage >= totalUniqPages - 1 || searching} onClick={() => fetchUniques(totalUniqPages - 1)} aria-label="Last page">»</button>
                    </nav>
                  )}
                  <div className="mobile-page-size-dropdown-wrap mobile-page-size-label mobile-page-size-label--end" ref={comparePageSizeDropdownRef}>
                    Size
                    <div className="mobile-page-size-trigger-wrap">
                      <button
                        type="button"
                        className="mobile-page-size-trigger"
                        onClick={() => setComparePageSizeDropdownOpen((o) => !o)}
                        disabled={searching}
                        aria-expanded={comparePageSizeDropdownOpen}
                        aria-haspopup="listbox"
                        aria-label="Page size"
                      >
                        {formatCount(uniqPageSize)}
                      </button>
                    </div>
                    {comparePageSizeDropdownOpen && (
                      <div className="mobile-page-size-panel" role="listbox" aria-label="Page size">
                        {MOBILE_PAGE_SIZE_OPTIONS.map((n) => (
                          <button
                            key={n}
                            type="button"
                            role="option"
                            aria-selected={uniqPageSize === n}
                            className={`mobile-page-size-option${uniqPageSize === n ? ' mobile-page-size-option--selected' : ''}`}
                            onClick={() => {
                              setUniqPageSize(n)
                              if (primaryTroveId.trim() && compareTroveIds.size > 0) fetchUniques(0, null, null, n)
                              const nextParams = buildSearchParams()
                              nextParams.set('size', String(n))
                              setSearchParams(nextParams, { replace: true })
                              setComparePageSizeDropdownOpen(false)
                            }}
                          >
                            {uniqPageSize === n ? '✓ ' : ''}{formatCount(n)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )
            })()}
          </div>
        ) : null}

        {showTrovePicker && (
          <div className={`mobile-trove-picker${isDupOrUniques ? ' mobile-trove-picker--with-tabs' : ''}`}>
            {isDupOrUniques && (() => {
              const primaryTabInvalid = searchMode === 'duplicates' ? !dupPrimaryTroveId : !uniqPrimaryTroveId
              const compareTabInvalid = searchMode === 'duplicates'
                ? false
                : (uniqCompareTroveIds.size === 0 || uniqCompareTroveIds.has(uniqPrimaryTroveId))
              return (
                <div className="mobile-primary-compare-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={trovePickerSubTab === 'primary'}
                    className={`mobile-primary-compare-tab ${trovePickerSubTab === 'primary' ? 'mobile-primary-compare-tab--active' : ''}`}
                    onClick={() => setTrovePickerSubTab('primary')}
                  >
                    <span>Primary</span>
                    {primaryTabInvalid && <img src="/exclamation.png" alt="" className="mobile-primary-compare-tab-invalid-icon" aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={trovePickerSubTab === 'compare'}
                    className={`mobile-primary-compare-tab ${trovePickerSubTab === 'compare' ? 'mobile-primary-compare-tab--active' : ''}`}
                    onClick={() => setTrovePickerSubTab('compare')}
                  >
                    <span>Compare</span>
                    {compareTabInvalid && <img src="/exclamation.png" alt="" className="mobile-primary-compare-tab-invalid-icon" aria-hidden="true" />}
                  </button>
                </div>
              )
            })()}
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
                {trovePickerFilter && (
                  <button
                    type="button"
                    className="mobile-trove-filter-clear"
                    onClick={() => setTrovePickerFilter('')}
                    aria-label="Clear filter"
                  >
                    ×
                  </button>
                )}
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
              {isDupOrUniques ? (
                <>
                  {trovePickerSubTab === 'primary' && primaryTroveId && (
                    <button type="button" onClick={clearPrimaryTroves} className="mobile-trove-clear" aria-label="Clear primary trove">
                      Clear
                    </button>
                  )}
                  {trovePickerSubTab === 'compare' && compareTroveIds.size > 0 && (
                    <button type="button" onClick={clearCompareTroves} className="mobile-trove-clear" aria-label="Clear compare troves">
                      Clear
                    </button>
                  )}
                </>
              ) : (
                <button type="button" onClick={clearTroves} className="mobile-trove-clear" aria-label="Clear selection">
                  Clear
                </button>
              )}
              {searchMode === 'duplicates' && primaryTroveId && (
                <span
                  className={`mobile-compare-to-self-text ${isCompareToSelfVisible(primaryTroveId, compareTroveIds) ? '' : 'mobile-compare-to-self--invisible'}`}
                  aria-hidden="true"
                >
                  Comparing to self
                </span>
              )}
            </div>
            <ul className="mobile-trove-list">
              {isDupOrUniques && trovePickerSubTab === 'primary'
                ? (() => {
                    const primaryRow = primaryTroveId ? troves.find((t) => t.id === primaryTroveId) : undefined
                    const rest = filteredTroves.filter((t) => t.id !== primaryTroveId)
                    const primaryLi = (t: (typeof troves)[number]) => (
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
                    )
                    return (
                      <>
                        {primaryRow ? primaryLi(primaryRow) : null}
                        {primaryRow && rest.length > 0 ? (
                          <li className="mobile-trove-list-separator" aria-hidden="true">
                            <hr className="mobile-trove-separator" />
                          </li>
                        ) : null}
                        {rest.map((t) => primaryLi(t))}
                      </>
                    )
                  })()
                : isDupOrUniques && trovePickerSubTab === 'compare'
                  ? (() => {
                      const compareTop = [...compareTroveIds]
                        .map((id) => troves.find((tr) => tr.id === id))
                        .filter((tr): tr is NonNullable<typeof tr> => tr != null)
                      const compareRest = filteredTroves.filter((t) => !compareTroveIds.has(t.id))
                      const compareLi = (t: (typeof troves)[number]) => {
                        const isPrimaryDisabled = t.id === primaryTroveId
                        return (
                          <li key={t.id} className={`mobile-trove-item ${compareTroveIds.has(t.id) ? ' mobile-trove-item--selected' : ''}${isPrimaryDisabled ? ' mobile-trove-item--disabled' : ''}`}>
                            <label className="mobile-trove-label">
                              <input
                                type="checkbox"
                                checked={compareTroveIds.has(t.id)}
                                disabled={isPrimaryDisabled}
                                onChange={() => !isPrimaryDisabled && toggleCompare(t.id)}
                              />
                              <span>{t.name}</span>
                            </label>
                            {(compareTroveIds.size !== 1 || !compareTroveIds.has(t.id) || t.id === primaryTroveId) && (
                              <span className="mobile-trove-only-actions">
                                <button type="button" className="mobile-trove-only-link mobile-trove-only-link--target" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCompareTargetClick(t.id) }} aria-label={`Compare only ${t.name}`} title="Only this trove"><img src="/target.png" alt="" className="mobile-trove-only-icon" /></button>
                              </span>
                            )}
                          </li>
                        )
                      }
                      return (
                        <>
                          {compareTop.map((t) => compareLi(t))}
                          {compareTop.length > 0 && compareRest.length > 0 ? (
                            <li className="mobile-trove-list-separator" aria-hidden="true">
                              <hr className="mobile-trove-separator" />
                            </li>
                          ) : null}
                          {compareRest.map((t) => compareLi(t))}
                        </>
                      )
                    })()
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
                                {t.name}{' '}
                                {searchResult != null
                                  ? (resultCount > 0
                                    ? <span className="mobile-trove-count-suffix">({formatCount(resultCount)}/{formatCount(t.count ?? 0)})</span>
                                    : `(${formatCount(resultCount)}/${formatCount(t.count ?? 0)})`)
                                  : `(${formatCount(t.count ?? 0)})`}
                              </span>
                            </label>
                            {(selectedTroveIds.size !== 1 || !selectedTroveIds.has(t.id)) && (
                              <span className="mobile-trove-only-actions">
                                <button type="button" className="mobile-trove-only-link mobile-trove-only-link--target" disabled={selectedTroveIds.size === 1 && !selectedTroveIds.has(t.id)} onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleTargetClick(t.id) }} aria-label={`Search only ${t.name}`} title="Only this trove"><img src="/target.png" alt="" className="mobile-trove-only-icon" /></button>
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
            {results.length === 0 && searchQuery.trim() && !searching && (
              <p className="mobile-no-results">No items.</p>
            )}
            {results.length > 0 && (
              <div className={`mobile-search-results-grid${mobileOverflowDropdownOpen ? ' mobile-filetype-dropdown-open' : ''}${!showSearchPaginationControls ? ' mobile-search-results-grid--no-pager' : ''}`}>
                {showSearchPaginationControls && (
                  <div className="mobile-view-mode-row">
                    <nav className="mobile-pagination" aria-label="Pages">
                      <button
                        type="button"
                        className="mobile-page-btn"
                        disabled={page <= 0 || searching}
                        onClick={() => goToPage(0)}
                        aria-label="First page"
                      >
                        «
                      </button>
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
                      <button
                        type="button"
                        className="mobile-page-btn"
                        disabled={page >= totalPages - 1 || searching}
                        onClick={() => goToPage(totalPages - 1)}
                        aria-label="Last page"
                      >
                        »
                      </button>
                    </nav>
                    <div className="mobile-page-size-dropdown-wrap mobile-page-size-label mobile-page-size-label--end" ref={pageSizeDropdownRef}>
                      Size
                      <div className="mobile-page-size-trigger-wrap">
                        <button
                          type="button"
                          className="mobile-page-size-trigger"
                          onClick={() => setPageSizeDropdownOpen((o) => !o)}
                          disabled={searching}
                          aria-expanded={pageSizeDropdownOpen}
                          aria-haspopup="listbox"
                          aria-label="Page size"
                        >
                          {formatCount(pageSize)}
                        </button>
                      </div>
                      {pageSizeDropdownOpen && (
                        <div className="mobile-page-size-panel" role="listbox" aria-label="Page size">
                          {MOBILE_PAGE_SIZE_OPTIONS.map((n) => (
                            <button
                              key={n}
                              type="button"
                              role="option"
                              aria-selected={pageSize === n}
                              className={`mobile-page-size-option${pageSize === n ? ' mobile-page-size-option--selected' : ''}`}
                              onClick={() => {
                                applyPageSizeChange(n)
                                setPageSizeDropdownOpen(false)
                              }}
                            >
                              {pageSize === n ? '✓ ' : ''}{formatCount(n)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <SearchResultsGrid
                  data={results}
                  sortBy={effectiveSortBy}
                  sortDir={effectiveSortDir}
                  onSortChange={(col, dir) => fetchSearch(0, col, dir)}
                  showScoreColumn={searchQuery.trim() !== '*'}
                  viewMode={effectiveSearchResultsViewMode}
                  afterFilterSlot={mobileGallerySortAfterFilterSlot}
                  hideTroveInGallery={selectedTroveIds.size === 1}
                  hideTroveInList={selectedTroveIds.size === 1}
                  showPdfSashInGallery
                  showGalleryDecorations={galleryDecorate}
                  isMobile
                  visibleExtraFieldKeys={visibleExtraFieldKeysForGrid}
                  onFetchAllForCopy={async () => fullSearchResultsRef.current}
                />
              </div>
            )}
          </>
        )}

        {searchMode === 'duplicates' && duplicatesResult != null && !searching && (
          <div className="mobile-dup-uniques-results">
            <DuplicateResultsView
              rows={Array.isArray(duplicatesResult.rows) ? duplicatesResult.rows : []}
              sortBy={duplicatesSortBy}
              sortDir={duplicatesSortDir}
              onSortChange={(col, dir) => fetchDuplicates(0, null, col, dir)}
              onOpenRawSource={(payload) => setCompareRawSourceLightbox(payload)}
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
              onOpenRawSource={(payload) => setCompareRawSourceLightbox(payload)}
            />
          </div>
        )}
        </div>
      </main>
      {compareRawSourceLightbox && typeof document !== 'undefined' && createPortal(
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
        </div>,
        document.body
      )}
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
                if (reloadInProgressRef.current) return
                reloadInProgressRef.current = true
                const runId = ++reloadRunIdRef.current
                setReloadTrovesInProgress(true)
                setReloadTrovesProgress({ current: 0, total: 0 })
                const controller = new AbortController()
                reloadAbortControllerRef.current = controller
                const makeReloadHeaders = () => {
                  const h = { ...getApiAuthHeaders() }
                  const t = getCsrfToken()
                  if (t) h['X-XSRF-TOKEN'] = t
                  return h
                }
                try {
                  let res = await fetch('/api/troves/reload/stream', { method: 'POST', credentials: 'include', headers: makeReloadHeaders(), signal: controller.signal })
                  if (res.status === 401) { window.location.href = '/login'; return }
                  // 403 usually means the XSRF-TOKEN cookie was absent; the 403 response sets it — retry once
                  if (res.status === 403) {
                    res = await fetch('/api/troves/reload/stream', { method: 'POST', credentials: 'include', headers: makeReloadHeaders(), signal: controller.signal })
                    if (res.status === 401) { window.location.href = '/login'; return }
                  }
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
              <span className="mobile-reload-label">troves</span>
            </button>
          </span>
          <span className="mobile-footer-sep" aria-hidden="true">·</span>
          <Link to="/history" className="mobile-footer-link">
            History
          </Link>
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
      </footer>
    </div>
  )
}

export default MobileApp
