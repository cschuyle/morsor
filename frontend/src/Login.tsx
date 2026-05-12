import { useState, useEffect, useRef, FormEvent } from 'react'
import { getApiAuthHeaders } from './apiAuth'
import { getCsrfToken, primeCsrfCookie } from './getCsrfToken'
import './Login.css'

/** Spring failed-login redirects are 302 to /login?error (do not treat as success). */
function loginRedirectIsFailure(location: string | null): boolean {
  if (!location) {
    return false
  }
  try {
    const path = new URL(location, window.location.origin).pathname
    return path === '/login' || path.endsWith('/login')
  } catch {
    return location.includes('/login')
  }
}

function fetchAuthSession(): Promise<Response> {
  return fetch('/api/auth/session', { credentials: 'include', headers: { ...getApiAuthHeaders() } })
}

async function sessionResponseIndicatesLoggedIn(res: Response): Promise<boolean> {
  if (res.status === 503) {
    return false
  }
  if (!res.ok) {
    return false
  }
  try {
    const body = (await res.json()) as { authenticated?: boolean }
    return body.authenticated === true
  } catch {
    return false
  }
}

type LoginOutcome = { kind: 'goto'; href: string } | { kind: 'error'; message: string }

async function loginOutcomeFromResponse(res: Response, redirectTo: string): Promise<LoginOutcome> {
  if (res.status === 302) {
    const loc = res.headers.get('Location')
    if (loginRedirectIsFailure(loc)) {
      return { kind: 'error', message: 'Invalid username or password.' }
    }
    return { kind: 'goto', href: redirectTo }
  }
  if (res.status === 200) {
    const check = await fetchAuthSession()
    if (check.status === 503) {
      return { kind: 'goto', href: '/login?error=service_unavailable' }
    }
    if (await sessionResponseIndicatesLoggedIn(check)) {
      return { kind: 'goto', href: redirectTo }
    }
    return { kind: 'error', message: 'Invalid username or password.' }
  }
  if (res.type === 'opaqueredirect' || res.status === 0) {
    // Spring's session-fixation protection issues a new JSESSIONID in the 302 Set-Cookie.
    // With redirect:'manual' some browsers apply that cookie asynchronously, so the first
    // session check may use the old (pre-login) session. Retry twice with short delays.
    for (const delay of [0, 150, 500, 1000]) {
      if (delay > 0) await new Promise<void>((r) => setTimeout(r, delay))
      const check = await fetchAuthSession()
      if (check.status === 503) {
        return { kind: 'goto', href: '/login?error=service_unavailable' }
      }
      if (await sessionResponseIndicatesLoggedIn(check)) {
        return { kind: 'goto', href: redirectTo }
      }
    }
    return { kind: 'error', message: 'Invalid username or password.' }
  }
  if (res.status === 401 || res.status === 403) {
    return { kind: 'error', message: 'Invalid username or password.' }
  }
  return { kind: 'error', message: 'Invalid username or password.' }
}

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
    // Password managers often trigger submit without a real pointer event on the button, so
    // onPointerDown sync never runs. They may also commit .value a frame or two after submit.
    syncControlledFieldsFromDom()
    await waitForAutofillPaint()
    let { user, pass } = mergeCredentialsFromForm(formEl, username, password)

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

    const attemptLogin = async (): Promise<Response> => {
      if (!getCsrfToken()) {
        try {
          await primeCsrfCookie()
        } catch {
          // ignore
        }
      }
      const csrf = getCsrfToken()
      // Final DOM read: autofill may land after the waits above, or between prime and POST.
      const creds = mergeCredentialsFromForm(formEl, user, pass)
      user = creds.user
      pass = creds.pass
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
        let r = res
        if (r.status === 401 || r.status === 403) {
          try {
            await primeCsrfCookie()
            await fetch('/api/status', { credentials: 'include', headers: { ...getApiAuthHeaders() } })
          } catch {
            // ignore
          }
          r = await attemptLogin()
        }
        const out = await loginOutcomeFromResponse(r, redirectTo)
        if (out.kind === 'goto') {
          window.location.href = out.href
        } else {
          setError(out.message)
        }
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
