/**
 * Frontend tests that use canned data fixtures (same shape as backend dev data).
 * Fixtures live in src/fixtures/; mock fetch via mockFetchWithCannedData().
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { mockFetchWithCannedData } from './test/mockFetchWithCannedData'

describe('App with canned data', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetchWithCannedData())
  })

  it('shows trove option from canned data (Little Prince)', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByText('Status: Backend is up')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByText(/Little Prince/)).toBeInTheDocument()
    })
  })

  it('search returns canned result (The Little Prince, in Ancient Greek)', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>
    )
    await waitFor(() => {
      expect(screen.getByText(/Little Prince/)).toBeInTheDocument()
    })
    const searchInput = screen.getByPlaceholderText(/e\.g\. Greek/)
    fireEvent.change(searchInput, { target: { value: 'Greek' } })
    const searchBtn = screen.getByRole('button', { name: 'Search' })
    fireEvent.click(searchBtn)
    await waitFor(() => {
      expect(screen.getByText('The Little Prince, in Ancient Greek')).toBeInTheDocument()
    })
  })
})
