import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../src/index.css'
import AccessPassApp from '../src/AccessPassApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccessPassApp />
  </StrictMode>,
)
