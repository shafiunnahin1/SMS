import { useTeacherDepartments } from '../hooks/useTeacherDepartments'
import { useTeacherFeatures } from '../hooks/useTeacherFeatures'
import { Suspense, useMemo } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
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
import { useStaffDepartmentStore } from '../store/staffDepartmentStore'
import { StaffDepartmentBar } from '../features/staff/StaffDepartment'

// docs/THEMING.md "layouts/AppShell.jsx": ONE shell for every role; the layout comes from theme.layout_key; pages never know it
export default function AppShell() {
  const user = useAuthStore(s => s.user)
  const location = useLocation()
  const { institution, theme, modules, settings, roles, release, plan } = useInstitutionStore()
  const term = useTerms()
  const { locale } = useLocale()
  const staffKeys = useStaffDepartmentStore(s => s.permissions)   // D169: the staff menu follows the selected department
  const { off: featuresOff } = useTeacherFeatures()                  // D205 PERM.2: a teacher's switched-off features leave the menu
  const { member: teacherInDepartments } = useTeacherDepartments()   // D206 TDM.4

  const narrow = useMediaQuery('(max-width: 1023px)')
  // THEMING.md edge cases: Super Admin (and the D65 writers - no institution theme) always gets the default; students and parents below 1024px always get the app-like tab bar
  const key = PLATFORM_ROLES.includes(user.role) ? DEFAULT_LAYOUT
    : (['student', 'parent'].includes(user.role) && narrow) ? 'mobile-compact' : theme?.layout_key
  const Layout = LAYOUTS[key] ?? LAYOUTS[DEFAULT_LAYOUT]
  const nav = useMemo(
    () => {
      const opts = { modules, settings, roles, release: release?.id, features: plan?.features ?? {}, institutionType: institution?.institution_type, staffKeys, featuresOff }
      const tr = (label) => navLabel(label, locale)
      const base = buildNav(user.role, opts, term, tr)
      // D206 TDM.4: a teacher who is a department member gets the department pages as one more group (the duty keys decide each item)
      if (user.role !== 'teacher' || !teacherInDepartments) return base
      const work = buildNav('institution_staff', opts, term, tr).filter(i => i.path === '/staff/departments' || i.staffKey)
      return [...base, { key: 'department-work', label: tr('বিভাগের কাজ'), icon: 'Building2', children: work }]
    },
    [user.role, modules, settings, roles, release, plan, term, locale, staffKeys, featuresOff, teacherInDepartments],
  )

  return (
    <Suspense fallback={<Loader type="page" fullScreen />}>
      <Layout nav={nav} user={user} institution={institution} theme={theme}>
        {(user.role === 'institution_staff' || (teacherInDepartments && location.pathname.startsWith('/staff/'))) && <StaffDepartmentBar />}
        <Suspense fallback={<Loader type="page" />}><Outlet /></Suspense>
      </Layout>
    </Suspense>
  )
}
