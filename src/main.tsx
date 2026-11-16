import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { startPdfWorker } from './lib/pdf'

// Load the PDF engine now, so documents still open if the connection drops later.
startPdfWorker().catch(() => {
  // Retried automatically when a document is opened.
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
