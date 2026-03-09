import { useState, useEffect, useRef } from 'react'
import { getCsrfToken } from './getCsrfToken'
import './Login.css'

export default function Login() {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const formRef = useRef(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const errorParam = params.get('error')
    if (errorParam === 'service_unavailable') {
      setError('Service unavailable. The database may be down. Please try again later.')
    } else if (params.has('error')) {
      setError('Invalid username or password.')
    }
  }, [])

  function handleSubmit(e) {
    e.preventDefault()
    const form = formRef.current
    if (!form) return
    setSubmitting(true)
    setError('')
    // Defer reading form so password manager / Safari autofill have written to inputs (first submit often fires before values are in the DOM).
    const runLogin = () => {
      const fd = new FormData(form)
      const user = (fd.get('username') ?? '').toString().trim()
      const pass = (fd.get('password') ?? '').toString()
      if (!user || !pass) {
        setSubmitting(false)
        return
      }
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
    requestAnimationFrame(() => {
      requestAnimationFrame(runLogin)
    })
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
