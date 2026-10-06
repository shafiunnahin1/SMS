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

// docs/THEMING.md "layouts/AppShell.jsx": ONE shell for every role; the layout comes from theme.layout_key; pages never know it
export default function AppShell() {
  const user = useAuthStore(s => s.user)
  const { institution, theme, modules, settings, roles, release, plan } = useInstitutionStore()
  const term = useTerms()
  const { locale } = useLocale()

  const key = user.role === 'super_admin' ? DEFAULT_LAYOUT : theme?.layout_key
  const Layout = LAYOUTS[key] ?? LAYOUTS[DEFAULT_LAYOUT]
  const nav = useMemo(
    () => buildNav(user.role, { modules, settings, roles, release: release?.id, features: plan?.features ?? {} }, term, navLabel),
    // locale: labels are translated when the language changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
