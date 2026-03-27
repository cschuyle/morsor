/**
 * UI tests: Search / Duplicates / Uniques each keep their own query (and session payload)
 * in sessionStorage while the URL only reflects the active tab.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import MobileApp from './MobileApp'

const SESSION_KEY = 'morsor.queryConsole.tabState.v1'

const twoTroves = [
  { id: 'favorites', name: 'Favorites', count: 100 },
  { id: 'other', name: 'Other Trove', count: 50 },
]

function mockFetch() {
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

async function waitForDesktopReady() {
  await waitFor(() => {
    expect(screen.getByText(/Status: Backend is up/)).toBeInTheDocument()
  })
}

async function waitForMobileReady() {
  await waitFor(() => {
    expect(screen.getByRole('img', { name: 'Server OK' })).toBeInTheDocument()
  })
}

describe('Desktop App: tab session persistence', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.stubGlobal('fetch', mockFetch())
  })

  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it('round-trip: each tab keeps its own query string after cycling tabs', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )
    await waitForDesktopReady()

    const queryInput = screen.getByRole('textbox', { name: 'Query' })
    const tabSearch = screen.getByRole('tab', { name: 'Search' })
    const tabDup = screen.getByRole('tab', { name: 'Find duplicates' })
    const tabUniq = screen.getByRole('tab', { name: 'Find uniques' })

    fireEvent.change(queryInput, { target: { value: 'search-sess-alpha' } })
    fireEvent.click(tabDup)
    await waitFor(() => {
      expect(tabDup).toHaveAttribute('aria-selected', 'true')
    })

    fireEvent.change(queryInput, { target: { value: 'dup-sess-beta' } })
    fireEvent.click(tabUniq)
    await waitFor(() => {
      expect(tabUniq).toHaveAttribute('aria-selected', 'true')
    })

    fireEvent.change(queryInput, { target: { value: 'uniq-sess-gamma' } })

    fireEvent.click(tabSearch)
    await waitFor(() => {
      expect(tabSearch).toHaveAttribute('aria-selected', 'true')
      expect(queryInput).toHaveValue('search-sess-alpha')
    })

    fireEvent.click(tabDup)
    await waitFor(() => {
      expect(queryInput).toHaveValue('dup-sess-beta')
    })

    fireEvent.click(tabUniq)
    await waitFor(() => {
      expect(queryInput).toHaveValue('uniq-sess-gamma')
    })
  })

  it('sessionStorage bundle retains all three tab payloads with matching queries', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    )
    await waitForDesktopReady()

    const queryInput = screen.getByRole('textbox', { name: 'Query' })
    const tabSearch = screen.getByRole('tab', { name: 'Search' })
    const tabDup = screen.getByRole('tab', { name: 'Find duplicates' })
    const tabUniq = screen.getByRole('tab', { name: 'Find uniques' })

    fireEvent.change(queryInput, { target: { value: 'q-search' } })
    fireEvent.click(tabDup)
    await waitFor(() => expect(tabDup).toHaveAttribute('aria-selected', 'true'))
    fireEvent.change(queryInput, { target: { value: 'q-dup' } })
    fireEvent.click(tabUniq)
    await waitFor(() => expect(tabUniq).toHaveAttribute('aria-selected', 'true'))
    fireEvent.change(queryInput, { target: { value: 'q-uniq' } })

    fireEvent.click(tabSearch)
    await waitFor(() => expect(tabSearch).toHaveAttribute('aria-selected', 'true'))

    const raw = sessionStorage.getItem(SESSION_KEY)
    expect(raw).toBeTruthy()
    const bundle = JSON.parse(raw)
    expect(bundle.search?.searchQuery).toBe('q-search')
    expect(bundle.duplicates?.dupQuery).toBe('q-dup')
    expect(bundle.uniques?.uniqQuery).toBe('q-uniq')
  })
})

describe('Mobile App: tab session persistence', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.stubGlobal('fetch', mockFetch())
  })

  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it('round-trip: each tab keeps its own query string after cycling tabs', async () => {
    render(
      <MemoryRouter initialEntries={['/mobile']}>
        <MobileApp />
      </MemoryRouter>
    )
    await waitForMobileReady()

    const queryInput = screen.getByRole('searchbox', { name: 'Query' })
    const tabSearch = screen.getByRole('tab', { name: 'Search' })
    const tabDup = screen.getByRole('tab', { name: 'Duplicates' })
    const tabUniq = screen.getByRole('tab', { name: 'Uniques' })

    fireEvent.change(queryInput, { target: { value: 'mobile-search-1' } })
    fireEvent.click(tabDup)
    await waitFor(() => {
      expect(tabDup).toHaveAttribute('aria-selected', 'true')
    })

    fireEvent.change(queryInput, { target: { value: 'mobile-dup-2' } })
    fireEvent.click(tabUniq)
    await waitFor(() => {
      expect(tabUniq).toHaveAttribute('aria-selected', 'true')
    })

    fireEvent.change(queryInput, { target: { value: 'mobile-uniq-3' } })

    fireEvent.click(tabSearch)
    await waitFor(() => {
      expect(tabSearch).toHaveAttribute('aria-selected', 'true')
      expect(queryInput).toHaveValue('mobile-search-1')
    })

    fireEvent.click(tabDup)
    await waitFor(() => {
      expect(queryInput).toHaveValue('mobile-dup-2')
    })

    fireEvent.click(tabUniq)
    await waitFor(() => {
      expect(queryInput).toHaveValue('mobile-uniq-3')
    })
  })
})
