import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Moon } from 'lucide-react'
import { useInstitutionStore } from '../../store/institutionStore'
import { applyTheme } from '../../theme/applyTheme'

export const COLOR_MODE_KEY = 'color-mode'   // docs/THEMING.md: the user's own light / dark choice wins over the institution default

const read = () => { try { return localStorage.getItem(COLOR_MODE_KEY) ?? '' } catch { return '' } }

// D239 DRK.1: light, dark or the institution's setting (''); kept only in this browser; applied at once without a reload
export default function ColorModeSwitch({ className = '' }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState(read)
  const change = (v) => {
    try { if (v) localStorage.setItem(COLOR_MODE_KEY, v); else localStorage.removeItem(COLOR_MODE_KEY) } catch { /* storage blocked: this page only */ }
    setMode(v)
    const theme = useInstitutionStore.getState().theme
    if (theme) applyTheme(theme)
    else document.documentElement.classList.toggle('dark', v === 'dark')
  }
  return (
    <label data-testid="color-mode-switch" className={`inline-flex items-center gap-1 text-sm ${className}`}>
      <Moon aria-hidden="true" className="h-4 w-4" />
      <span className="sr-only">{t('common.color_mode')}</span>
      <select value={mode} onChange={e => change(e.target.value)} className="bg-transparent text-inherit rounded-token h-8 px-1 [border:1px_solid_var(--line)]">
        <option value="" className="text-content bg-surface">{t('common.color_modes.institution')}</option>
        <option value="light" className="text-content bg-surface">{t('common.color_modes.light')}</option>
        <option value="dark" className="text-content bg-surface">{t('common.color_modes.dark')}</option>
      </select>
    </label>
  )
}
