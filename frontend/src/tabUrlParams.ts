/**
 * Shared query-string encoding for Search / Duplicates / Uniques tabs.
 * Namespaced keys (dq, dprimary, dpage, …) keep each tab’s state in the URL
 * without collisions. Legacy keys (q, primary, compare, page, size) are still
 * read and, when appropriate, written for older bookmarks and links.
 */
import type { FileTypeQuickModeValue } from './fileTypeQuickMode'
import { normalizeFileTypeQuickMode } from './fileTypeQuickMode'
import type { Trove } from './types'

export type TabMode = 'search' | 'duplicates' | 'uniques'

export type TabUrlSerializeInput = {
  activeMode: TabMode
  searchQuery: string
  dupQuery: string
  uniqQuery: string
  searchTroveIds: Set<string>
  dupPrimary: string
  dupCompare: Set<string>
  uniqPrimary: string
  uniqCompare: Set<string>
  fileTypeFilters: Set<string>
  fileTypeQuickMode: FileTypeQuickModeValue
  thumbnailOnly: boolean
  boostTroveId: string | null
  searchView: 'list' | 'gallery'
  extraGridFields: Set<string>
  pageSize: number
  dupPageSize: number
  uniqPageSize: number
  searchPage0Based: number | null | undefined
  dupPage0Based: number | null | undefined
  uniqPage0Based: number | null | undefined
  duplicatesSortBy: string | null
  duplicatesSortDir: 'asc' | 'desc'
  uniquesSortBy: string | null
  uniquesSortDir: 'asc' | 'desc'
  troves: Trove[]
  urlTroveId: (value: string, list: Trove[]) => string | null
}

export type TabUrlDeserializeResult = {
  searchQuery: string
  dupQuery: string
  uniqQuery: string
  searchTroveIds: string[]
  dupPrimary: string
  dupCompare: string[]
  uniqPrimary: string
  uniqCompare: string[]
  fileTypeFilters: string[]
  fileTypeQuickMode: FileTypeQuickModeValue
  thumbnailOnly: boolean
  boostTroveId: string | null
  searchView: 'list' | 'gallery'
  extraGridFields: string[]
  pageSize: number | null
  dupPageSize: number | null
  uniqPageSize: number | null
  searchPageOneBased: number | null
  dupPageOneBased: number | null
  uniqPageOneBased: number | null
  duplicatesSortBy: string | null
  duplicatesSortDir: 'asc' | 'desc'
  uniquesSortBy: string | null
  uniquesSortDir: 'asc' | 'desc'
}

function posInt(s: string | null): number | null {
  if (s == null || s === '') return null
  const n = Number(s)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function deserializeTabUrl(
  params: URLSearchParams,
  troves: Trove[],
  urlTroveId: (value: string, list: Trove[]) => string | null
): TabUrlDeserializeResult {
  const mode = params.get('mode')
  const q = params.get('q') ?? ''
  const dq = params.get('dq')
  const uq = params.get('uq')
  const searchQuery = q
  const dupQuery = dq != null && dq !== '' ? dq : q
  const uniqQuery = uq != null && uq !== '' ? uq : q

  const troveIds = params.getAll('trove').map((v) => urlTroveId(v, troves) ?? v).filter(Boolean)

  const boostRaw = params.get('boost')
  const boostTroveId =
    boostRaw != null && boostRaw !== '' ? (urlTroveId(boostRaw, troves) ?? boostRaw) : null

  const ftAll = params.getAll('fileTypes')
  const fileTypeFilters = ftAll
    .filter((f) => f != null && f.trim())
    .map((f) => (f.trim() === 'URL' ? 'Link' : f.trim()))

  const dPrimaryRaw = params.get('dprimary')
  const dupPrimary =
    (dPrimaryRaw != null && dPrimaryRaw !== ''
      ? urlTroveId(dPrimaryRaw, troves) ?? dPrimaryRaw
      : null) ??
    (mode === 'duplicates' && params.get('primary')
      ? urlTroveId(params.get('primary')!, troves) ?? params.get('primary')!
      : '') ??
    ''

  const dupCompareSrc =
    params.getAll('dcompare').length > 0
      ? params.getAll('dcompare')
      : mode === 'duplicates'
        ? params.getAll('compare')
        : []
  const dupCompare = dupCompareSrc.map((v) => urlTroveId(v, troves) ?? v).filter(Boolean)

  const uPrimaryRaw = params.get('uprimary')
  const uniqPrimary =
    (uPrimaryRaw != null && uPrimaryRaw !== ''
      ? urlTroveId(uPrimaryRaw, troves) ?? uPrimaryRaw
      : null) ??
    (mode === 'uniques' && params.get('primary')
      ? urlTroveId(params.get('primary')!, troves) ?? params.get('primary')!
      : '') ??
    ''

  const uniqCompareSrc =
    params.getAll('ucompare').length > 0
      ? params.getAll('ucompare')
      : mode === 'uniques'
        ? params.getAll('compare')
        : []
  const uniqCompare = uniqCompareSrc.map((v) => urlTroveId(v, troves) ?? v).filter(Boolean)

  const view = params.get('view')
  const searchView = view === 'gallery' ? 'gallery' : 'list'

  const rawSize = posInt(params.get('size'))
  const dsize = posInt(params.get('dsize'))
  const usize = posInt(params.get('usize'))

  let pageSize: number | null = null
  let dupPageSize: number | null = null
  let uniqPageSize: number | null = null

  if (dsize != null) dupPageSize = dsize
  else if (mode === 'duplicates' && rawSize != null) dupPageSize = rawSize

  if (usize != null) uniqPageSize = usize
  else if (mode === 'uniques' && rawSize != null) uniqPageSize = rawSize

  if (rawSize != null) {
    if (mode !== 'duplicates' && mode !== 'uniques') {
      pageSize = rawSize
    } else if (dsize != null || usize != null) {
      pageSize = rawSize
    }
  }

  const searchPageOneBased = posInt(params.get('page'))
  const dupPageOneBased = posInt(params.get('dpage'))
  const uniqPageOneBased = posInt(params.get('upage'))

  const dsb = params.get('dsortBy')
  const dsd = params.get('dsortDir')
  const usb = params.get('usortBy')
  const usd = params.get('usortDir')

  return {
    searchQuery,
    dupQuery,
    uniqQuery,
    searchTroveIds: troveIds,
    dupPrimary,
    dupCompare,
    uniqPrimary,
    uniqCompare,
    fileTypeFilters,
    fileTypeQuickMode: normalizeFileTypeQuickMode(params.get('ftq')),
    thumbnailOnly: params.get('thumbs') === '1',
    boostTroveId,
    searchView,
    extraGridFields: params.getAll('extraFields').map((s) => s.trim()).filter(Boolean),
    pageSize,
    dupPageSize,
    uniqPageSize,
    searchPageOneBased,
    dupPageOneBased,
    uniqPageOneBased,
    duplicatesSortBy: dsb != null && dsb !== '' ? dsb : null,
    duplicatesSortDir: dsd === 'desc' ? 'desc' : 'asc',
    uniquesSortBy: usb != null && usb !== '' ? usb : null,
    uniquesSortDir: usd === 'desc' ? 'desc' : 'asc',
  }
}

export function serializeTabUrl(input: TabUrlSerializeInput): URLSearchParams {
  const next = new URLSearchParams()
  if (input.activeMode !== 'search') next.set('mode', input.activeMode)

  const sq = (input.searchQuery ?? '').trim()
  if (sq) next.set('q', sq)
  const dq = (input.dupQuery ?? '').trim()
  if (dq) next.set('dq', dq)
  const uq = (input.uniqQuery ?? '').trim()
  if (uq) next.set('uq', uq)

  const tid = (id: string) => input.urlTroveId(id, input.troves) ?? id
  Array.from(input.searchTroveIds)
    .map((id) => tid(id))
    .filter(Boolean)
    .forEach((id) => next.append('trove', id))

  const boostId = input.boostTroveId ? tid(input.boostTroveId) : null
  if (boostId) next.set('boost', boostId)

  const ft = input.fileTypeFilters
  if (ft && ft.size > 0) ft.forEach((f) => next.append('fileTypes', f))
  next.set('ftq', input.fileTypeQuickMode)
  if (input.thumbnailOnly) next.set('thumbs', '1')
  next.set('view', input.searchView === 'gallery' ? 'gallery' : 'list')
  const sortedExtra = [...input.extraGridFields].sort((a, b) => a.localeCompare(b))
  sortedExtra.forEach((k) => next.append('extraFields', k))

  next.set('size', String(input.pageSize))
  next.set('dsize', String(input.dupPageSize))
  next.set('usize', String(input.uniqPageSize))

  const dp = input.dupPrimary ? tid(input.dupPrimary) : null
  if (dp) next.set('dprimary', dp)
  Array.from(input.dupCompare)
    .map((id) => tid(id))
    .filter(Boolean)
    .forEach((id) => next.append('dcompare', id))

  const up = input.uniqPrimary ? tid(input.uniqPrimary) : null
  if (up) next.set('uprimary', up)
  Array.from(input.uniqCompare)
    .map((id) => tid(id))
    .filter(Boolean)
    .forEach((id) => next.append('ucompare', id))

  if (input.activeMode === 'duplicates' && dp) {
    next.set('primary', dp)
    Array.from(input.dupCompare)
      .map((id) => tid(id))
      .filter(Boolean)
      .forEach((id) => next.append('compare', id))
  } else if (input.activeMode === 'uniques' && up) {
    next.set('primary', up)
    Array.from(input.uniqCompare)
      .map((id) => tid(id))
      .filter(Boolean)
      .forEach((id) => next.append('compare', id))
  }

  const sp = input.searchPage0Based
  if (sp != null && sp >= 0) next.set('page', String(sp + 1))
  const dpg = input.dupPage0Based
  if (dpg != null && dpg >= 0) next.set('dpage', String(dpg + 1))
  const upg = input.uniqPage0Based
  if (upg != null && upg >= 0) next.set('upage', String(upg + 1))

  if (input.duplicatesSortBy) {
    next.set('dsortBy', input.duplicatesSortBy)
    next.set('dsortDir', input.duplicatesSortDir)
  }
  if (input.uniquesSortBy) {
    next.set('usortBy', input.uniquesSortBy)
    next.set('usortDir', input.uniquesSortDir)
  }

  return next
}
