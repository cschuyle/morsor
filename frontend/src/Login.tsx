import { useState, useEffect, useRef, FormEvent } from 'react'
import { getCsrfToken } from './getCsrfToken'
import './Login.css'

export default function Login() {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [redirectTo, setRedirectTo] = useState(() => `${window.location.origin}/`)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const errorParam = params.get('error')
    if (errorParam === 'service_unavailable') {
      setError('Service unavailable. The database may be down. Please try again later.')
    } else if (params.has('error')) {
      setError('Invalid username or password.')
    }
    const nextParam = params.get('next')
    if (nextParam) {
      try {
        const url = new URL(nextParam, window.location.origin)
        setRedirectTo(url.toString())
      } catch {
        // ignore malformed next; keep default
      }
    }
  }, [])

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    let user = (username ?? '').trim()
    let pass = password ?? ''
    // Safari/Firefox often don't fire onChange for password-manager autofill; read from DOM as fallback
    if ((!user || !pass) && formRef.current) {
      const unInput = formRef.current.querySelector<HTMLInputElement>('[name=username]')
      const pwInput = formRef.current.querySelector<HTMLInputElement>('[name=password]')
      if (unInput && pwInput) {
        if (!user) user = (unInput.value ?? '').trim()
        if (!pass) pass = pwInput.value ?? ''
      }
    }
    if (!user || !pass) {
      setSubmitting(false)
      return
    }
    const attemptLogin = (): Promise<Response> => {
      const csrf = getCsrfToken()
      const body = new URLSearchParams({ username: user, password: pass })
      const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' }
      if (csrf) headers['X-XSRF-TOKEN'] = csrf
      return fetch('/login', {
        method: 'POST',
        credentials: 'include',
        redirect: 'manual',
        headers,
        body,
      })
    }

    attemptLogin()
      .then(async (res) => {
        if (res.type === 'opaqueredirect' || res.status === 302 || res.status === 200) {
          window.location.href = redirectTo
          return
        }
        if (res.status === 401 || res.status === 403) {
          try {
            await fetch('/api/status', { credentials: 'include' })
          } catch {
            // ignore
          }
          const retry = await attemptLogin()
          if (retry.type === 'opaqueredirect' || retry.status === 302 || retry.status === 200) {
            window.location.href = redirectTo
            return
          }
        }
        setError('Invalid username or password.')
      })
      .catch(() => setError('Login failed.'))
      .finally(() => setSubmitting(false))
  }

  return (
    <div className="login-page">
      <main className="login-main">
        <h1 className="login-title">Morsor</h1>
        <p className="login-subtitle">Sign in</p>
        <form ref={formRef} onSubmit={handleSubmit} className="login-form">
          <label className="login-label">
            Username
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="login-input"
              required
            />
          </label>
          <label className="login-label">
            Password
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="login-input"
              required
            />
          </label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button type="submit" className="login-submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>
    </div>
  )
}
