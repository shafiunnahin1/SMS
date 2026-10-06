import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import i18n from '../i18n'
import { LOCALES } from '../i18n/locales'
import { useAuthStore } from '../store/authStore'
import { useInstitutionStore } from '../store/institutionStore'
import api from '../api/axios'

// docs/I18N.md section 3.1: one source for lang + dir. Order: the user's own locale -> the remembered choice -> browser -> institution default -> bn
const LocaleCtx = createContext({ locale: 'bn', dir: 'ltr', setLocale: () => {}, enabled: ['bn'] })
const remembered = () => { try { return localStorage.getItem('locale') } catch { return null } }

export function I18nProvider({ children }) {
  const { default: def = 'bn', enabled = ['bn'] } = useInstitutionStore(s => s.locales) ?? {}
  const userLocale = useAuthStore(s => s.user?.locale)
  const [chosen, setChosen] = useState(remembered)
  const locale = [chosen, userLocale, navigator.language?.slice(0, 2), def].find(l => l && enabled.includes(l)) ?? 'bn'

  useEffect(() => {
    i18n.changeLanguage(locale)
    const root = document.documentElement
    root.lang = locale
    root.dir = LOCALES[locale]?.dir ?? 'ltr'
    root.dataset.locale = locale
  }, [locale])

  const setLocale = useCallback((l) => {
    try { localStorage.setItem('locale', l) } catch { /* remembered for this tab only */ }
    setChosen(l)
    if (useAuthStore.getState().isAuthenticated) api.put('/auth/locale', { locale: l }).catch(() => {})
  }, [])

  const value = useMemo(() => ({ locale, dir: LOCALES[locale]?.dir ?? 'ltr', setLocale, enabled }), [locale, setLocale, enabled])
  return <LocaleCtx.Provider value={value}>{children}</LocaleCtx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useLocale = () => useContext(LocaleCtx)
