import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'

// Surface every uncaught error in the console: the desktop shell forwards
// console errors to ~/.reqly/desktop.log, so blank-page reports come with a
// stack trace instead of a screenshot.
window.addEventListener('error', e => {
  console.error(`[reqly-ui] Uncaught error: ${e.error?.stack ?? e.message}`)
})
window.addEventListener('unhandledrejection', e => {
  const reason = e.reason instanceof Error ? e.reason.stack ?? e.reason.message : String(e.reason)
  console.error(`[reqly-ui] Unhandled rejection: ${reason}`)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
