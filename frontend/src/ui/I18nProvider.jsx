import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import i18n from '../i18n'
import { LOCALES } from '../i18n/locales'
import { useAuthStore } from '../store/authStore'
import { useInstitutionStore } from '../store/institutionStore'
import api from '../api/axios'
import { loadFont } from '../theme/fonts'

// docs/I18N.md section 3.1: one source for lang + dir. Order (decision D53): the user's own locale -> the remembered choice ->
// the institution's default -> bn. The browser's language is NOT used (an English desktop browser must not switch a Bangla institution).
// eslint-disable-next-line react-refresh/only-export-components
export const resolveLocale = ({ user, remembered, institutionDefault, enabled = ['bn'] }) =>
  [user, remembered, institutionDefault].find(l => l && enabled.includes(l)) ?? 'bn'

const LocaleCtx = createContext({ locale: 'bn', dir: 'ltr', setLocale: () => {}, enabled: ['bn'] })
const remembered = () => { try { return localStorage.getItem('locale') } catch { return null } }

export function I18nProvider({ children }) {
  const { default: def = 'bn', enabled = ['bn'] } = useInstitutionStore(s => s.locales) ?? {}
  const userLocale = useAuthStore(s => s.user?.locale)
  const [chosen, setChosen] = useState(remembered)
  const locale = resolveLocale({ user: userLocale, remembered: chosen, institutionDefault: def, enabled })

  useEffect(() => {
    i18n.changeLanguage(locale)
    const root = document.documentElement
    root.lang = locale
    root.dir = LOCALES[locale]?.dir ?? 'ltr'
    root.dataset.locale = locale
    if (locale === 'ar') loadFont('noto-sans-arabic')               // I18N.md 4.4: Arabic needs an Arabic font first in the stack
  }, [locale])

  const setLocale = useCallback((l) => {
    try { localStorage.setItem('locale', l) } catch { /* remembered for this tab only */ }
    setChosen(l)
    if (useAuthStore.getState().isAuthenticated) {
      useAuthStore.getState().updateUser({ locale: l })            // the user's own locale wins (D53), so it must follow the switch
      api.put('/auth/locale', { locale: l }).catch(() => {})
    }
  }, [])

  const value = useMemo(() => ({ locale, dir: LOCALES[locale]?.dir ?? 'ltr', setLocale, enabled }), [locale, setLocale, enabled])
  return <LocaleCtx.Provider value={value}>{children}</LocaleCtx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useLocale = () => useContext(LocaleCtx)
