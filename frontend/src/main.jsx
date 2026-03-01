import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import About from './About.jsx'
import MobileApp from './MobileApp.jsx'
import MobileAbout from './MobileAbout.jsx'
import Login from './Login.jsx'
import { RequireAuth } from './RequireAuth.jsx'

function isMobileDevice() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.innerWidth > 0 && window.innerWidth < 768)
}

const PREFER_DESKTOP_KEY = 'morsorPreferDesktop'

function getPreferDesktop() {
  try {
    return sessionStorage.getItem(PREFER_DESKTOP_KEY) === 'true'
  } catch {
    return false
  }
}

function RootOrRedirect() {
  const location = useLocation()
  const [mobile, setMobile] = useState(null)
  const [preferDesktop, setPreferDesktop] = useState(getPreferDesktop)
  useEffect(() => {
    setMobile(isMobileDevice())
    setPreferDesktop(getPreferDesktop())
  }, [])
  if (mobile === null) return null
  if (mobile && !preferDesktop) return <Navigate to={`/mobile${location.search}`} replace />
  return <App />
}

createRoot(document.getElementById('root')).render(
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
