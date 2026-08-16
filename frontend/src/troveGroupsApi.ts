import { getApiAuthHeaders, readApiErrorMessage } from './apiAuth'
import { getCsrfToken, primeCsrfCookie } from './getCsrfToken'

export type TroveGroup = {
  id: string
  name: string
  troveIds: string[]
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

export async function fetchTroveGroups(): Promise<TroveGroup[]> {
  const res = await fetch('/api/trove-groups', {
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
  return Array.isArray(data) ? (data as TroveGroup[]) : []
}

export async function createTroveGroup(name: string): Promise<TroveGroup> {
  await ensureCsrf()
  const res = await fetch('/api/trove-groups', {
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
    throw new Error('A group with that name already exists')
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res))
  }
  return res.json() as Promise<TroveGroup>
}

export async function renameTroveGroup(groupId: string, name: string): Promise<void> {
  await ensureCsrf()
  const res = await fetch(`/api/trove-groups/${encodeURIComponent(groupId)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: writeHeaders(),
    body: JSON.stringify({ name }),
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (res.status === 404) {
    throw new Error('Group not found')
  }
  if (res.status === 409) {
    throw new Error('A group with that name already exists')
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res))
  }
}

export async function deleteTroveGroup(groupId: string): Promise<void> {
  await ensureCsrf()
  const res = await fetch(`/api/trove-groups/${encodeURIComponent(groupId)}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: writeHeaders(),
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (res.status === 404) {
    throw new Error('Group not found')
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res))
  }
}

export async function addTroveGroupMember(groupId: string, troveId: string): Promise<void> {
  await ensureCsrf()
  const res = await fetch(`/api/trove-groups/${encodeURIComponent(groupId)}/members`, {
    method: 'POST',
    credentials: 'include',
    headers: writeHeaders(),
    body: JSON.stringify({ troveId }),
  })
  if (res.status === 401) {
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (res.status === 404) {
    throw new Error('Group not found')
  }
  if (res.status === 409) {
    throw new Error('That trove is already in this group')
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res))
  }
}

export async function removeTroveGroupMember(groupId: string, troveId: string): Promise<void> {
  await ensureCsrf()
  const qs = new URLSearchParams({ troveId })
  const res = await fetch(
    `/api/trove-groups/${encodeURIComponent(groupId)}/members?${qs}`,
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
    throw new Error('Trove not found in this group')
  }
  if (!res.ok) {
    throw new Error(await readApiErrorMessage(res))
  }
}
