import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Wayne's World\nFace-Off (1997)")
  })
})
