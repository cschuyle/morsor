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

  /**
   * Merge React state with live DOM values (1Password, browser AutoFill, etc. often skip onChange).
   * Prefer whichever side is non-empty; if both set, keep React state (typed edits win).
   */
  function mergeCredentialsFromForm(
    form: HTMLFormElement,
    stateUser: string,
    statePass: string
  ): { user: string; pass: string } {
    const unInput = form.querySelector<HTMLInputElement>('[name=username]')
    const pwInput = form.querySelector<HTMLInputElement>('[name=password]')
    const domUser = (unInput?.value ?? '').trim()
    const domPass = pwInput?.value ?? ''
    const stateU = (stateUser ?? '').trim()
    const stateP = statePass ?? ''
    return {
      user: stateU || domUser,
      pass: stateP || domPass,
    }
  }

  /** Run before submit (pointer down) so desktop managers have one more chance to sync React state. */
  function syncControlledFieldsFromDom() {
    const form = formRef.current
    if (!form) {
      return
    }
    const { user, pass } = mergeCredentialsFromForm(form, username, password)
    if (user) {
      setUsername(user)
    }
    if (pass) {
      setPassword(pass)
    }
  }

  /** iOS / 1Password often commit `.value` a tick after the click; wait then re-read DOM. */
  function waitForAutofillPaint(): Promise<void> {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve())
      })
    })
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    const formEl = formRef.current ?? e.currentTarget
    let { user, pass } = mergeCredentialsFromForm(formEl, username, password)

    if (!user || !pass) {
      await waitForAutofillPaint()
      ;({ user, pass } = mergeCredentialsFromForm(formEl, username, password))
    }
    if (!user || !pass) {
      await new Promise<void>((r) => setTimeout(r, 100))
      ;({ user, pass } = mergeCredentialsFromForm(formEl, username, password))
    }
    if (!user || !pass) {
      await new Promise<void>((r) => setTimeout(r, 250))
      ;({ user, pass } = mergeCredentialsFromForm(formEl, username, password))
    }

    if (!user || !pass) {
      setError(
        'Username and password are required. If you used AutoFill, wait a moment and click Sign in again.'
      )
      setSubmitting(false)
      return
    }

    setUsername(user)
    setPassword(pass)

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
              onInput={(e) => setUsername(e.currentTarget.value)}
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
              onInput={(e) => setPassword(e.currentTarget.value)}
              className="login-input"
              required
            />
          </label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button
            type="submit"
            className="login-submit"
            disabled={submitting}
            onPointerDown={(ev) => {
              if (ev.button === 0) {
                syncControlledFieldsFromDom()
              }
            }}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>
    </div>
  )
}
