import { getApiAuthHeaders } from './apiAuth'

/**
 * Read CSRF token from cookie (Spring Security CookieCsrfTokenRepository sets XSRF-TOKEN).
 */
export function getCsrfToken(): string | null {
  const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}

let primeInFlight: Promise<void> | null = null

/**
 * Ensures a server round-trip so Spring creates the session and XSRF-TOKEN cookie before POST /login.
 * Call this only when the user is submitting credentials (Login does not prime on page load).
 * Uses `GET /api/auth/csrf-prime` (204, permitAll). Dedupes concurrent in-flight primes.
 */
export function primeCsrfCookie(): Promise<void> {
  if (getCsrfToken()) {
    return Promise.resolve()
  }
  if (primeInFlight) {
    return primeInFlight
  }
  primeInFlight = fetch('/api/auth/csrf-prime', {
    method: 'GET',
    credentials: 'include',
    headers: { ...getApiAuthHeaders() },
  })
    .then(() => undefined)
    .finally(() => {
      primeInFlight = null
    })
  return primeInFlight
}
