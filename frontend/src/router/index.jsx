import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'
import AppShell from '../layouts/AppShell'
import Login from '../pages/auth/Login'
import Loader from '../components/Loader'

// docs/templates/react-core-files.md "src/router/index.jsx" (Revision 6): ONE AppShell for every role; the walking skeleton routes the
// slice's pages; every other menu path inside a role opens NotBuilt (never a 404).
const Dashboard   = lazy(() => import('../pages/common/Dashboard'))
const NotBuilt    = lazy(() => import('../pages/common/NotBuilt'))
const StudentList = lazy(() => import('../pages/admin/students/StudentList'))
const StudentAdd  = lazy(() => import('../pages/admin/students/StudentAdd'))
const FeeCollect  = lazy(() => import('../pages/admin/fees/FeeCollect'))
const ParentFees  = lazy(() => import('../pages/parent/Fees'))

const S = (C) => <Suspense fallback={<Loader type="page" />}><C /></Suspense>
const area = (path, role, children) => ({
  path, element: <ProtectedRoute role={role}><AppShell /></ProtectedRoute>,
  children: [...children, { path: '*', element: S(NotBuilt) }],
})

export const tenantRoutes = [
  { path: '/login', element: <Login /> },
  area('/admin', 'admin', [
    { path: 'dashboard', element: S(Dashboard) },
    { path: 'students', element: S(StudentList) },
    { path: 'students/add', element: S(StudentAdd) },
    { path: 'fees/collect', element: S(FeeCollect) },
  ]),
  area('/accountant', 'accountant', [
    { path: 'dashboard', element: S(Dashboard) },
    { path: 'fees/collect', element: S(FeeCollect) },
  ]),
  area('/teacher', 'teacher', [{ path: 'dashboard', element: S(Dashboard) }]),
  area('/parent', 'parent', [
    { path: 'dashboard', element: S(Dashboard) },
    { path: 'fees', element: S(ParentFees) },
  ]),
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '*', element: <Navigate to="/login" replace /> },
]

// Central host (landing, signup, Super Admin): the spike only proves the split; the Super Admin panel is Phase 5
export const centralRoutes = [
  { path: '/login', element: <Login /> },
  area('/super-admin', 'super_admin', [{ path: 'dashboard', element: S(Dashboard) }]),
  { path: '*', element: <Navigate to="/login" replace /> },
]

export const makeRouter = (isCentral) => createBrowserRouter(isCentral ? centralRoutes : tenantRoutes)
