import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { RequireAuth } from './RequireAuth'

describe('RequireAuth', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn((url, options) => {
      return Promise.resolve({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ authenticated: true }),
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    Object.defineProperty(window, 'location', {
      value: { ...window.location, hostname: 'localhost' },
      writable: true,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('checks /api/auth/session before rendering children', async () => {
    render(
      <RequireAuth>
        <span>Child content</span>
      </RequireAuth>
    )

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled()
    })

    const sessionCall = fetchMock.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('/api/auth/session')
    )
    expect(sessionCall).toBeDefined()
  })

  it('renders children after successful auth', async () => {
    render(
      <RequireAuth>
        <span>Child content</span>
      </RequireAuth>
    )

    await waitFor(() => {
      expect(screen.getByText('Child content')).toBeInTheDocument()
    })
  })

  it('redirects to login when session returns 200 with authenticated false', async () => {
    const locationMock = { href: 'http://localhost/', pathname: '/', search: '', hash: '' }
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: locationMock,
    })
    fetchMock.mockImplementation(() =>
      Promise.resolve({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ authenticated: false }),
      })
    )
    render(
      <RequireAuth>
        <span>Hidden</span>
      </RequireAuth>
    )
    await waitFor(() => {
      expect(locationMock.href).toMatch(/^\/login\?next=/)
    })
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument()
  })

  it('redirects to login with service_unavailable when auth session returns 503 (e.g. DB down)', async () => {
    const locationMock = { href: 'http://localhost/', pathname: '/', search: '', hash: '' }
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: locationMock,
    })

    fetchMock.mockImplementation(() =>
      Promise.resolve({
        status: 503,
        ok: false,
      })
    )

    render(
      <RequireAuth>
        <span>Child content</span>
      </RequireAuth>
    )

    await waitFor(() => {
      expect(locationMock.href).toBe('/login?error=service_unavailable')
    })
    expect(screen.queryByText('Child content')).not.toBeInTheDocument()
  })
})
