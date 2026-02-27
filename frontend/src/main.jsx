import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import About from './About.jsx'
import MobileApp from './MobileApp.jsx'
import MobileAbout from './MobileAbout.jsx'
import Login from './Login.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/about" element={<About />} />
        <Route path="/login" element={<Login />} />
        <Route path="/mobile" element={<MobileApp />} />
        <Route path="/mobile/about" element={<MobileAbout />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
