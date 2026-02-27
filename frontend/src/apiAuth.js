/**
 * In dev, use the hardwired API token so you don't need to log in.
 * Set VITE_DEV_API_TOKEN in .env.local to override (default: dev-token).
 */
function getDevApiToken() {
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_API_TOKEN !== undefined) {
    return import.meta.env.VITE_DEV_API_TOKEN
  }
  if (import.meta.env.DEV) {
    return 'dev-token'
  }
  return null
}

/**
 * Headers to add to API requests. In dev, adds Authorization: Bearer <dev-token> when not logged in.
 */
export function getApiAuthHeaders() {
  const token = getDevApiToken()
  if (token) {
    return { Authorization: `Bearer ${token}` }
  }
  return {}
}
