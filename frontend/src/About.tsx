import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import AboutContent from './AboutContent'
import { APP_VERSION } from './version'
import { getApiAuthHeaders } from './apiAuth'
import { Trove } from './types'
import './App.css'

export default function About() {
  const [uploadTimestamp, setUploadTimestamp] = useState<string | null>(null)
  const [troves, setTroves] = useState<Trove[]>([])

  useEffect(() => {
    fetch('/api/troves', { credentials: 'include', headers: { ...getApiAuthHeaders() } })
      .then((res) => {
        if (res.status === 401) { window.location.href = '/login'; return Promise.reject() }
        return res.ok ? res.json() : Promise.resolve(null)
      })
      .then((trovesData: Trove[]) => {
        if (!Array.isArray(trovesData) || trovesData.length === 0) {
          setUploadTimestamp(null)
          setTroves([])
          return
        }
        setTroves(trovesData)
        // Find the most recent updateTimestamp among all troves
        const timestamps = trovesData
          .filter((t) => t.updateTimestamp)
          .map((t) => t.updateTimestamp)
          .sort()
          .reverse()
        const mostRecent = timestamps.length > 0 ? timestamps[0] : null
        setUploadTimestamp(mostRecent)
      })
      .catch(() => {
        setUploadTimestamp(null)
        setTroves([])
      })
  }, [])

  return (
    <>
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
      <div className="about-page">
        <article className="about-content">
          <AboutContent uploadTimestamp={uploadTimestamp} troves={troves} />
        </article>
      </div>
      <hr className="backend-status-divider" />
      <footer className="app-footer">
        <span className="app-footer-text">
          GitHub: <a target="_blank" rel="noopener noreferrer" href="https://github.com/cschuyle/morsor">https://github.com/cschuyle/morsor</a>
          {' · '}
          Version {APP_VERSION}
        </span>
        <Link to="/" className="app-footer-link">Go back</Link>
        {' · '}
        <Link to="/history" className="app-footer-link">History</Link>
      </footer>
    </>
  )
}
