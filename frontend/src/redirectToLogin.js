export function redirectToLogin() {
  try {
    const { pathname, search, hash } = window.location
    const next = encodeURIComponent(`${pathname}${search}${hash}`)
    window.location.href = `/login?next=${next}`
  } catch {
    window.location.href = '/login'
  }
}

