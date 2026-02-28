import { useState, useEffect, useRef } from 'react'
import { getCsrfToken } from './getCsrfToken'
import './Login.css'

export default function Login() {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const formRef = useRef(null)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('error')) {
      setError('Invalid username or password.')
    }
  }, [])

  function handleSubmit(e) {
    e.preventDefault()
    const form = formRef.current
    if (!form) return
    const fd = new FormData(form)
    const user = (fd.get('username') ?? '').toString().trim()
    const pass = (fd.get('password') ?? '').toString()
    if (!user || !pass) return
    setError('')
    setSubmitting(true)
    const csrf = getCsrfToken()
    const body = new URLSearchParams({ username: user, password: pass })
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' }
    if (csrf) headers['X-XSRF-TOKEN'] = csrf
    fetch('/login', {
      method: 'POST',
      credentials: 'include',
      redirect: 'manual',
      headers,
      body,
    })
      .then((res) => {
        if (res.type === 'opaqueredirect' || res.status === 302) {
          // Stay on current origin (e.g. Vite dev server) instead of following backend redirect to :8080
          window.location.href = `${window.location.origin}/`
          return
        }
        if (res.status === 200) {
          window.location.href = `${window.location.origin}/`
          return
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
              defaultValue=""
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
              defaultValue=""
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
