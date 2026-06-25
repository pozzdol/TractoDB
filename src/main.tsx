import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// Brand glyphs for PostgreSQL/MySQL (fi-brands-*); SQLite/Redis use bundled SVGs.
import '@flaticon/flaticon-uicons/css/brands/all.css'
import './styles/globals.css'

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element #root not found')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
