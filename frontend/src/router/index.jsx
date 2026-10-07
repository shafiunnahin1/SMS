import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'
import AppShell from '../layouts/AppShell'
import Login from '../pages/auth/Login'
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
const Landing     = lazy(() => import('../pages/central/Landing'))
const Signup      = lazy(() => import('../pages/central/Signup'))

const S = (C) => <Suspense fallback={<Loader type="page" />}><C /></Suspense>
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
  { path: '/login', element: <Login /> },
  area('/admin', 'admin', [
    { path: 'dashboard', element: S(Dashboard) },
    { path: 'students', element: S(StudentList) },
    { path: 'students/add', element: S(StudentAdd) },
    { path: 'fees/collect', element: S(FeeCollect) },
    { path: 'attendance', element: S(Attendance) },
  ]),
  area('/accountant', 'accountant', [
    { path: 'dashboard', element: S(Dashboard) },
    { path: 'fees/collect', element: S(FeeCollect) },
  ]),
  area('/teacher', 'teacher', [{ path: 'dashboard', element: S(Dashboard) }, { path: 'attendance', element: S(Attendance) }]),
  area('/parent', 'parent', [
    { path: 'dashboard', element: S(ParentHome) },
    { path: 'fees', element: S(ParentFees) },
  ]),
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '*', element: <Navigate to="/login" replace /> },
]

// Central host (Step 3.1): landing, signup (Step 5.1 is blocked - placeholder), login, Super Admin (its panel is Phase 5)
export const centralRoutes = [
  { path: '/', element: S(Landing) },
  { path: '/signup', element: S(Signup) },
  { path: '/login', element: <Login /> },
  area('/super-admin', 'super_admin', [{ path: 'dashboard', element: S(Dashboard) }]),
  { path: '*', element: <Navigate to="/login" replace /> },
]

export const makeRouter = (isCentral) => createBrowserRouter(isCentral ? centralRoutes : tenantRoutes)
