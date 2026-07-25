import { getApiAuthHeaders, readApiErrorMessage } from './apiAuth'
import { getCsrfToken, primeCsrfCookie } from './getCsrfToken'

export type DynamicTroveRegistration = {
  troveId: string
  name: string
  count: number
}

export type DynamicTroveItemRegistration = {
  /** Same as {@link title}; kept for older clients that read an id field. */
  id: string
  troveId: string
  title: string
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

export async function createDynamicTrove(name: string): Promise<DynamicTroveRegistration> {
  await ensureCsrf()
  const res = await fetch('/api/dynamic-troves', {
    method: 'POST',
    credentials: 'include',
    headers: writeHeaders(),
    body: JSON.stringify({ name }),
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (res.status === 409) {
    throw new Error('A trove with that name already exists')
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res))
  }
  return res.json() as Promise<DynamicTroveRegistration>
}

export async function deleteDynamicTrove(troveId: string): Promise<void> {
  await ensureCsrf()
  const res = await fetch(`/api/dynamic-troves/${encodeURIComponent(troveId)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: writeHeaders(),
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (res.status === 404) {
    throw new Error('Trove not found')
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res))
  }
}

export async function addDynamicTroveItem(
  troveId: string,
  title: string,
): Promise<DynamicTroveItemRegistration> {
  await ensureCsrf()
  const res = await fetch(`/api/dynamic-troves/${encodeURIComponent(troveId)}/items`, {
    method: 'POST',
    credentials: 'include',
    headers: writeHeaders(),
    body: JSON.stringify({ title }),
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (res.status === 404) {
    throw new Error('Trove not found')
  }
  if (res.status === 409) {
    throw new Error('That title already exists in this trove')
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res))
  }
  return res.json() as Promise<DynamicTroveItemRegistration>
}

export async function deleteDynamicTroveItem(troveId: string, title: string): Promise<void> {
  await ensureCsrf()
  const qs = new URLSearchParams({ title })
  const res = await fetch(
    `/api/dynamic-troves/${encodeURIComponent(troveId)}/items?${qs}`,
    {
      method: 'DELETE',
      credentials: 'include',
      headers: writeHeaders(),
    },
  )
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (res.status === 404) {
    throw new Error('Item not found')
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res))
  }
}
