/**
 * Per-tab UI state for Search / Duplicates / Uniques (sessionStorage).
 * Only the active tab is reflected in the URL; inactive tabs restore from here on switch.
 */
import type { FileTypeQuickModeValue } from './fileTypeQuickMode'

const STORAGE_KEY = 'morsor.queryConsole.tabState.v1'

export type SearchTabSession = {
  searchQuery: string
  searchSelectedTroveIds: string[]
  pageSize: number
  fileTypeFilters: string[]
  fileTypeQuickMode: FileTypeQuickModeValue
  thumbnailOnly: boolean
  boostTroveId: string | null
  searchResultsViewMode: 'list' | 'gallery'
  extraGridFields: string[]
  starSortBy: string | null
  starSortDir: 'asc' | 'desc' | null
  otherSortBy: string | null
  otherSortDir: 'asc' | 'desc' | null
  /** Last viewed results page (0-based), for URL restore when returning to the tab */
  searchPage0Based?: number
}

export type DuplicatesTabSession = {
  dupQuery: string
  dupPrimaryTroveId: string
  dupCompareTroveIds: string[]
  dupPageSize: number
  duplicatesSortBy: string | null
  duplicatesSortDir: 'asc' | 'desc'
  duplicatesPage0Based?: number
}

export type UniquesTabSession = {
  uniqQuery: string
  uniqPrimaryTroveId: string
  uniqCompareTroveIds: string[]
  uniqPageSize: number
  uniquesSortBy: string | null
  uniquesSortDir: 'asc' | 'desc'
  uniquesPage0Based?: number
}

export type TabSessionBundle = {
  search: SearchTabSession | null
  duplicates: DuplicatesTabSession | null
  uniques: UniquesTabSession | null
}

function readBundle(): TabSessionBundle {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return { search: null, duplicates: null, uniques: null }
    const o = JSON.parse(raw) as TabSessionBundle
    return {
      search: o?.search ?? null,
      duplicates: o?.duplicates ?? null,
      uniques: o?.uniques ?? null,
    }
  } catch {
    return { search: null, duplicates: null, uniques: null }
  }
}

function writeBundle(b: TabSessionBundle) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(b))
  } catch {
    // ignore quota / private mode
  }
}

export function loadSearchTabSession(): SearchTabSession | null {
  return readBundle().search
}

export function loadDuplicatesTabSession(): DuplicatesTabSession | null {
  return readBundle().duplicates
}

export function loadUniquesTabSession(): UniquesTabSession | null {
  return readBundle().uniques
}

export function saveSearchTabSession(s: SearchTabSession) {
  const b = readBundle()
  b.search = s
  writeBundle(b)
}

export function saveDuplicatesTabSession(s: DuplicatesTabSession) {
  const b = readBundle()
  b.duplicates = s
  writeBundle(b)
}

export function saveUniquesTabSession(s: UniquesTabSession) {
  const b = readBundle()
  b.uniques = s
  writeBundle(b)
}
