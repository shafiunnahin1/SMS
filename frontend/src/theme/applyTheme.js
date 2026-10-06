import { loadFont } from './fonts'

// Writes the effective theme (docs/THEMING.md "Effective Theme Object") onto <html>. Used by ThemeProvider and, before the first
// render, by main.jsx with the cached theme of this host - so a reload never flashes the default blue (Step 3.2 Done When).
export function applyTheme(theme) {
  if (!theme) return
  const root = document.documentElement
  const t = theme.tokens ?? {}

  root.style.setProperty('--color-primary', theme.primary_color)
  root.style.setProperty('--color-secondary', theme.secondary_color)
  root.style.setProperty('--color-accent', theme.accent_color)
  root.style.setProperty('--color-on-primary', theme.on_primary)

  root.dataset.radius  = t.radius
  root.dataset.density = t.density
  root.dataset.card    = t.card_style
  root.dataset.sidebar = t.sidebar_style
  root.dataset.table   = t.table_style
  root.dataset.font    = t.font_family
  loadFont(t.font_family)

  let userMode = null
  try { userMode = localStorage.getItem('color-mode') } catch { /* storage blocked: institution default */ }
  const mode = userMode ?? theme.theme_mode
  const dark = mode === 'dark' || (mode === 'auto' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  root.classList.toggle('dark', dark)

  if (theme.favicon_url) {
    let link = document.querySelector("link[rel~='icon']")
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
    link.href = theme.favicon_url
  }
  document.querySelector("meta[name='theme-color']")?.setAttribute('content', theme.primary_color)
}
