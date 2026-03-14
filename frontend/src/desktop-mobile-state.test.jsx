/**
 * Test that search and trove state is shared between desktop and mobile:
 * the same query and trove selections are preserved when toggling via
 * "Mobile" / "Desktop site" links (state lives in the URL).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import MobileApp from './MobileApp'

const twoTroves = [
  { id: 'favorites', name: 'Favorites', count: 100 },
  { id: 'other', name: 'Other Trove', count: 50 },
]

function defaultFetchMock() {
  return vi.fn((url) => {
    const path = typeof url === 'string' ? url : ''
    if (path.includes('/api/troves')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(twoTroves) })
    }
    if (path.includes('/api/status')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'UP', cache: { entries: 0, estimatedBytes: 0 } }),
      })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
}

describe('Desktop and mobile share state via URL', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', defaultFetchMock())
  })

  it('Desktop "Mobile" link preserves query and trove params in href', async () => {
    const search = '?mode=duplicates&q=*&primary=favorites&compare=other'
    render(
      <MemoryRouter initialEntries={[`/${search}`]}>
        <App />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByText(/Status: Backend is up/)).toBeInTheDocument()
    })

    const mobileLink = screen.getByRole('link', { name: 'Mobile' })
    const href = mobileLink.getAttribute('href') ?? ''
    expect(href).toContain('/mobile')
    expect(href).toContain('mode=duplicates')
    expect(href).toContain('q=')
    expect(href).toContain('primary=favorites')
    expect(href).toContain('compare=other')
  })

  it('Mobile "Desktop site" link preserves query and trove params in href', async () => {
    const search = '?mode=duplicates&q=*&primary=favorites&compare=other'
    render(
      <MemoryRouter initialEntries={[`/mobile${search}`]}>
        <MobileApp />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Server OK' })).toBeInTheDocument()
    })

    const desktopLink = screen.getByRole('link', { name: 'Desktop' })
    const href = desktopLink.getAttribute('href') ?? ''
    expect(href).toContain('mode=duplicates')
    expect(href).toContain('q=')
    expect(href).toContain('primary=favorites')
    expect(href).toContain('compare=other')
  })

  it('Search mode: desktop Mobile link includes trove and q params', async () => {
    const search = '?q=test&trove=favorites&trove=other'
    render(
      <MemoryRouter initialEntries={[`/${search}`]}>
        <App />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByText(/Status: Backend is up/)).toBeInTheDocument()
    })

    const mobileLink = screen.getByRole('link', { name: 'Mobile' })
    const href = mobileLink.getAttribute('href') ?? ''
    expect(href).toContain('/mobile')
    expect(href).toContain('q=test')
    expect(href).toContain('trove=favorites')
    expect(href).toContain('trove=other')
  })

  it('Search mode: mobile Desktop site link includes trove and q params', async () => {
    const search = '?q=test&trove=favorites&trove=other'
    render(
      <MemoryRouter initialEntries={[`/mobile${search}`]}>
        <MobileApp />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Server OK' })).toBeInTheDocument()
    })

    const desktopLink = screen.getByRole('link', { name: 'Desktop' })
    const href = desktopLink.getAttribute('href') ?? ''
    expect(href).toContain('q=test')
    expect(href).toContain('trove=favorites')
    expect(href).toContain('trove=other')
  })
})
