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
const FeeCategories = lazy(() => import('../pages/admin/fees/FeeCategories'))
const FeeLedger   = lazy(() => import('../pages/admin/fees/FeeLedger'))
const ExamList    = lazy(() => import('../pages/admin/exams/ExamList'))
const ExamDetail  = lazy(() => import('../pages/admin/exams/ExamDetail'))
const MarksEntry  = lazy(() => import('../pages/exams/MarksEntry'))
const MyMarks     = lazy(() => import('../pages/teacher/MyMarks'))
const ParentResults = lazy(() => import('../pages/parent/Results'))
const SmsCenter   = lazy(() => import('../pages/admin/sms/SmsCenter'))
const SmsSettings = lazy(() => import('../pages/admin/settings/SmsSettings'))
const Reports     = lazy(() => import('../pages/reports/Reports'))
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
const LegalPage   = lazy(() => import('../pages/legal/LegalPage'))
const Signup      = lazy(() => import('../pages/central/Signup'))
const Institutions      = lazy(() => import('../pages/super/Institutions'))
const InstitutionDetail = lazy(() => import('../pages/super/InstitutionDetail'))
const PlatformSettings  = lazy(() => import('../pages/super/PlatformSettings'))
const QbCurriculum      = lazy(() => import('../pages/super/QbCurriculum'))
const QbWriters         = lazy(() => import('../pages/super/QbWriters'))
const QbPricing         = lazy(() => import('../pages/super/QbPricing'))
const QbQuestions       = lazy(() => import('../pages/writer/QbQuestions'))
const QbQuestionEdit    = lazy(() => import('../pages/writer/QbQuestionEdit'))
const QbContentList     = lazy(() => import('../pages/writer/QbContentList'))
const QbConceptEdit     = lazy(() => import('../pages/writer/QbConceptEdit'))
const QbResourceEdit    = lazy(() => import('../pages/writer/QbResourceEdit'))
const QbLibrary         = lazy(() => import('../pages/qb/QbLibrary'))
const DevComponents = import.meta.env.DEV ? lazy(() => import('../pages/dev/Components')) : null   // not in production builds

const S = (C) => <Suspense fallback={<Loader type="page" />}><C /></Suspense>
// Step 3.5: the auth pages exist on both hosts; /change-password needs a login (any role)
const authRoutes = [
  { path: '/login', element: <Login /> },
  { path: '/forgot-password', element: S(ForgotPassword) },
  { path: '/reset-password', element: S(ResetPassword) },
  { path: '/change-password', element: <ProtectedRoute>{S(ChangePassword)}</ProtectedRoute> },
  // Step 8.1 (D27): the privacy policy and the terms, on every host, no login
  { path: '/privacy', element: <Suspense fallback={<Loader type="page" />}><LegalPage doc="privacy" /></Suspense> },
  { path: '/terms', element: <Suspense fallback={<Loader type="page" />}><LegalPage doc="terms" /></Suspense> },
]
// MenuReleaseTest: every menu item a role can see in this release has a route of its own - a built page or, until its step, NotBuilt.
// The paths come from nav/menu.js so a new menu entry cannot silently 404.
const menuPaths = (role, prefix) => [].concat(role).flatMap(r => MENU[r] ?? []).flatMap(i => i.children ?? [i]).map(i => i.path).filter(p => p?.startsWith(prefix + '/'))
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
    { path: 'question-bank', element: S(QbLibrary) },   // QB.5 (D65): concepts and resources
    { path: 'dashboard', element: S(Dashboard) },
    { path: 'students', element: S(StudentList) },
    { path: 'students/add', element: S(StudentAdd) },
    { path: 'students/:id', element: S(StudentProfile) },
    { path: 'settings/imports', element: S(Imports) },
    { path: 'fees/collect', element: S(FeeCollect) },
    { path: 'fees/categories', element: S(FeeCategories) },
    { path: 'fees/dues', element: S(FeeLedger) },
    { path: 'sms', element: S(SmsCenter) },
    { path: 'settings/sms', element: S(SmsSettings) },
    { path: 'reports', element: S(Reports) },
    { path: 'exams', element: S(ExamList) },
    { path: 'exams/:id', element: S(ExamDetail) },
    { path: 'exams/:examId/entry/:subjectId', element: S(MarksEntry) },
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
    { path: 'fees/dues', element: S(FeeLedger) },
    { path: 'reports', element: S(Reports) },
  ]),
  area('/teacher', 'teacher', [{ path: 'dashboard', element: S(Dashboard) }, { path: 'attendance', element: S(Attendance) }, { path: 'batches', element: S(MyBatches) }, { path: 'marks', element: S(MyMarks) }, { path: 'marks/:examId/:subjectId', element: S(MarksEntry) }, { path: 'question-bank', element: S(QbLibrary) }]),
  area('/parent', 'parent', [
    { path: 'dashboard', element: S(ParentHome) },
    { path: 'fees', element: S(ParentFees) },
    { path: 'attendance', element: S(ParentAttendance) },
    { path: 'results', element: S(ParentResults) },
  ]),
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '*', element: <Navigate to="/login" replace /> },
]

// Central host (Step 3.1): landing, signup (Step 5.1 is blocked - placeholder), login, Super Admin (Step 4.7 dashboard, Step 5.3 panel)
export const centralRoutes = [
  { path: '/', element: S(Landing) },
  { path: '/signup', element: S(Signup) },
  ...authRoutes,
  area('/super-admin', 'super_admin', [
    { path: 'dashboard', element: S(Dashboard) },
    { path: 'institutions', element: S(Institutions) },
    { path: 'institutions/:id', element: S(InstitutionDetail) },
    { path: 'settings', element: S(PlatformSettings) },
    { path: 'qb/curriculum', element: S(QbCurriculum) },
    { path: 'qb/writers', element: S(QbWriters) },
    { path: 'qb/pricing', element: S(QbPricing) },   // QB.6
  ]),
  // D65 QB.2: the question-bank writers' panel (writers, moderators and the Super Admin)
  area('/writer', ['content_writer', 'content_moderator', 'super_admin'], [
    { path: 'questions', element: S(QbQuestions) },
    { path: 'questions/:id', element: S(QbQuestionEdit) },
    { path: 'concepts', element: <Suspense fallback={<Loader type="page" />}><QbContentList kind="concepts" /></Suspense> },   // QB.5
    { path: 'concepts/:id', element: S(QbConceptEdit) },
    { path: 'resources', element: <Suspense fallback={<Loader type="page" />}><QbContentList kind="resources" /></Suspense> },
    { path: 'resources/:id', element: S(QbResourceEdit) },
  ]),
  { path: '*', element: <Navigate to="/login" replace /> },
]

export const makeRouter = (isCentral) => createBrowserRouter(isCentral ? centralRoutes : tenantRoutes)
