import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App.jsx'
import { applyTheme } from './theme/applyTheme'
import { readCachedBootstrap, useInstitutionStore } from './store/institutionStore'
import { useAuthStore } from './store/authStore'

// docs/THEMING.md: the last theme of this host is painted BEFORE the first render (no default-blue flash), then /bootstrap refreshes it
applyTheme(readCachedBootstrap()?.theme)
useInstitutionStore.getState().loadBootstrap()
useAuthStore.getState().restore()               // D51: is the session cookie still logged in? (a reload keeps the login)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
