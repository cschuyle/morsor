/**
 * In Vite dev, use the hardwired API token so you don't need to log in.
 * Set VITE_DEV_API_TOKEN in .env.local to override (default: dev-token).
 */
export function getDevApiToken(env: ImportMetaEnv = import.meta.env): string | null {
  if (!env.DEV) {
    return null
  }
  if (env.VITE_DEV_API_TOKEN !== undefined && env.VITE_DEV_API_TOKEN !== '') {
    return env.VITE_DEV_API_TOKEN
  }
  return 'dev-token'
}

/**
 * Headers to add to API requests. In Vite dev, adds Authorization: Bearer <dev-token>.
 */
export function getApiAuthHeaders(env: ImportMetaEnv = import.meta.env): Record<string, string> {
  const token = getDevApiToken(env)
  if (token) {
    return { Authorization: `Bearer ${token}` }
  }
  return {}
}

/** Prefer JSON `error` from a failed API response; fall back to status text. */
export async function readApiErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string }
    if (typeof body?.error === 'string' && body.error.trim()) {
      return body.error
    }
  } catch {
    // ignore non-JSON bodies
  }
  return res.statusText || `HTTP ${res.status}`
}
