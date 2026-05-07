import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DuplicateResultsView } from './DuplicateResultsView'

describe('DuplicateResultsView copy primary titles', () => {
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

  it('copies primary titles one per line', async () => {
    render(
      <DuplicateResultsView
        rows={[
          { primary: { id: '1', title: "Wayne's World", trove: 'Movies' }, matches: [] },
          { primary: { id: '2', title: 'Face-Off (1997)', trove: 'Movies' }, matches: [] },
          { primary: { id: '3', title: '  ', trove: 'Movies' }, matches: [] },
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy Primary Titles' }))

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Wayne's World\nFace-Off (1997)")
    })
    expect(screen.getByRole('status')).toHaveTextContent('Copied primary titles to the clipboard.')
  })

  it('copies duplicates table as CSV and TSV with Result Type first column', async () => {
    render(
      <DuplicateResultsView
        rows={[
          {
            primary: { id: '1', title: "Wayne's World", trove: 'Movies' },
            matches: [
              { result: { id: '2', title: 'Face-Off (1997)', trove: 'Movies' }, score: 1.12 },
            ],
          },
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'CSV' }))
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "Result Type,Title,Trove,Score\nprimary,Wayne's World,Movies,1.12\ncompare,Face-Off (1997),Movies,1.12",
      )
    })
    expect(screen.getByRole('status')).toHaveTextContent('Copied a CSV table to the clipboard.')

    fireEvent.click(screen.getByRole('button', { name: 'TSV' }))
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "Result Type\tTitle\tTrove\tScore\nprimary\tWayne's World\tMovies\t1.12\ncompare\tFace-Off (1997)\tMovies\t1.12",
      )
    })
    expect(screen.getByRole('status')).toHaveTextContent('Copied a TSV table to the clipboard.')
  })
})
