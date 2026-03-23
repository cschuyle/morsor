import { useState, useEffect, ReactNode } from 'react'
import { getApiAuthHeaders } from './apiAuth'
import { redirectToLogin } from './redirectToLogin'

interface RequireAuthProps {
  children: ReactNode
}

/**
 * Prevents flash of logged-in UI: verify auth before rendering children.
 * Uses GET /api/auth/session (200 + JSON, touches auth DB when logged in) — not 401 when logged out.
 * Must include getApiAuthHeaders() so the initial auth check also works under the Vite dev server.
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const [status, setStatus] = useState<'pending' | 'ok' | 'redirecting'>('pending')
  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include', headers: { ...getApiAuthHeaders() } })
      .then(async (res) => {
        if (res.status === 503) {
          setStatus('redirecting')
          window.location.href = '/login?error=service_unavailable'
          return
        }
        if (res.status === 403) {
          setStatus('redirecting')
          redirectToLogin()
          return
        }
        if (res.status === 401) {
          setStatus('redirecting')
          redirectToLogin()
          return
        }
        if (!res.ok) {
          setStatus('redirecting')
          window.location.href = '/login?error=service_unavailable'
          return
        }
        let authenticated = false
        try {
          const body = (await res.json()) as { authenticated?: boolean }
          authenticated = body.authenticated === true
        } catch {
          authenticated = false
        }
        if (authenticated) {
          setStatus('ok')
          return
        }
        setStatus('redirecting')
        redirectToLogin()
      })
      .catch(() => {
        setStatus('redirecting')
        redirectToLogin()
      })
  }, [])
  if (status !== 'ok') return null
  return <>{children}</>
}
