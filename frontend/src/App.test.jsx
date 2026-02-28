import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (typeof url === 'string' && url.includes('/api/troves')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'UP' }) })
    }))
  })

  it('renders search form with Search button', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByText('Status: Backend is up')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
  })
})
