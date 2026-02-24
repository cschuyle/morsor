import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import App from './App'

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('renders Morsor heading', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'UP' }),
    })
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Morsor' })).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByText('Backend is up')).toBeInTheDocument()
    })
  })

  it('renders search form with Search button', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 'UP' }),
    })
    render(<App />)
    await waitFor(() => {
      expect(screen.getByText('Backend is up')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
  })
})
