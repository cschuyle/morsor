import { getApiAuthHeaders, readApiErrorMessage } from './apiAuth'
import { getCsrfToken, primeCsrfCookie } from './getCsrfToken'

/**
 * Server-side metadata for a trove's "local directory" — which trove has a folder connected,
 * and what it's labeled. Advisory only: the actual FileSystemDirectoryHandle that can read
 * files lives in this browser's IndexedDB (see troveDirectoryHandles.ts) and never leaves it.
 */
export type TroveLocalRoot = {
  troveId: string
  folderLabel: string
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

async function ensureCsrf(): Promise<void> {
  if (!getCsrfToken()) {
    await primeCsrfCookie()
  }
}

export async function fetchTroveLocalRoots(): Promise<TroveLocalRoot[]> {
  const res = await fetch('/api/trove-local-roots', {
    credentials: 'include',
    headers: { ...getApiAuthHeaders() },
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res))
  }
  const data: unknown = await res.json()
  return Array.isArray(data) ? (data as TroveLocalRoot[]) : []
}

/** Connect (or change) the folder label for a trove. Last connector wins. */
export async function setTroveLocalRoot(troveId: string, folderLabel: string): Promise<void> {
  await ensureCsrf()
  const res = await fetch(`/api/trove-local-roots/${encodeURIComponent(troveId)}`, {
    method: 'PUT',
    credentials: 'include',
    headers: writeHeaders(),
    body: JSON.stringify({ folderLabel }),
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res))
  }
}

/** Idempotent: safe to call even if this trove was never registered server-side. */
export async function deleteTroveLocalRoot(troveId: string): Promise<void> {
  await ensureCsrf()
  const res = await fetch(`/api/trove-local-roots/${encodeURIComponent(troveId)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: writeHeaders(),
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res))
  }
}
