/**
 * Regression test: desktop search pagination shows "1 ... 6 7 8 9 10 ... N"
 * (first page, ellipsis, 5 sequential numbers, ellipsis, last page) so we don't lose it again.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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
      if (path.includes('/actuator/health')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'UP' }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    }))
  })

  it('shows numbered pagination with ellipses when many pages (1 ... 5 6 7 8 9 ... 10)', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByText('Status: Backend is up')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByText(/Test Trove/)).toBeInTheDocument()
    })

    const queryInput = screen.getByPlaceholderText(/e\.g\. Greek/)
    fireEvent.change(queryInput, { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))

    await waitFor(() => {
      expect(screen.getByText(/Page 1 of 10/)).toBeInTheDocument()
    })

    const nav = screen.getByRole('navigation', { name: /Search results pages/i })
    expect(nav).toBeInTheDocument()

    const numsContainer = nav.querySelector('.pagination-nums')
    expect(numsContainer).toBeInTheDocument()

    const ellipses = nav.querySelectorAll('.pagination-ellipsis')
    expect(ellipses.length).toBeGreaterThanOrEqual(1)

    expect(screen.getByRole('button', { name: 'Page 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Page 10' })).toBeInTheDocument()
  })
})
