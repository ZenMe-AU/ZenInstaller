import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../corp-src/index.css'
import AccessPassApp from './AccessPassApp.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccessPassApp />
  </StrictMode>,
)
