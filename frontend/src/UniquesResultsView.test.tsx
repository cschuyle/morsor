import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

  it('copies unique item titles one per line', () => {
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

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Apollo 13\nThe Knick')
  })
})
