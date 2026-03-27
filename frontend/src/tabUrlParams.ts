/**
 * URL query string for the **active** tab only (`mode` selects which). Inactive tabs
 * are restored from sessionStorage (see sessionTabState.ts). Legacy prefixed keys
 * (dprimary, dq, …) are read as fallbacks when migrating old bookmarks.
 */
import type { FileTypeQuickModeValue } from './fileTypeQuickMode'
import { FileTypeQuickMode, normalizeFileTypeQuickMode } from './fileTypeQuickMode'
import type { Trove } from './types'
import type { DuplicatesTabSession, SearchTabSession, UniquesTabSession } from './sessionTabState'

export type TabMode = 'search' | 'duplicates' | 'uniques'

export type DeserializeActiveUrlResult = {
  mode: TabMode
  searchQuery: string
  searchTroveIds: string[]
  pageSize: number | null
  searchPageOneBased: number | null
  fileTypeFilters: string[]
  fileTypeQuickMode: FileTypeQuickModeValue
  thumbnailOnly: boolean
  boostTroveId: string | null
  searchView: 'list' | 'gallery'
  extraGridFields: string[]
  searchSortBy: string | null
  searchSortDir: 'asc' | 'desc' | null
  dupQuery: string
  dupPrimary: string
  dupCompare: string[]
  dupPageSize: number | null
  dupPageOneBased: number | null
  duplicatesSortBy: string | null
  duplicatesSortDir: 'asc' | 'desc'
  uniqQuery: string
  uniqPrimary: string
  uniqCompare: string[]
  uniqPageSize: number | null
  uniqPageOneBased: number | null
  uniquesSortBy: string | null
  uniquesSortDir: 'asc' | 'desc'
}

function posInt(s: string | null): number | null {
  if (s == null || s === '') return null
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function modeFromParams(params: URLSearchParams): TabMode {
  const m = params.get('mode')
  if (m === 'duplicates' || m === 'uniques') return m
  return 'search'
}

/**
 * Reads the active tab from the URL. Non-active tab fields in the result are empty;
 * the app merges session storage for those.
 */
export function deserializeActiveTabFromUrl(
  params: URLSearchParams,
  troves: Trove[],
  urlTroveId: (value: string, list: Trove[]) => string | null
): DeserializeActiveUrlResult {
  const mode = modeFromParams(params)
  const q = params.get('q') ?? ''
  const empty: DeserializeActiveUrlResult = {
    mode,
    searchQuery: '',
    searchTroveIds: [],
    pageSize: null,
    searchPageOneBased: null,
    fileTypeFilters: [],
    fileTypeQuickMode: normalizeFileTypeQuickMode(params.get('ftq')),
    thumbnailOnly: params.get('thumbs') === '1',
    boostTroveId: null,
    searchView: 'list',
    extraGridFields: [],
    searchSortBy: null,
    searchSortDir: null,
    dupQuery: '',
    dupPrimary: '',
    dupCompare: [],
    dupPageSize: null,
    dupPageOneBased: null,
    duplicatesSortBy: null,
    duplicatesSortDir: 'asc',
    uniqQuery: '',
    uniqPrimary: '',
    uniqCompare: [],
    uniqPageSize: null,
    uniqPageOneBased: null,
    uniquesSortBy: null,
    uniquesSortDir: 'asc',
  }

  const rawSize = posInt(params.get('size'))
  const pageOne = posInt(params.get('page'))
  const sb = params.get('sortBy')
  const sd = params.get('sortDir')

  if (mode === 'search') {
    const troveIds = params.getAll('trove').map((v) => urlTroveId(v, troves) ?? v).filter(Boolean)
    const boostRaw = params.get('boost')
    const boostTroveId =
      boostRaw != null && boostRaw !== '' ? (urlTroveId(boostRaw, troves) ?? boostRaw) : null
    const ftAll = params.getAll('fileTypes')
    const fileTypeFilters = ftAll
      .filter((f) => f != null && f.trim())
      .map((f) => (f.trim() === 'URL' ? 'Link' : f.trim()))
    const view = params.get('view')
    const searchView = view === 'gallery' ? 'gallery' : 'list'
    return {
      ...empty,
      searchQuery: q,
      searchTroveIds: troveIds,
      pageSize: rawSize,
      searchPageOneBased: pageOne,
      fileTypeFilters,
      fileTypeQuickMode: normalizeFileTypeQuickMode(params.get('ftq')),
      thumbnailOnly: params.get('thumbs') === '1',
      boostTroveId,
      searchView,
      extraGridFields: params.getAll('extraFields').map((s) => s.trim()).filter(Boolean),
      searchSortBy: sb != null && sb !== '' ? sb : null,
      searchSortDir: sd === 'desc' || sd === 'asc' ? sd : null,
    }
  }

  let primary =
    params.get('primary') != null && params.get('primary') !== ''
      ? urlTroveId(params.get('primary')!, troves) ?? params.get('primary')!
      : ''
  if (!primary && params.get('dprimary')) {
    primary = urlTroveId(params.get('dprimary')!, troves) ?? params.get('dprimary')!
  }
  let compareSrc = params.getAll('compare')
  if (compareSrc.length === 0 && params.getAll('dcompare').length > 0) compareSrc = params.getAll('dcompare')
  if (compareSrc.length === 0 && params.getAll('ucompare').length > 0) compareSrc = params.getAll('ucompare')
  const compare = compareSrc.map((v) => urlTroveId(v, troves) ?? v).filter(Boolean)

  const dupQ = params.get('dq') != null && params.get('dq') !== '' ? params.get('dq')! : q
  const uniqQ = params.get('uq') != null && params.get('uq') !== '' ? params.get('uq')! : q

  if (mode === 'duplicates') {
    return {
      ...empty,
      dupQuery: dupQ,
      dupPrimary: primary,
      dupCompare: compare,
      dupPageSize: rawSize,
      dupPageOneBased: pageOne ?? posInt(params.get('dpage')),
      duplicatesSortBy: sb != null && sb !== '' ? sb : null,
      duplicatesSortDir: sd === 'desc' ? 'desc' : 'asc',
    }
  }

  return {
    ...empty,
    uniqQuery: uniqQ,
    uniqPrimary: primary,
    uniqCompare: compare,
    uniqPageSize: rawSize,
    uniqPageOneBased: pageOne ?? posInt(params.get('upage')),
    uniquesSortBy: sb != null && sb !== '' ? sb : null,
    uniquesSortDir: sd === 'desc' ? 'desc' : 'asc',
  }
}

export type SerializeTabUrlInput = {
  mode: TabMode
  searchQuery: string
  searchTroveIds: Set<string>
  pageSize: number
  searchPage0Based: number | null | undefined
  fileTypeFilters: Set<string>
  fileTypeQuickMode: FileTypeQuickModeValue
  thumbnailOnly: boolean
  boostTroveId: string | null
  searchView: 'list' | 'gallery'
  extraGridFields: Set<string>
  dupQuery: string
  dupPrimary: string
  dupCompare: Set<string>
  dupPageSize: number
  dupPage0Based: number | null | undefined
  duplicatesSortBy: string | null
  duplicatesSortDir: 'asc' | 'desc'
  uniqQuery: string
  uniqPrimary: string
  uniqCompare: Set<string>
  uniqPageSize: number
  uniqPage0Based: number | null | undefined
  uniquesSortBy: string | null
  uniquesSortDir: 'asc' | 'desc'
  /** Search tab list/grid sort (passed to /api/search) */
  effectiveSearchSortBy: string | null
  effectiveSearchSortDir: 'asc' | 'desc' | null
  troves: Trove[]
  urlTroveId: (value: string, list: Trove[]) => string | null
}

export function serializeActiveTabToUrl(input: SerializeTabUrlInput): URLSearchParams {
  const next = new URLSearchParams()
  const tid = (id: string) => input.urlTroveId(id, input.troves) ?? id

  if (input.mode === 'search') {
    const q = (input.searchQuery ?? '').trim()
    if (q) next.set('q', q)
    Array.from(input.searchTroveIds)
      .map((id) => tid(id))
      .filter(Boolean)
      .forEach((id) => next.append('trove', id))
    const boostId = input.boostTroveId ? tid(input.boostTroveId) : null
    if (boostId) next.set('boost', boostId)
    input.fileTypeFilters.forEach((f) => next.append('fileTypes', f))
    next.set('ftq', input.fileTypeQuickMode)
    if (input.thumbnailOnly) next.set('thumbs', '1')
    next.set('view', input.searchView === 'gallery' ? 'gallery' : 'list')
    const sortedExtra = [...input.extraGridFields].sort((a, b) => a.localeCompare(b))
    sortedExtra.forEach((k) => next.append('extraFields', k))
    next.set('size', String(input.pageSize))
    const sp = input.searchPage0Based
    if (sp != null && sp >= 0) next.set('page', String(sp + 1))
    const esb = input.effectiveSearchSortBy
    const esd = input.effectiveSearchSortDir
    if (esb) {
      next.set('sortBy', esb)
      if (esd) next.set('sortDir', esd)
    }
    return next
  }

  if (input.mode === 'duplicates') {
    next.set('mode', 'duplicates')
    const q = (input.dupQuery ?? '').trim()
    if (q) next.set('q', q)
    const dp = input.dupPrimary ? tid(input.dupPrimary) : null
    if (dp) next.set('primary', dp)
    Array.from(input.dupCompare)
      .map((id) => tid(id))
      .filter(Boolean)
      .forEach((id) => next.append('compare', id))
    next.set('size', String(input.dupPageSize))
    const dpg = input.dupPage0Based
    if (dpg != null && dpg >= 0) next.set('page', String(dpg + 1))
    if (input.duplicatesSortBy) {
      next.set('sortBy', input.duplicatesSortBy)
      next.set('sortDir', input.duplicatesSortDir)
    }
    return next
  }

  next.set('mode', 'uniques')
  const q = (input.uniqQuery ?? '').trim()
  if (q) next.set('q', q)
  const up = input.uniqPrimary ? tid(input.uniqPrimary) : null
  if (up) next.set('primary', up)
  Array.from(input.uniqCompare)
    .map((id) => tid(id))
    .filter(Boolean)
    .forEach((id) => next.append('compare', id))
  next.set('size', String(input.uniqPageSize))
  const upg = input.uniqPage0Based
  if (upg != null && upg >= 0) next.set('page', String(upg + 1))
  if (input.uniquesSortBy) {
    next.set('sortBy', input.uniquesSortBy)
    next.set('sortDir', input.uniquesSortDir)
  }
  return next
}

function emptySearchSession(): SearchTabSession {
  return {
    searchQuery: '',
    searchSelectedTroveIds: [],
    pageSize: 500,
    fileTypeFilters: [],
    fileTypeQuickMode: FileTypeQuickMode.Meh,
    thumbnailOnly: false,
    boostTroveId: null,
    searchResultsViewMode: 'list',
    extraGridFields: [],
    starSortBy: null,
    starSortDir: null,
    otherSortBy: null,
    otherSortDir: null,
    searchPage0Based: 0,
  }
}

function emptyDuplicatesSession(): DuplicatesTabSession {
  return {
    dupQuery: '',
    dupPrimaryTroveId: '',
    dupCompareTroveIds: [],
    dupPageSize: 50,
    duplicatesSortBy: null,
    duplicatesSortDir: 'asc',
    duplicatesPage0Based: 0,
  }
}

function emptyUniquesSession(): UniquesTabSession {
  return {
    uniqQuery: '',
    uniqPrimaryTroveId: '',
    uniqCompareTroveIds: [],
    uniqPageSize: 50,
    uniquesSortBy: null,
    uniquesSortDir: 'asc',
    uniquesPage0Based: 0,
  }
}

export type TabSessionsBundle = {
  search: SearchTabSession | null
  duplicates: DuplicatesTabSession | null
  uniques: UniquesTabSession | null
}

/**
 * Build the URL for a tab **after** saving the outgoing tab to session — uses only
 * session snapshots so the address bar does not depend on async React state updates.
 */
export function serializeUrlFromTabSessions(
  mode: TabMode,
  sessions: TabSessionsBundle,
  troves: Trove[],
  urlTroveId: (value: string, list: Trove[]) => string | null
): URLSearchParams {
  if (mode === 'search') {
    const s = sessions.search ?? emptySearchSession()
    const isStar = s.searchQuery.trim() === '*'
    const effBy = isStar ? (s.starSortBy ?? 'title') : (s.otherSortBy ?? 'score')
    const effDir = isStar ? (s.starSortDir ?? 'asc') : (s.otherSortDir ?? 'desc')
    return serializeActiveTabToUrl({
      mode: 'search',
      searchQuery: s.searchQuery,
      searchTroveIds: new Set(s.searchSelectedTroveIds),
      pageSize: s.pageSize,
      searchPage0Based: s.searchPage0Based ?? 0,
      fileTypeFilters: new Set(s.fileTypeFilters),
      fileTypeQuickMode: s.fileTypeQuickMode,
      thumbnailOnly: s.thumbnailOnly,
      boostTroveId: s.boostTroveId,
      searchView: s.searchResultsViewMode,
      extraGridFields: new Set(s.extraGridFields),
      dupQuery: '',
      dupPrimary: '',
      dupCompare: new Set(),
      dupPageSize: 50,
      dupPage0Based: null,
      duplicatesSortBy: null,
      duplicatesSortDir: 'asc',
      uniqQuery: '',
      uniqPrimary: '',
      uniqCompare: new Set(),
      uniqPageSize: 50,
      uniqPage0Based: null,
      uniquesSortBy: null,
      uniquesSortDir: 'asc',
      effectiveSearchSortBy: effBy,
      effectiveSearchSortDir: effDir,
      troves,
      urlTroveId,
    })
  }

  if (mode === 'duplicates') {
    const d = sessions.duplicates ?? emptyDuplicatesSession()
    return serializeActiveTabToUrl({
      mode: 'duplicates',
      searchQuery: '',
      searchTroveIds: new Set(),
      pageSize: 500,
      searchPage0Based: null,
      fileTypeFilters: new Set(),
      fileTypeQuickMode: FileTypeQuickMode.Meh,
      thumbnailOnly: false,
      boostTroveId: null,
      searchView: 'list',
      extraGridFields: new Set(),
      dupQuery: d.dupQuery,
      dupPrimary: d.dupPrimaryTroveId,
      dupCompare: new Set(d.dupCompareTroveIds),
      dupPageSize: d.dupPageSize,
      dupPage0Based: d.duplicatesPage0Based ?? 0,
      duplicatesSortBy: d.duplicatesSortBy,
      duplicatesSortDir: d.duplicatesSortDir,
      uniqQuery: '',
      uniqPrimary: '',
      uniqCompare: new Set(),
      uniqPageSize: 50,
      uniqPage0Based: null,
      uniquesSortBy: null,
      uniquesSortDir: 'asc',
      effectiveSearchSortBy: null,
      effectiveSearchSortDir: null,
      troves,
      urlTroveId,
    })
  }

  const u = sessions.uniques ?? emptyUniquesSession()
  return serializeActiveTabToUrl({
    mode: 'uniques',
    searchQuery: '',
    searchTroveIds: new Set(),
    pageSize: 500,
    searchPage0Based: null,
    fileTypeFilters: new Set(),
    fileTypeQuickMode: FileTypeQuickMode.Meh,
    thumbnailOnly: false,
    boostTroveId: null,
    searchView: 'list',
    extraGridFields: new Set(),
    dupQuery: '',
    dupPrimary: '',
    dupCompare: new Set(),
    dupPageSize: 50,
    dupPage0Based: null,
    duplicatesSortBy: null,
    duplicatesSortDir: 'asc',
    uniqQuery: u.uniqQuery,
    uniqPrimary: u.uniqPrimaryTroveId,
    uniqCompare: new Set(u.uniqCompareTroveIds),
    uniqPageSize: u.uniqPageSize,
    uniqPage0Based: u.uniquesPage0Based ?? 0,
    uniquesSortBy: u.uniquesSortBy,
    uniquesSortDir: u.uniquesSortDir,
    effectiveSearchSortBy: null,
    effectiveSearchSortDir: null,
    troves,
    urlTroveId,
  })
}
