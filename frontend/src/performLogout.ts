import { getCsrfToken } from './getCsrfToken'

function buildLogoutHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
  const token = getCsrfToken()
  if (token) headers['X-XSRF-TOKEN'] = token
  return headers
}

async function attemptLogout(): Promise<Response> {
  return fetch('/logout', {
    method: 'POST',
    credentials: 'include',
    headers: buildLogoutHeaders(),
  })
}

export async function performLogout(): Promise<void> {
  let res = await attemptLogout()
  if (res.ok) return
  if (res.status === 401 || res.status === 403) {
    try {
      await fetch('/api/status', { credentials: 'include' })
    } catch {
      // Ignore; we'll still retry once with whatever cookies we have.
    }
    res = await attemptLogout()
    if (res.ok) return
  }
  throw new Error(`Logout failed with status ${res.status}`)
}
