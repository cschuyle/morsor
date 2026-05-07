import { useEffect, useState } from 'react'

export function useCopyFeedback(timeoutMs = 1900) {
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!message) {
      return
    }
    const timer = window.setTimeout(() => {
      setMessage(null)
    }, timeoutMs)
    return () => window.clearTimeout(timer)
  }, [message, timeoutMs])

  return {
    copyFeedbackMessage: message,
    showCopyFeedback: setMessage,
  }
}

export function CopyFeedbackFlare({ message }: { message: string | null }) {
  if (!message) {
    return null
  }

  return (
    <div className="copy-feedback-flare" role="status" aria-live="polite">
      <span className="copy-feedback-flare__check" aria-hidden="true">
        <svg viewBox="0 0 20 20" width="14" height="14" focusable="false">
          <path
            d="M5 10.2 8.2 13.5 15.2 6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="copy-feedback-flare__text">{message}</span>
    </div>
  )
}