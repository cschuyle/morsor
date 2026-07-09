import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchQueryHelpPopover } from './SearchQueryHelpPopover'

describe('SearchQueryHelpPopover', () => {
  it('renders search examples and calls onTryExample when an example is clicked', () => {
    const anchor = document.createElement('div')
    document.body.appendChild(anchor)
    const anchorRef = { current: anchor }
    const onTryExample = vi.fn()
    const onClose = vi.fn()

    render(
      <SearchQueryHelpPopover
        open
        onClose={onClose}
        anchorRef={anchorRef}
        mode="search"
        onTryExample={onTryExample}
      />,
    )

    expect(screen.getByRole('dialog', { name: /search tips/i })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Greek prince' }))
    expect(onTryExample).toHaveBeenCalledWith('Greek prince')

    document.body.removeChild(anchor)
  })
})
