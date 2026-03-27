import { getApiAuthHeaders } from './apiAuth'
import { getCsrfToken, primeCsrfCookie } from './getCsrfToken'

export type SavedQueryDto = {
  id: number
  label: string
  consoleQuery: string
  mode: string
  summary: string | null
  createdAt: string
}

function writeHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getApiAuthHeaders(),
  }
  const token = getCsrfToken()
  if (token) {
    headers['X-XSRF-TOKEN'] = token
  }
  return headers
}

export async function fetchSavedQueries(): Promise<SavedQueryDto[]> {
  const res = await fetch('/api/saved-queries', {
    credentials: 'include',
    headers: { ...getApiAuthHeaders() },
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    throw new Error(res.statusText || `HTTP ${res.status}`)
  }
  return res.json() as Promise<SavedQueryDto[]>
}

export async function saveQueryToAccount(input: {
  consoleQuery: string
  mode: string
  summary: string
  label: string
}): Promise<SavedQueryDto> {
  if (!getCsrfToken()) {
    await primeCsrfCookie()
  }
  const res = await fetch('/api/saved-queries', {
    method: 'POST',
    credentials: 'include',
    headers: writeHeaders(),
    body: JSON.stringify({
      label: input.label.trim() || undefined,
      consoleQuery: input.consoleQuery,
      mode: input.mode,
      summary: input.summary,
    }),
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    let msg = res.statusText
    try {
      const j = (await res.json()) as { error?: string }
      if (j?.error) {
        msg = j.error
      }
    } catch {
      // ignore
    }
    throw new Error(msg || `HTTP ${res.status}`)
  }
  return res.json() as Promise<SavedQueryDto>
}

export async function deleteSavedQuery(id: number): Promise<void> {
  if (!getCsrfToken()) {
    await primeCsrfCookie()
  }
  const res = await fetch(`/api/saved-queries/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: writeHeaders(),
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (res.status === 404) {
    throw new Error('Not found')
  }
  if (!res.ok) {
    throw new Error(res.statusText || `HTTP ${res.status}`)
  }
}
