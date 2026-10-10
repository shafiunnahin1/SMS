import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'
import AppShell from '../layouts/AppShell'
import Login from '../pages/auth/Login'
const ForgotPassword = lazy(() => import('../pages/auth/ForgotPassword'))
const ResetPassword  = lazy(() => import('../pages/auth/ResetPassword'))
const ChangePassword = lazy(() => import('../pages/auth/ChangePassword'))
import Loader from '../components/Loader'
import { MENU } from '../nav/menu'

// docs/templates/react-core-files.md "src/router/index.jsx" (Revision 6): ONE AppShell for every role; the walking skeleton routes the
// slice's pages; every other menu path inside a role opens NotBuilt (never a 404).
const Dashboard   = lazy(() => import('../pages/common/Dashboard'))
const NotBuilt    = lazy(() => import('../pages/common/NotBuilt'))
const StudentList = lazy(() => import('../pages/admin/students/StudentList'))
const StudentAdd  = lazy(() => import('../pages/admin/students/StudentAdd'))
const FeeCollect  = lazy(() => import('../pages/admin/fees/FeeCollect'))
const ParentFees  = lazy(() => import('../pages/parent/Fees'))
const Attendance  = lazy(() => import('../pages/attendance/Take'))
const ParentHome  = lazy(() => import('../pages/parent/Home'))
const ParentAttendance = lazy(() => import('../pages/parent/Attendance'))
const StudentProfile = lazy(() => import('../pages/admin/students/StudentProfile'))
const Imports     = lazy(() => import('../pages/admin/settings/Imports'))
const Programs    = lazy(() => import('../pages/admin/academic/Programs'))
const Subjects    = lazy(() => import('../pages/admin/academic/Subjects'))
const BatchList   = lazy(() => import('../pages/admin/batches/BatchList'))
const BatchDetail = lazy(() => import('../pages/admin/batches/BatchDetail'))
const TeacherList = lazy(() => import('../pages/admin/teachers/TeacherList'))
const MyBatches   = lazy(() => import('../pages/teacher/MyBatches'))
const Landing     = lazy(() => import('../pages/central/Landing'))
const Signup      = lazy(() => import('../pages/central/Signup'))
const DevComponents = import.meta.env.DEV ? lazy(() => import('../pages/dev/Components')) : null   // not in production builds

const S = (C) => <Suspense fallback={<Loader type="page" />}><C /></Suspense>
// Step 3.5: the auth pages exist on both hosts; /change-password needs a login (any role)
const authRoutes = [
  { path: '/login', element: <Login /> },
  { path: '/forgot-password', element: S(ForgotPassword) },
  { path: '/reset-password', element: S(ResetPassword) },
  { path: '/change-password', element: <ProtectedRoute>{S(ChangePassword)}</ProtectedRoute> },
]
// MenuReleaseTest: every menu item a role can see in this release has a route of its own - a built page or, until its step, NotBuilt.
// The paths come from nav/menu.js so a new menu entry cannot silently 404.
const menuPaths = (role, prefix) => (MENU[role] ?? []).flatMap(i => i.children ?? [i]).map(i => i.path).filter(p => p?.startsWith(prefix + '/'))
const area = (path, role, children) => {
  const built = new Set(children.map(c => c.path))
  const placeholders = [...new Set(menuPaths(role, path))].map(p => p.slice(path.length + 1)).filter(p => !built.has(p))
    .map(p => ({ path: p, element: S(NotBuilt) }))
  return {
    path, element: <ProtectedRoute role={role}><AppShell /></ProtectedRoute>,
    children: [...children, ...placeholders, { path: '*', element: S(NotBuilt) }],
  }
}

export const tenantRoutes = [
  ...authRoutes,
  area('/admin', 'admin', [
    { path: 'dashboard', element: S(Dashboard) },
    { path: 'students', element: S(StudentList) },
    { path: 'students/add', element: S(StudentAdd) },
    { path: 'students/:id', element: S(StudentProfile) },
    { path: 'settings/imports', element: S(Imports) },
    { path: 'fees/collect', element: S(FeeCollect) },
    { path: 'attendance', element: S(Attendance) },
    { path: 'academic/programs', element: S(Programs) },
    { path: 'academic/subjects', element: S(Subjects) },
    { path: 'batches', element: S(BatchList) },
    { path: 'batches/:id', element: S(BatchDetail) },
    { path: 'teachers', element: S(TeacherList) },
    // Step 3.4: the component gallery - development builds only (import.meta.env.DEV is false in `vite build`)
    ...(import.meta.env.DEV ? [{ path: 'dev/components', element: S(DevComponents) }] : []),
  ]),
  area('/accountant', 'accountant', [
    { path: 'dashboard', element: S(Dashboard) },
    { path: 'fees/collect', element: S(FeeCollect) },
  ]),
  area('/teacher', 'teacher', [{ path: 'dashboard', element: S(Dashboard) }, { path: 'attendance', element: S(Attendance) }, { path: 'batches', element: S(MyBatches) }]),
  area('/parent', 'parent', [
    { path: 'dashboard', element: S(ParentHome) },
    { path: 'fees', element: S(ParentFees) },
    { path: 'attendance', element: S(ParentAttendance) },
  ]),
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '*', element: <Navigate to="/login" replace /> },
]

// Central host (Step 3.1): landing, signup (Step 5.1 is blocked - placeholder), login, Super Admin (its panel is Phase 5)
export const centralRoutes = [
  { path: '/', element: S(Landing) },
  { path: '/signup', element: S(Signup) },
  ...authRoutes,
  area('/super-admin', 'super_admin', [{ path: 'dashboard', element: S(Dashboard) }]),
  { path: '*', element: <Navigate to="/login" replace /> },
]

export const makeRouter = (isCentral) => createBrowserRouter(isCentral ? centralRoutes : tenantRoutes)
