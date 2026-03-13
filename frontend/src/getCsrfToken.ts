/**
 * Read CSRF token from cookie (Spring Security CookieCsrfTokenRepository sets XSRF-TOKEN).
 */
export function getCsrfToken(): string | null {
  const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/)
  return match ? decodeURIComponent(match[1]) : null
}
