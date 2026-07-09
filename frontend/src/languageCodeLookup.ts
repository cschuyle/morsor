const DEFAULT_LANGUAGE_TROVE_ID = 'iso639-languages'

type LanguageCodeMap = Map<string, string>

export type { LanguageCodeMap }

let cachedMap: LanguageCodeMap | null = null
let loadPromise: Promise<LanguageCodeMap> | null = null

function normalizeCode(code: string): string {
  return code.trim().toLowerCase()
}

function lookupKeyVariants(code: string): string[] {
  const key = normalizeCode(code)
  if (!key) {
    return []
  }
  const variants = [key]
  const underscore = key.indexOf('_')
  if (underscore > 0) {
    variants.push(key.slice(0, underscore))
  }
  const dash = key.indexOf('-')
  if (dash > 0) {
    variants.push(key.slice(0, dash))
  }
  return variants
}

function registerCode(map: LanguageCodeMap, code: unknown, name: string): void {
  if (typeof code !== 'string') {
    return
  }
  const key = normalizeCode(code)
  if (!key || !name.trim()) {
    return
  }
  if (!map.has(key)) {
    map.set(key, name.trim())
  }
}

function parseAliases(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(',').map((s) => s.trim()).filter(Boolean)
  }
  return []
}

function buildMapFromTroveDocument(doc: unknown): LanguageCodeMap {
  const map: LanguageCodeMap = new Map()
  if (!doc || typeof doc !== 'object') {
    return map
  }
  const items = (doc as { items?: unknown }).items
  if (!Array.isArray(items)) {
    return map
  }
  for (const wrapper of items) {
    if (!wrapper || typeof wrapper !== 'object') {
      continue
    }
    const entry = (wrapper as { languageCode?: Record<string, unknown> }).languageCode
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const title = typeof entry.title === 'string' ? entry.title : ''
    if (!title.trim()) {
      continue
    }
    registerCode(map, entry.code, title)
    for (const alias of parseAliases(entry.aliases)) {
      registerCode(map, alias, title)
    }
  }
  return map
}

export function normalizeLanguageCodes(raw: unknown): string[] {
  if (raw == null) {
    return []
  }
  if (Array.isArray(raw)) {
    return raw
      .map((v) => (typeof v === 'string' ? v.trim() : String(v).trim()))
      .filter(Boolean)
  }
  if (typeof raw === 'string') {
    return raw.split(',').map((s) => s.trim()).filter(Boolean)
  }
  return []
}

export function resolveLanguageCodes(codes: string[], map: LanguageCodeMap | null | undefined): string[] {
  if (!codes.length) {
    return []
  }
  if (!map || map.size === 0) {
    return [...codes]
  }
  return codes.map((code) => {
    for (const key of lookupKeyVariants(code)) {
      const name = map.get(key)
      if (name) {
        return name
      }
    }
    return code
  })
}

export async function fetchLanguageCodeMap(
  troveId: string = DEFAULT_LANGUAGE_TROVE_ID,
  headers?: Record<string, string>,
): Promise<LanguageCodeMap> {
  const res = await fetch(`/api/troves/${encodeURIComponent(troveId)}`, {
    credentials: 'include',
    headers: headers ?? {},
  })
  if (!res.ok) {
    throw new Error(`GET /api/troves/${troveId}: HTTP ${res.status}`)
  }
  const doc = await res.json()
  return buildMapFromTroveDocument(doc)
}

export async function ensureLanguageCodeMap(
  headers?: Record<string, string>,
  troveId: string = DEFAULT_LANGUAGE_TROVE_ID,
): Promise<LanguageCodeMap> {
  if (cachedMap) {
    return cachedMap
  }
  if (!loadPromise) {
    loadPromise = fetchLanguageCodeMap(troveId, headers)
      .then((map) => {
        cachedMap = map
        return map
      })
      .finally(() => {
        loadPromise = null
      })
  }
  return loadPromise
}

export function clearLanguageCodeMapCache(): void {
  cachedMap = null
  loadPromise = null
}

export function resolveLanguagesFromExtra(
  extra: Record<string, unknown> | null | undefined,
  map: LanguageCodeMap | null | undefined,
): string | null {
  if (!extra) {
    return null
  }
  const display = extra['languages(display)']
  if (display != null) {
    if (Array.isArray(display)) {
      return display.map(String).filter(Boolean).join(', ')
    }
    if (typeof display === 'string' && display.trim()) {
      return display.trim()
    }
  }
  const raw = extra.languages
  if (raw == null) {
    return null
  }
  const codes = normalizeLanguageCodes(raw)
  if (!codes.length) {
    return null
  }
  return resolveLanguageCodes(codes, map).join(', ')
}
