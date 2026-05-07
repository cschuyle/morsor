import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UniquesResultsView } from './UniquesResultsView'

describe('UniquesResultsView copy titles', () => {
  const originalClipboard = navigator.clipboard

  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    })
  })

  it('copies unique item titles one per line', async () => {
    render(
      <UniquesResultsView
        results={[
          { item: { id: '1', title: 'Apollo 13', trove: 'Movies' }, nearMisses: [] },
          { item: { id: '2', title: 'The Knick', trove: 'TV' }, nearMisses: [] },
          { item: { id: '3', title: '   ', trove: 'TV' }, nearMisses: [] },
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy Titles' }))

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Apollo 13\nThe Knick')
    })
  })

  it('copies full uniques table as CSV and TSV', async () => {
    render(
      <UniquesResultsView
        results={[
          {
            item: { id: '1', title: 'Apollo 13', trove: 'Movies' },
            score: 0.87,
            nearMisses: [
              { result: { id: '2', title: 'Apollo 18', trove: 'Movies' }, score: 0.72 },
            ],
          },
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'CSV' }))
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'Title,Trove,Score\nApollo 13,Movies,0.87\nApollo 18,Movies,0.72',
      )
    })

    fireEvent.click(screen.getByRole('button', { name: 'TSV' }))
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'Title\tTrove\tScore\nApollo 13\tMovies\t0.87\nApollo 18\tMovies\t0.72',
      )
    })
  })
})
