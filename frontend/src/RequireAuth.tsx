import { useState, useEffect, ReactNode } from 'react'
import { getApiAuthHeaders } from './apiAuth'
import { redirectToLogin } from './redirectToLogin'

interface RequireAuthProps {
  children: ReactNode
}

/**
 * Prevents flash of logged-in UI: verify auth before rendering children; redirect to /login if 401.
 * Must include getApiAuthHeaders() so the initial auth check also works under the Vite dev server.
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const [status, setStatus] = useState<'pending' | 'ok' | 'redirecting'>('pending')
  useEffect(() => {
    fetch('/api/troves', { credentials: 'include', headers: { ...getApiAuthHeaders() } })
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          setStatus('redirecting')
          redirectToLogin()
          return
        }
        if (res.ok) {
          setStatus('ok')
          return
        }
        setStatus('redirecting')
        window.location.href = '/login?error=service_unavailable'
      })
      .catch(() => {
        setStatus('redirecting')
        redirectToLogin()
      })
  }, [])
  if (status !== 'ok') return null
  return <>{children}</>
}
