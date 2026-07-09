import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import './SearchQueryHelpPopover.css'

export type SearchQueryHelpMode = 'search' | 'duplicates' | 'uniques'

type SearchExample = {
  title: string
  hint: string
  query: string
}

const SEARCH_EXAMPLES: SearchExample[] = [
  {
    title: 'Plain search',
    hint: 'Fuzzy match on title, snippet, and extra fields. All terms must match.',
    query: 'Greek prince',
  },
  {
    title: 'Prefix',
    hint: 'A term ending in * matches titles and text that start with that prefix.',
    query: 'prince*',
  },
  {
    title: 'Regex',
    hint: 'Wrap a pattern in slashes to match the full title and snippet.',
    query: '/alien.*1979/',
  },
  {
    title: 'Field filter',
    hint: 'Filter by a built-in or extra field. Unknown field names are rejected.',
    query: 'title:Tears',
  },
  {
    title: 'Combine',
    hint: 'Mix field filters with free text in one query.',
    query: 'title:Tears subtitles:ru',
  },
  {
    title: 'Count',
    hint: 'Numeric extra-field filter (movies trove).',
    query: 'COUNT(subtitles):3',
  },
  {
    title: 'Everything',
    hint: 'All items in the troves you have selected.',
    query: '*',
  },
]

const COMPARE_EXAMPLES: SearchExample[] = [
  {
    title: 'Plain search',
    hint: 'Optional text filter on titles in the compare result.',
    query: 'Alien',
  },
  {
    title: 'Everything',
    hint: 'Compare all items (subject to trove selection).',
    query: '*',
  },
]

function examplesForMode(mode: SearchQueryHelpMode): SearchExample[] {
  return mode === 'search' ? SEARCH_EXAMPLES : COMPARE_EXAMPLES
}

function modeTitle(mode: SearchQueryHelpMode): string {
  if (mode === 'duplicates') {
    return 'Find duplicates tips'
  }
  if (mode === 'uniques') {
    return 'Find uniques tips'
  }
  return 'Search tips'
}

export type SearchQueryHelpPopoverProps = {
  open: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  mode: SearchQueryHelpMode
  onTryExample: (query: string) => void
}

export function SearchQueryHelpPopover({
  open,
  onClose,
  anchorRef,
  mode,
  onTryExample,
}: SearchQueryHelpPopoverProps) {
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
      const width = Math.min(360, window.innerWidth - margin * 2)
      let left = rect.left
      if (left + width > window.innerWidth - margin) {
        left = window.innerWidth - width - margin
      }
      left = Math.max(margin, left)
      setPosition({
        position: 'fixed',
        top: rect.bottom + margin,
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
  }, [open, anchorRef])

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

  if (!open || typeof document === 'undefined') {
    return null
  }

  const examples = examplesForMode(mode)

  const content = (
    <div
      ref={popoverRef}
      className="search-query-help-popover"
      style={position}
      role="dialog"
      aria-modal="false"
      aria-labelledby="search-query-help-title"
    >
      <div className="search-query-help-popover-header">
        <h2 id="search-query-help-title" className="search-query-help-popover-title">
          {modeTitle(mode)}
        </h2>
        <button type="button" className="search-query-help-popover-close" onClick={onClose} aria-label="Close search tips">
          ×
        </button>
      </div>
      <ul className="search-query-help-popover-list">
        {examples.map((ex) => (
          <li key={ex.title} className="search-query-help-popover-item">
            <div className="search-query-help-popover-item-title">{ex.title}</div>
            <p className="search-query-help-popover-item-hint">{ex.hint}</p>
            <button
              type="button"
              className="search-query-help-popover-example"
              onClick={() => onTryExample(ex.query)}
            >
              {ex.query}
            </button>
          </li>
        ))}
      </ul>
      {mode === 'search' && (
        <p className="search-query-help-popover-footnote">
          URLs with <code>://</code> are not treated as field filters. Extra fields vary by trove — use the extra-fields picker to add columns.
        </p>
      )}
    </div>
  )

  return createPortal(content, document.body)
}

export type SearchQueryHelpButtonProps = {
  open: boolean
  onToggle: () => void
  className?: string
  title?: string
}

/** Question-mark trigger styled like the search-bar * button. */
export function SearchQueryHelpButton({ open, onToggle, className = 'search-query-btn', title = 'Search tips' }: SearchQueryHelpButtonProps) {
  return (
    <button
      type="button"
      className={`${className} search-query-help-btn${open ? ' search-query-help-btn--open' : ''}`}
      onClick={onToggle}
      title={title}
      aria-label={title}
      aria-expanded={open}
      aria-haspopup="dialog"
    >
      <span className="search-query-help-btn-glyph" aria-hidden="true">
        ?
      </span>
    </button>
  )
}
