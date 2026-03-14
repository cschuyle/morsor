/**
 * Regression test: desktop pagination (Search, Duplicates, Uniques) shows
 * "1 ... 6 7 8 9 10 ... N" so we don't lose it again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

function makeSearchResponse(count, page, size, resultsLength) {
  const results = Array.from({ length: resultsLength }, (_, i) => ({
    id: `id-${page * size + i}`,
    title: `Item ${page * size + i + 1}`,
    snippet: '',
    trove: 'Test',
    troveId: 'test',
  }))
  return {
    count,
    results,
    page,
    size,
    troveCounts: { test: count },
  }
}

function makeDuplicatesResponse(total, page, size) {
  const rowsLength = Math.min(size, Math.max(0, total - page * size))
  const rows = Array.from({ length: rowsLength }, (_, i) => ({
    primary: { id: `p-${i}`, title: `Primary ${i}`, trove: 'P', troveId: 'p' },
    matches: [],
  }))
  return { total, page, size, rows }
}

function makeUniquesResponse(total, page, size) {
  const resultsLength = Math.min(size, Math.max(0, total - page * size))
  const results = Array.from({ length: resultsLength }, (_, i) => ({
    item: { id: `u-${i}`, title: `Unique ${i}`, trove: 'P', troveId: 'p' },
    score: 0.5,
    nearMisses: [],
  }))
  return { total, page, size, results }
}

/** Return a fetch Response whose body is a single NDJSON line (for stream API mocks). */
function streamDoneResponse(payload) {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(JSON.stringify({ type: 'done', result: payload }) + '\n'))
      controller.close()
    },
  })
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } })
}

function expectNumberedPagination(nav) {
  const numsContainer = nav.querySelector('.pagination-nums')
  expect(numsContainer).toBeInTheDocument()
  const ellipses = nav.querySelectorAll('.pagination-ellipsis')
  expect(ellipses.length).toBeGreaterThanOrEqual(1)
  expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Page 10' })).toBeInTheDocument()
}

const twoTroves = [
  { id: 'p', name: 'Primary Trove', count: 100 },
  { id: 'c', name: 'Compare Trove', count: 100 },
]

describe('Desktop search pagination', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const path = typeof url === 'string' ? url : ''
      if (path.includes('/api/troves')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ id: 'test', name: 'Test Trove', count: 500 }]),
        })
      }
      if (path.includes('/api/search') && !path.includes('/duplicates') && !path.includes('/uniques')) {
        const u = new URL(path, 'http://localhost')
        const page = parseInt(u.searchParams.get('page') || '0', 10)
        const size = parseInt(u.searchParams.get('size') || '500', 10)
        const count = 5000
        const resultsLength = Math.min(size, Math.max(0, count - page * size))
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(makeSearchResponse(count, page, size, resultsLength)),
        })
      }
      if (path.includes('/api/status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'UP', cache: { entries: 0, estimatedBytes: 0 } }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }))
  })

  it('Search: shows numbered pagination with ellipses when many pages', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByText(/Status: Backend is up/)).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByText(/Test Trove/)).toBeInTheDocument()
    })

    const queryInput = screen.getByPlaceholderText(/e\.g\. Greek/)
    fireEvent.change(queryInput, { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      const nav = screen.getByRole('navigation', { name: /Search results pages/i })
      expect(nav).toBeInTheDocument()
      expect(nav.textContent).toMatch(/Page\s+.*of\s+10/)
    })

    const nav = screen.getByRole('navigation', { name: /Search results pages/i })
    expect(nav).toBeInTheDocument()
    expectNumberedPagination(nav)
  })
})

describe('Desktop duplicates pagination', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const path = typeof url === 'string' ? url : ''
      if (path.includes('/api/troves')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(twoTroves) })
      }
      if (path.includes('/api/search/duplicates/stream')) {
        const u = new URL(path, 'http://localhost')
        const page = parseInt(u.searchParams.get('page') || '0', 10)
        const size = parseInt(u.searchParams.get('size') || '50', 10)
        const total = 500
        return Promise.resolve(streamDoneResponse(makeDuplicatesResponse(total, page, size)))
      }
      if (path.includes('/api/status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'UP', cache: { entries: 0, estimatedBytes: 0 } }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }))
  })

  it('Duplicates: shows numbered pagination with ellipses when many pages', async () => {
    render(
      <MemoryRouter initialEntries={['/?mode=duplicates&primary=p&compare=c']}>
        <App />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByText(/Status: Backend is up/)).toBeInTheDocument()
    })
    // URL state (primary=p, compare=c) is restored on mount; trigger search
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    const nav = await screen.findByRole('navigation', { name: /Duplicate results pages/i, timeout: 3000 })
    await waitFor(() => {
      expect(within(nav).getByText(/Page 1 of 10/)).toBeInTheDocument()
    })
    expectNumberedPagination(nav)
  })
})

describe('Desktop uniques pagination', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const path = typeof url === 'string' ? url : ''
      if (path.includes('/api/troves')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(twoTroves) })
      }
      if (path.includes('/api/search/uniques/stream')) {
        const u = new URL(path, 'http://localhost')
        const page = parseInt(u.searchParams.get('page') || '0', 10)
        const size = parseInt(u.searchParams.get('size') || '50', 10)
        const total = 500
        return Promise.resolve(streamDoneResponse(makeUniquesResponse(total, page, size)))
      }
      if (path.includes('/api/status')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'UP', cache: { entries: 0, estimatedBytes: 0 } }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }))
  })

  it('Uniques: shows numbered pagination with ellipses when many pages', async () => {
    render(
      <MemoryRouter initialEntries={['/?mode=uniques&primary=p&compare=c']}>
        <App />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByText(/Status: Backend is up/)).toBeInTheDocument()
    })
    // URL state (primary=p, compare=c) is restored on mount; trigger search
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    const nav = await screen.findByRole('navigation', { name: /Uniques results pages/i, timeout: 3000 })
    await waitFor(() => {
      expect(within(nav).getByText(/Page 1 of 10/)).toBeInTheDocument()
    })
    expectNumberedPagination(nav)
  })
})
