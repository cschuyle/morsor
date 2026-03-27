import { Link } from 'react-router-dom'
import AboutContent from './AboutContent'
import { APP_VERSION } from './version'
import './App.css'

export default function About() {
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
          <AboutContent />
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
