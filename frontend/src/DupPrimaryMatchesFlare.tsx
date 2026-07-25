import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { DupPrimaryMatch } from './useDupPrimaryTitleExists'
import './DupPrimaryMatchesFlare.css'

export type DupPrimaryMatchesFlareProps = {
  open: boolean
  matches: DupPrimaryMatch[]
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
}

/**
 * Dropdown listing top search hits in the primary trove, anchored under the
 * search box. Dismiss via Escape (editing the query also closes it via the hook).
 */
export function DupPrimaryMatchesFlare({
  open,
  matches,
  anchorRef,
  onClose,
}: DupPrimaryMatchesFlareProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<CSSProperties>({})

  useLayoutEffect(() => {
    const anchorEl = anchorRef.current
    if (!open || !anchorEl) {
      return
    }
    const updatePosition = () => {
      const rect = anchorEl.getBoundingClientRect()
      const margin = 4
      const width = rect.width
      let left = rect.left
      if (left + width > window.innerWidth - margin) {
        left = window.innerWidth - width - margin
      }
      left = Math.max(margin, left)
      setPosition({
        position: 'fixed',
        top: rect.bottom - 1,
        left,
        width,
        zIndex: 10040,
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, anchorRef, matches.length])

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose])

  if (!open || matches.length === 0 || typeof document === 'undefined') {
    return null
  }

  const content = (
    <div
      ref={panelRef}
      className="dup-primary-matches-dropdown"
      style={position}
      role="listbox"
      aria-label="Matches in trove"
    >
      <ul className="dup-primary-matches-dropdown-list">
        {matches.map((m, i) => (
          <li key={`${m.title}-${i}`} className="dup-primary-matches-dropdown-item" role="option">
            <span className="dup-primary-matches-dropdown-title">{m.title}</span>
            {(m.trove || typeof m.score === 'number') && (
              <span className="dup-primary-matches-dropdown-meta">
                {m.trove ?? ''}
                {typeof m.score === 'number' ? `${m.trove ? ' · ' : ''}${m.score.toFixed(2)}` : ''}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )

  return createPortal(content, document.body)
}
