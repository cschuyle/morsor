import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import AboutContent from './AboutContent'
import { getApiAuthHeaders } from './apiAuth'
import { Trove } from './types'
import { performLogout } from './performLogout'
import { APP_VERSION } from './version'
import './App.css'
import './MobileApp.css'

export default function MobileAbout() {
  const [uploadTimestamp, setUploadTimestamp] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/troves', { credentials: 'include', headers: { ...getApiAuthHeaders() } })
      .then((res) => {
        if (res.status === 401) { window.location.href = '/login'; return Promise.reject() }
        return res.ok ? res.json() : Promise.resolve(null)
      })
      .then((troves: Trove[]) => {
        if (!Array.isArray(troves) || troves.length === 0) {
          setUploadTimestamp(null)
          return
        }
        // Find the most recent uploadTimestamp among all troves
        const timestamps = troves
          .filter((t) => t.uploadTimestamp)
          .map((t) => t.uploadTimestamp)
          .sort()
          .reverse()
        const mostRecent = timestamps.length > 0 ? timestamps[0] : null
        setUploadTimestamp(mostRecent)
      })
      .catch(() => setUploadTimestamp(null))
  }, [])

  return (
    <div className="mobile-app">
      <svg className="about-viewport-border-svg" aria-hidden="true">
        <defs>
          <filter id="about-frame-fade" x="-0.05" y="-0.05" width="1.1" height="1.1">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.003" />
          </filter>
          <mask id="about-frame-mask" maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox">
            <rect width="1" height="1" fill="white" />
            <rect x="0.015" y="0.015" width="0.97" height="0.97" rx="0.01" ry="0.01" fill="black" filter="url(#about-frame-fade)" />
          </mask>
        </defs>
      </svg>
      <div className="about-viewport-border" aria-hidden="true" />
      <main className="mobile-main mobile-about-main">
        <div className="about-page">
          <article className="about-content">
            <AboutContent uploadTimestamp={uploadTimestamp} />
          </article>
        </div>
      </main>
      <footer className="mobile-footer">
        <div className="mobile-footer-row">
          <Link to="/mobile" className="mobile-footer-link">← Back</Link>
          <span className="mobile-footer-version">v{APP_VERSION}</span>
        </div>
        <div className="mobile-footer-row">
          <Link to="/" className="mobile-footer-link" onClick={() => sessionStorage.setItem('morsorPreferDesktop', 'true')}>Desktop</Link>
          <span className="mobile-footer-sep" aria-hidden="true">·</span>
          <Link to="/history" className="mobile-footer-link">History</Link>
          <button
            type="button"
            className="mobile-footer-link mobile-footer-logout-btn"
            onClick={() => {
              performLogout()
                .then(() => { window.location.href = '/login' })
                .catch(() => { window.alert('Logout failed. Please try again.') })
            }}
          >
            Logout
          </button>
        </div>
      </footer>
    </div>
  )
}
