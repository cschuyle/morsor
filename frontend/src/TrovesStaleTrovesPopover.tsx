import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import './TrovesStaleTrovesPopover.css'

export type TrovesStaleTrovesPopoverProps = {
  open: boolean
  troveIds: string[]
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
}

/** Scrollable list of all changed trove ids, anchored under the stale-banner ellipsis button. */
export function TrovesStaleTrovesPopover({
  open,
  troveIds,
  anchorRef,
  onClose,
}: TrovesStaleTrovesPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<CSSProperties>({})

  useLayoutEffect(() => {
    const anchorEl = anchorRef.current
    if (!open || !anchorEl) {
      return
    }
    const updatePosition = () => {
      const rect = anchorEl.getBoundingClientRect()
      const margin = 8
      const width = Math.min(280, window.innerWidth - margin * 2)
      let left = rect.left
      if (left + width > window.innerWidth - margin) {
        left = window.innerWidth - width - margin
      }
      left = Math.max(margin, left)
      setPosition({
        position: 'fixed',
        bottom: window.innerHeight - rect.top + margin,
        left,
        width,
        zIndex: 10050,
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, anchorRef, troveIds.length])

  useEffect(() => {
    if (!open) {
      return
    }
    const anchorEl = anchorRef.current
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (popoverRef.current?.contains(target)) {
        return
      }
      if (anchorEl?.contains(target)) {
        return
      }
      onClose()
    }
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open, onClose, anchorRef])

  if (!open || troveIds.length === 0 || typeof document === 'undefined') {
    return null
  }

  const content = (
    <div
      ref={popoverRef}
      className="troves-stale-popover"
      style={position}
      role="dialog"
      aria-modal="false"
      aria-label="Updated troves"
    >
      <ul className="troves-stale-popover-list">
        {troveIds.map((id) => (
          <li key={id} className="troves-stale-popover-item">
            {id}
          </li>
        ))}
      </ul>
    </div>
  )

  return createPortal(content, document.body)
}
