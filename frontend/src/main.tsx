import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import './index.css'
import App from './App'
import About from './About'
import MobileApp from './MobileApp'
import MobileAbout from './MobileAbout'
import Login from './Login'
import { RequireAuth } from './RequireAuth'

function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.innerWidth > 0 && window.innerWidth < 768)
}

const PREFER_DESKTOP_KEY = 'morsorPreferDesktop'

function getPreferDesktop(): boolean {
  try {
    return sessionStorage.getItem(PREFER_DESKTOP_KEY) === 'true'
  } catch {
    return false
  }
}

function RootOrRedirect() {
  const location = useLocation()
  const [mobile, setMobile] = useState<boolean | null>(null)
  const [preferDesktop, setPreferDesktop] = useState(getPreferDesktop)
  useEffect(() => {
    setMobile(isMobileDevice())
    setPreferDesktop(getPreferDesktop())
  }, [])
  if (mobile === null) return null
  if (mobile && !preferDesktop) return <Navigate to={`/mobile${location.search}`} replace />
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<RequireAuth><RootOrRedirect /></RequireAuth>} />
        <Route path="/about" element={<RequireAuth><About /></RequireAuth>} />
        <Route path="/login" element={<Login />} />
        <Route path="/mobile" element={<RequireAuth><MobileApp /></RequireAuth>} />
        <Route path="/mobile/about" element={<RequireAuth><MobileAbout /></RequireAuth>} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
