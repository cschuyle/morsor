import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchResultsGrid } from './SearchResultsGrid'

describe('SearchResultsGrid copy titles', () => {
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

  it('copies search result titles one per line', () => {
    render(
      <SearchResultsGrid
        data={[
          { id: '1', title: "Wayne's World", trove: 'Movies', score: 1.2 },
          { id: '2', title: 'Face-Off (1997)', trove: 'Movies', score: 1.1 },
          { id: '3', title: '   ', trove: 'Movies', score: 1.0 },
        ]}
        showScoreColumn
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Copy Titles' }))

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Wayne's World\nFace-Off (1997)")
  })
})
