import { Suspense, useMemo } from 'react'
import { Outlet } from 'react-router-dom'
import { LAYOUTS, DEFAULT_LAYOUT } from './registry'
import { buildNav } from '../nav/menu'
import { navLabel } from '../i18n'
import { useAuthStore } from '../store/authStore'
import { useInstitutionStore } from '../store/institutionStore'
import { useTerms } from '../hooks/useTerms'
import { useLocale } from '../ui/I18nProvider'
import Loader from '../components/Loader'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { PLATFORM_ROLES } from '../router/roleHome'

// docs/THEMING.md "layouts/AppShell.jsx": ONE shell for every role; the layout comes from theme.layout_key; pages never know it
export default function AppShell() {
  const user = useAuthStore(s => s.user)
  const { institution, theme, modules, settings, roles, release, plan } = useInstitutionStore()
  const term = useTerms()
  const { locale } = useLocale()

  const narrow = useMediaQuery('(max-width: 1023px)')
  // THEMING.md edge cases: Super Admin (and the D65 writers - no institution theme) always gets the default; students and parents below 1024px always get the app-like tab bar
  const key = PLATFORM_ROLES.includes(user.role) ? DEFAULT_LAYOUT
    : (['student', 'parent'].includes(user.role) && narrow) ? 'mobile-compact' : theme?.layout_key
  const Layout = LAYOUTS[key] ?? LAYOUTS[DEFAULT_LAYOUT]
  const nav = useMemo(
    () => buildNav(user.role, { modules, settings, roles, release: release?.id, features: plan?.features ?? {} }, term, (label) => navLabel(label, locale)),
    [user.role, modules, settings, roles, release, plan, term, locale],
  )

  return (
    <Suspense fallback={<Loader type="page" fullScreen />}>
      <Layout nav={nav} user={user} institution={institution} theme={theme}>
        <Suspense fallback={<Loader type="page" />}><Outlet /></Suspense>
      </Layout>
    </Suspense>
  )
}
