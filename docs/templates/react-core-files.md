# React Core File Templates

## src/api/axios.js — Full Code
```javascript
import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { useUiStore } from '../store/uiStore'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
})

// Request Interceptor — Token (tenant is resolved server-side from the Host)
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  config.headers['Accept-Language'] = localStorage.getItem('locale') || 'bn'
  return config
}, (error) => Promise.reject(error))

// Response Interceptor — Error Handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const { addToast, openUpgradeModal } = useUiStore.getState()
    const { clearAuth } = useAuthStore.getState()
    const status = error.response?.status
    const errCode = error.response?.data?.error

    if (!error.response) {
      addToast('ইন্টারনেট সংযোগ পরীক্ষা করুন', 'error')
      return Promise.reject(error)
    }

    switch (status) {
      case 401:
        clearAuth()
        window.location.href = '/login'
        break
      case 403:
        if (errCode === 'subscription_expired') {
          window.location.href = '/subscription/expired'
        } else if (errCode === 'feature_not_available') {
          openUpgradeModal({
            feature: error.response.data?.feature,
            requiredPlan: error.response.data?.upgrade_to,
          })
        } else if (errCode === 'student_limit_reached') {
          addToast('ছাত্র সংখ্যার সীমা শেষ হয়েছে। প্ল্যান আপগ্রেড করুন।', 'warning')
        } else if (errCode === 'account_locked') {
          addToast(error.response.data?.message, 'error')
        } else {
          addToast('এই কাজ করার অনুমতি নেই', 'error')
        }
        break
      case 422:
        // Validation errors — handled by react-hook-form
        break
      case 429:
        addToast('অনেক বেশি অনুরোধ। একটু অপেক্ষা করুন।', 'warning')
        break
      case 500:
        addToast('সার্ভারে সমস্যা হয়েছে। পুনরায় চেষ্টা করুন।', 'error')
        break
      default:
        addToast(error.response.data?.message || 'অপ্রত্যাশিত সমস্যা হয়েছে', 'error')
    }
    return Promise.reject(error)
  }
)

export default api
```

## src/store/authStore.js — Full Code
```javascript
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      role: null,
      isAuthenticated: false,

      setAuth: (token, user) => set({
        token,
        user,
        role: user.role,
        isAuthenticated: true,
      }),

      updateUser: (userData) => set((state) => ({
        user: { ...state.user, ...userData },
      })),

      clearAuth: () => set({
        token: null,
        user: null,
        role: null,
        isAuthenticated: false,
      }),

      hasRole: (role) => {
        const currentRole = get().role
        if (Array.isArray(role)) return role.includes(currentRole)
        return currentRole === role
      },

      isSuperAdmin: () => get().role === 'super_admin',
      isAdmin: ()     => get().role === 'admin',
      isTeacher: ()   => get().role === 'teacher',
      isStudent: ()   => get().role === 'student',
      isParent: ()    => get().role === 'parent',
      isAccountant: ()=> get().role === 'accountant',
    }),
    {
      name: 'auth-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        role: state.role,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
```

## src/store/institutionStore.js — Full Code (Revision 6)
`GET /bootstrap`-এর response এই store-এ থাকে — theme, terminology, module list সবার একমাত্র উৎস। `main.jsx`-এ app render-এর আগে `loadBootstrap()` call করুন; শেষ না হওয়া পর্যন্ত নিরপেক্ষ loader।

```javascript
import { create } from 'zustand'
import api from '../api/axios'

export const useInstitutionStore = create((set, get) => ({
  ready: false,
  isCentral: false,          // true on schoolapp.com / admin.schoolapp.com
  institution: null,         // { id, name, slug, institution_type, status }
  terms: {},                 // { batch: { bn, en }, ... }
  modules: [],               // enabled module keys
  roles: [],
  theme: null,               // effective theme object (docs/THEMING.md)
  plan: null,                // { name, white_label, features }
  settings: {},              // institutions.settings
  academicYear: null,
  locale: localStorage.getItem('locale') || 'bn',

  loadBootstrap: async () => {
    const cacheKey = 'bootstrap-cache:' + window.location.hostname
    const cached = localStorage.getItem(cacheKey)
    if (cached) set({ ...JSON.parse(cached), ready: true })           // instant paint, no theme flash
    const { data } = await api.get('/bootstrap')
    const next = {
      isCentral: data.is_central, institution: data.institution ?? null, terms: data.terms ?? {},
      modules: data.modules ?? [], roles: data.roles ?? [], theme: data.theme,
      plan: data.plan ?? null, settings: data.settings ?? {},
    }
    localStorage.setItem(cacheKey, JSON.stringify(next))
    set({ ...next, ready: true })
  },

  setInstitution: (institution) => set({ institution }),   // used by Login.jsx after login
  setAcademicYear: (year) => set({ academicYear: year }),
  setLocale: (locale) => { localStorage.setItem('locale', locale); set({ locale }) },

  hasModule:  (key)  => get().modules.includes(key),
  hasFeature: (flag) => Boolean(get().plan?.features?.[flag]),
}))
```
`useModules()` hook: `const has = useInstitutionStore(s => s.hasModule); return { has }`। পুরনো `planFeatures` আর নেই — plan feature দেখতে `hasFeature()`, module দেখতে `hasModule()`। Store আর `persist` ব্যবহার করে না; `/bootstrap`-ই উৎস।

## src/store/uiStore.js — Full Code
```javascript
import { create } from 'zustand'

let toastId = 0

export const useUiStore = create((set) => ({
  sidebarOpen: true,
  sidebarCollapsed: false,
  toasts: [],
  confirmModal: null,
  upgradeModal: null,
  pageLoading: false,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  collapseSidebar: (val) => set({ sidebarCollapsed: val }),
  setPageLoading: (val) => set({ pageLoading: val }),

  addToast: (message, type = 'success', duration = 4000) => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts, { id, message, type, duration }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, duration)
  },

  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  openConfirm: (config) => set({ confirmModal: config }),
  closeConfirm: () => set({ confirmModal: null }),

  openUpgradeModal: (config) => set({ upgradeModal: config }),
  closeUpgradeModal: () => set({ upgradeModal: null }),
}))
```

## src/router/ProtectedRoute.jsx — Full Code
```jsx
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const ROLE_HOME = {
  super_admin: '/super-admin/dashboard',
  admin:       '/admin/dashboard',
  teacher:     '/teacher/dashboard',
  student:     '/student/dashboard',
  parent:      '/parent/dashboard',
  accountant:  '/accountant/dashboard',
}

export default function ProtectedRoute({ children, role }) {
  const { isAuthenticated, role: userRole } = useAuthStore()
  const location = useLocation()

  // Not logged in → /login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Role mismatch → redirect to own dashboard
  if (role) {
    const allowed = Array.isArray(role) ? role : [role]
    if (!allowed.includes(userRole)) {
      return <Navigate to={ROLE_HOME[userRole] || '/login'} replace />
    }
  }

  return children
}
```

## src/router/index.jsx — Full Code (Revision 6 changes)
দুটি পরিবর্তন: (১) ছয়টি role layout বাদ — প্রতিটি role-এর parent element এখন একই `<AppShell/>` (`docs/THEMING.md`); (২) router host অনুযায়ী দুই ভাগ: `useInstitutionStore.isCentral` হলে শুধু central route (`/`, `/signup`, `/login`, `/super-admin/*`), নইলে tenant route (`/login`, `/forgot-password`, `/admin/*`, `/teacher/*`, `/student/*`, `/parent/*`, `/accountant/*`, `/onboarding`)। `main.jsx`-এ `await loadBootstrap()`-এর পর `isCentral ? centralRouter : tenantRouter` বেছে নিন; নিচের কোড tenant ভাগের কাঠামো, central ভাগ একই প্যাটার্নে।
```jsx
import { createBrowserRouter } from 'react-router-dom'
import ProtectedRoute from './ProtectedRoute'

// Layouts
import AuthLayout         from '../layouts/AuthLayout'
import AppShell           from '../layouts/AppShell'      // Revision 6: ONE shell for every role; layout is resolved inside AppShell

// Auth Pages
import Login           from '../pages/auth/Login'
import ForgotPassword  from '../pages/auth/ForgotPassword'
import ResetPassword   from '../pages/auth/ResetPassword'
import ChangePassword  from '../pages/auth/ChangePassword'

// Super Admin Pages (lazy loaded)
import { lazy, Suspense } from 'react'
const SADashboard   = lazy(() => import('../pages/super-admin/Dashboard'))
const SAInstitutions     = lazy(() => import('../pages/super-admin/Institutions'))
const SAInstitutionDetail= lazy(() => import('../pages/super-admin/InstitutionDetail'))
const SAPlans       = lazy(() => import('../pages/super-admin/Plans'))
const SABilling     = lazy(() => import('../pages/super-admin/Billing'))
const SASettings    = lazy(() => import('../pages/super-admin/Settings'))
const SAReports     = lazy(() => import('../pages/super-admin/Reports'))

// Admin Pages
const AdminDashboard    = lazy(() => import('../pages/admin/Dashboard'))
const StudentList       = lazy(() => import('../pages/admin/students/StudentList'))
const StudentAdd        = lazy(() => import('../pages/admin/students/StudentAdd'))
const StudentProfile    = lazy(() => import('../pages/admin/students/StudentProfile'))
const TeacherList       = lazy(() => import('../pages/admin/teachers/TeacherList'))
const Programs          = lazy(() => import('../pages/admin/academic/Programs'))
const Subjects          = lazy(() => import('../pages/admin/academic/Subjects'))
const Routine           = lazy(() => import('../pages/admin/academic/Routine'))
const ExamList          = lazy(() => import('../pages/admin/exam/ExamList'))
const MarkEntry         = lazy(() => import('../pages/admin/exam/MarkEntry'))
const FeeCollect        = lazy(() => import('../pages/admin/fees/FeeCollect'))
const DueList           = lazy(() => import('../pages/admin/fees/DueList'))
const Attendance        = lazy(() => import('../pages/admin/Attendance'))
const Notices           = lazy(() => import('../pages/admin/Notices'))
const AdminReports      = lazy(() => import('../pages/admin/Reports'))
const AdminSettings     = lazy(() => import('../pages/admin/Settings'))

const Loader = () => <div className="flex h-screen items-center justify-center">লোড হচ্ছে...</div>
const S = (C) => <Suspense fallback={<Loader/>}><C/></Suspense>

export const router = createBrowserRouter([
  // Auth
  {
    element: <AuthLayout/>,
    children: [
      { path: '/login',          element: <Login/> },
      { path: '/forgot-password',element: <ForgotPassword/> },
      { path: '/reset-password', element: <ResetPassword/> },
      { path: '/change-password',element: <ChangePassword/> },
    ]
  },

  // Super Admin
  {
    path: '/super-admin',
    element: <ProtectedRoute role="super_admin"><AppShell/></ProtectedRoute>,
    children: [
      { path: 'dashboard',       element: S(SADashboard) },
      { path: 'institutions',         element: S(SAInstitutions) },
      { path: 'institutions/:id',     element: S(SAInstitutionDetail) },
      { path: 'plans',           element: S(SAPlans) },
      { path: 'billing',         element: S(SABilling) },
      { path: 'settings',        element: S(SASettings) },
      { path: 'reports',         element: S(SAReports) },
    ]
  },

  // Admin
  {
    path: '/admin',
    element: <ProtectedRoute role="admin"><AppShell/></ProtectedRoute>,
    children: [
      { path: 'dashboard',           element: S(AdminDashboard) },
      { path: 'students',            element: S(StudentList) },
      { path: 'students/add',        element: S(StudentAdd) },
      { path: 'students/:id',        element: S(StudentProfile) },
      { path: 'teachers',            element: S(TeacherList) },
      { path: 'academic/programs',    element: S(Programs) },
      { path: 'academic/subjects',   element: S(Subjects) },
      { path: 'academic/routine',    element: S(Routine) },
      { path: 'exams',               element: S(ExamList) },
      { path: 'exams/:id/marks',     element: S(MarkEntry) },
      { path: 'fees/collect',        element: S(FeeCollect) },
      { path: 'fees/dues',           element: S(DueList) },
      { path: 'attendance',          element: S(Attendance) },
      { path: 'notices',             element: S(Notices) },
      { path: 'reports',             element: S(AdminReports) },
      { path: 'settings',            element: S(AdminSettings) },
    ]
  },

  // Teacher
  {
    path: '/teacher',
    element: <ProtectedRoute role="teacher"><AppShell/></ProtectedRoute>,
    children: [
      { path: 'dashboard',     element: S(lazy(() => import('../pages/teacher/Dashboard'))) },
      { path: 'attendance',    element: S(lazy(() => import('../pages/teacher/Attendance'))) },
      { path: 'marks',         element: S(lazy(() => import('../pages/teacher/MarkEntry'))) },
      { path: 'homework',      element: S(lazy(() => import('../pages/teacher/Homework'))) },
      { path: 'materials',     element: S(lazy(() => import('../pages/teacher/Materials'))) },
      { path: 'messages',      element: S(lazy(() => import('../pages/teacher/Messages'))) },
    ]
  },

  // Student
  {
    path: '/student',
    element: <ProtectedRoute role="student"><AppShell/></ProtectedRoute>,
    children: [
      { path: 'dashboard',  element: S(lazy(() => import('../pages/student/Dashboard'))) },
      { path: 'results',    element: S(lazy(() => import('../pages/student/Results'))) },
      { path: 'fees',       element: S(lazy(() => import('../pages/student/Fees'))) },
      { path: 'routine',    element: S(lazy(() => import('../pages/student/Routine'))) },
      { path: 'attendance', element: S(lazy(() => import('../pages/student/Attendance'))) },
      { path: 'materials',  element: S(lazy(() => import('../pages/student/Materials'))) },
      { path: 'notices',    element: S(lazy(() => import('../pages/student/Notices'))) },
    ]
  },

  // Parent
  {
    path: '/parent',
    element: <ProtectedRoute role="parent"><AppShell/></ProtectedRoute>,
    children: [
      { path: 'dashboard',      element: S(lazy(() => import('../pages/parent/Dashboard'))) },
      { path: 'child/:id',      element: S(lazy(() => import('../pages/parent/ChildMonitor'))) },
      { path: 'fees',           element: S(lazy(() => import('../pages/parent/Fees'))) },
      { path: 'messages',       element: S(lazy(() => import('../pages/parent/Messages'))) },
      { path: 'notices',        element: S(lazy(() => import('../pages/parent/Notices'))) },
      { path: 'transport',      element: S(lazy(() => import('../pages/parent/Transport'))) },
    ]
  },

  // Accountant
  {
    path: '/accountant',
    element: <ProtectedRoute role="accountant"><AppShell/></ProtectedRoute>,
    children: [
      { path: 'dashboard',       element: S(lazy(() => import('../pages/accountant/Dashboard'))) },
      { path: 'fee-collection',  element: S(lazy(() => import('../pages/accountant/FeeCollection'))) },
      { path: 'dues',            element: S(lazy(() => import('../pages/accountant/DueList'))) },
      { path: 'expenses',        element: S(lazy(() => import('../pages/accountant/Expenses'))) },
      { path: 'salary',          element: S(lazy(() => import('../pages/accountant/Salary'))) },
      { path: 'reports',         element: S(lazy(() => import('../pages/accountant/Reports'))) },
    ]
  },

  // Fallback
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '*', element: <Navigate to="/login" replace /> },
])
```
