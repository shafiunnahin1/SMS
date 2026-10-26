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
// R3.12: the R3 money pages (named exports of one file per area)
const r3 = (file, name) => lazy(() => import(`../pages/r3/${file}.jsx`).then(m => ({ default: m[name] })))
const AccVouchers = r3('Accounting', 'Vouchers'), AccAccounts = r3('Accounting', 'Accounts'), AccBudgets = r3('Accounting', 'Budgets'), AccBank = r3('Accounting', 'Bank'), AccReports = r3('Accounting', 'Reports')
const DonDonors = r3('Donations', 'Donors'), DonFunds = r3('Donations', 'Funds'), DonCampaigns = r3('Donations', 'Campaigns'), DonList = r3('Donations', 'DonationList')
const hr = (name) => r3('Hr', name)
const HrStaff = hr('Staff'), HrComponents = hr('Components'), HrRevisions = hr('Revisions'), HrIncrements = hr('Increments'), HrBonus = hr('Bonus'), HrAdjustments = hr('Adjustments')
const HrAdvances = hr('Advances'), HrPayroll = hr('Payroll'), HrPf = hr('ProvidentFund'), HrLeave = hr('Leave'), HrAttendance = hr('StaffAttendance'), HrReports = hr('HrReports'), MySalary = hr('MySalary')
const StaffAccounts = r3('Staff', 'StaffAccounts'), Departments = r3('Staff', 'Departments'), MyDepartments = r3('Staff', 'MyDepartments'), MyProfile = r3('Staff', 'MyProfile')
const Expenses = r3('Money', 'Expenses'), Refunds = r3('Money', 'Refunds'), Inventory = r3('Money', 'Inventory'), CashBook = r3('Money', 'CashBook')
const StudentList = lazy(() => import('../pages/admin/students/StudentList'))
const StudentAdd  = lazy(() => import('../pages/admin/students/StudentAdd'))
const FeeCollect  = lazy(() => import('../pages/admin/fees/FeeCollect'))
const FeeCategories = lazy(() => import('../pages/admin/fees/FeeCategories'))
const FeeLedger   = lazy(() => import('../pages/admin/fees/FeeLedger'))
const ExamList    = lazy(() => import('../pages/admin/exams/ExamList'))
const ExamDetail  = lazy(() => import('../pages/admin/exams/ExamDetail'))
const ResultsWorkspace = lazy(() => import('../pages/admin/exams/ResultsWorkspace'))
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
const LearnerSignup = lazy(() => import('../pages/central/LearnerSignup'))   // D165 ST.1
const QbPractice = lazy(() => import('../pages/student/QbPractice'))   // D165 ST.4
const LearnerProfile = lazy(() => import('../pages/learner/LearnerProfile'))   // D165 ST.1
const Institutions      = lazy(() => import('../pages/super/Institutions'))
const InstitutionDetail = lazy(() => import('../pages/super/InstitutionDetail'))
const PlatformSettings  = lazy(() => import('../pages/super/PlatformSettings'))
const QbCurriculum      = lazy(() => import('../pages/super/QbCurriculum'))
const QbWriters         = lazy(() => import('../pages/super/QbWriters'))
const QbPricing         = lazy(() => import('../pages/super/QbPricing'))
const QbBlueprints      = lazy(() => import('../pages/super/QbBlueprints'))   // R2.1.5 (D126 (3))
const QbDashboard       = lazy(() => import('../pages/writer/QbDashboard'))   // R2.1.1 (D110)
const QbFinder          = lazy(() => import('../pages/writer/QbFinder'))   // R2.1.2 (D114 (3))
const QbImports         = lazy(() => import('../pages/writer/QbImports'))   // R2.1.3 (D123)
const QbImportReview    = lazy(() => import('../pages/writer/QbImportReview'))
const QbQuestions       = lazy(() => import('../pages/writer/QbQuestions'))
const QbQuestionEdit    = lazy(() => import('../pages/writer/QbQuestionEdit'))
const QbQuestionStart   = lazy(() => import('../pages/writer/QbQuestionStart'))   // D73
const QbContentList     = lazy(() => import('../pages/writer/QbContentList'))
const QbConceptEdit     = lazy(() => import('../pages/writer/QbConceptEdit'))
const QbResourceEdit    = lazy(() => import('../pages/writer/QbResourceEdit'))
const QbLibrary         = lazy(() => import('../pages/qb/QbLibrary'))
const QbSpending        = lazy(() => import('../pages/qb/QbSpending'))
const QbPapers          = lazy(() => import('../pages/qb/QbPapers'))
const QbPaperEdit       = lazy(() => import('../pages/qb/QbPaperEdit'))
const QbOmr             = lazy(() => import('../pages/qb/QbOmr'))
const AiChat            = lazy(() => import('../pages/ai/AiChat'))   // D164 AI-P1.3
const QbExamBatches     = lazy(() => import('../pages/super/QbExamBatches'))   // D165 ST.2
const AiPlatform        = lazy(() => import('../pages/super/AiPlatform'))   // D164 AI-P1.5
const HelpArticles      = lazy(() => import('../pages/ai/HelpArticles'))   // D166 AI-Q4 part 2
const AiReviews         = lazy(() => import('../pages/writer/AiReviews'))   // D164 AI-P1.4
const QbPaperPreview    = lazy(() => import('../pages/qb/QbPaperPreview'))
const QbAllQuestions    = lazy(() => import('../pages/qb/QbAllQuestions'))
const QbStudy           = lazy(() => import('../pages/student/QbStudy'))
const QbStudentQuizzes  = lazy(() => import('../pages/student/QbQuizzes'))
const QbQuizAttempt     = lazy(() => import('../pages/student/QbQuizAttempt'))
const QbQuizAdmin       = lazy(() => import('../pages/super/QbQuizzes'))
const QbPublicQuiz      = lazy(() => import('../pages/public/QbPublicQuiz'))
const QbEarnings        = lazy(() => import('../pages/writer/QbEarnings'))
const QbWithdrawals     = lazy(() => import('../pages/super/QbWithdrawals'))
const DevComponents = import.meta.env.DEV ? lazy(() => import('../pages/dev/Components')) : null   // not in production builds

const S = (C, props) => <Suspense fallback={<Loader type="page" />}><C {...props} /></Suspense>
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
    .map(p => ({ path: p, element: S(NotBuilt), placeholder: true }))
  return {
    path, element: <ProtectedRoute role={role}><AppShell /></ProtectedRoute>,
    children: [...children, ...placeholders, { path: '*', element: S(NotBuilt) }],
  }
}

export const tenantRoutes = [
  ...authRoutes,
  area('/admin', 'admin', [
    { path: 'question-bank', element: S(QbAllQuestions) },   // D133/D134: Question Bank opens on All Questions
    { path: 'ai', element: S(AiChat) },   // D164 AI-P1.3
    { path: 'ai-help', element: S(HelpArticles) },   // D166 AI-Q4 part 2
    { path: 'study-materials', element: S(QbLibrary) },   // D134: concepts and resources
    { path: 'question-bank/spending', element: S(QbSpending) },   // QB.7
    { path: 'question-bank/papers', element: S(QbPapers) },   // QB.8
    { path: 'question-bank/all-questions', element: S(QbAllQuestions) },   // D133: qbank's All Questions
    { path: 'question-bank/papers/:id', element: S(QbPaperEdit) },
    { path: 'question-bank/papers/:id/omr', element: S(QbOmr) },
    { path: 'question-bank/papers/:id/preview', element: S(QbPaperPreview) },   // D133: print preview with the Paper Controller
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
    { path: 'exams/results', element: S(ResultsWorkspace) },
    { path: 'exams/:id', element: S(ExamDetail) },
    { path: 'exams/:examId/entry/:subjectId', element: S(MarksEntry) },
    { path: 'attendance', element: S(Attendance) },
    { path: 'academic/programs', element: S(Programs) },
    { path: 'academic/subjects', element: S(Subjects) },
    { path: 'batches', element: S(BatchList) },
    { path: 'batches/:id', element: S(BatchDetail) },
    { path: 'teachers', element: S(TeacherList) },
    { path: 'fees/cashbook', element: S(CashBook) }, { path: 'fees/refunds', element: S(Refunds) }, { path: 'expenses', element: S(Expenses) }, { path: 'inventory', element: S(Inventory) },
    { path: 'accounting/vouchers', element: S(AccVouchers) }, { path: 'accounting/accounts', element: S(AccAccounts) }, { path: 'accounting/budgets', element: S(AccBudgets) },
    { path: 'accounting/bank', element: S(AccBank) }, { path: 'accounting/reports', element: S(AccReports) },
    { path: 'hr/staff', element: S(HrStaff) }, { path: 'hr/salary-components', element: S(HrComponents) }, { path: 'hr/revisions', element: S(HrRevisions) },
    { path: 'hr/increments', element: S(HrIncrements) }, { path: 'hr/bonus', element: S(HrBonus) }, { path: 'hr/adjustments', element: S(HrAdjustments) }, { path: 'hr/advances', element: S(HrAdvances) },
    { path: 'hr/payroll', element: S(HrPayroll) }, { path: 'hr/pf', element: S(HrPf) }, { path: 'hr/leave', element: S(HrLeave) }, { path: 'hr/attendance', element: S(HrAttendance) }, { path: 'hr/reports', element: S(HrReports) },
    { path: 'staff', element: S(StaffAccounts) }, { path: 'departments', element: S(Departments) },
    { path: 'donations/donors', element: S(DonDonors) }, { path: 'donations/funds', element: S(DonFunds) }, { path: 'donations/campaigns', element: S(DonCampaigns) }, { path: 'donations', element: S(DonList) },
    // Step 3.4: the component gallery - development builds only (import.meta.env.DEV is false in `vite build`)
    ...(import.meta.env.DEV ? [{ path: 'dev/components', element: S(DevComponents) }] : []),
  ]),
  area('/accountant', 'accountant', [
    { path: 'dashboard', element: S(Dashboard) },
    { path: 'ai', element: S(AiChat) },   // D166 AI-Q4: the help guide
    { path: 'fees/collect', element: S(FeeCollect) },
    { path: 'fees/dues', element: S(FeeLedger) },
    { path: 'reports', element: S(Reports) },
    { path: 'cashbook', element: S(CashBook) }, { path: 'refunds', element: S(Refunds) }, { path: 'expenses', element: S(Expenses) }, { path: 'inventory', element: S(Inventory) },
    { path: 'accounting', element: S(AccVouchers) }, { path: 'donations', element: S(DonList) },
    { path: 'hr/payroll', element: S(HrPayroll) }, { path: 'hr/advances', element: S(HrAdvances) }, { path: 'hr/adjustments', element: S(HrAdjustments) }, { path: 'hr/revisions', element: S(HrRevisions) },
  ]),
  area('/teacher', 'teacher', [{ path: 'dashboard', element: S(Dashboard) }, { path: 'attendance', element: S(Attendance) }, { path: 'batches', element: S(MyBatches) }, { path: 'marks', element: S(MyMarks) }, { path: 'marks/:examId/:subjectId', element: S(MarksEntry) }, { path: 'question-bank', element: S(QbAllQuestions) }, { path: 'materials', element: S(QbLibrary) }, { path: 'question-bank/papers', element: S(QbPapers) }, { path: 'question-bank/all-questions', element: S(QbAllQuestions) }, { path: 'question-bank/papers/:id', element: S(QbPaperEdit) }, { path: 'question-bank/papers/:id/omr', element: S(QbOmr) }, { path: 'question-bank/papers/:id/preview', element: S(QbPaperPreview) }, { path: 'salary', element: S(MySalary) }, { path: 'ai', element: S(AiChat) }]),
  area('/staff', 'institution_staff', [{ path: 'departments', element: S(MyDepartments) }, { path: 'profile', element: S(MyProfile) }]),   // R3.12 / D88-D91
  area('/student', 'student', [{ path: 'question-bank', element: S(QbStudy) }, { path: 'quizzes', element: S(QbStudentQuizzes) }, { path: 'quizzes/:id', element: S(QbQuizAttempt) }, { path: 'my-class', element: S(LearnerProfile) }, { path: 'practice', element: S(QbPractice) }, { path: 'ai', element: S(AiChat) }]),   // D165 ST.6: the student assistant   // QB.9 / QB.10: the student portal (other student screens: R1.1)
  area('/parent', 'parent', [
    { path: 'dashboard', element: S(ParentHome) },
    { path: 'fees', element: S(ParentFees) },
    { path: 'attendance', element: S(ParentAttendance) },
    { path: 'results', element: S(ParentResults) },
    { path: 'ai', element: S(AiChat) },   // D166 AI-Q4
  ]),
  { path: '/', element: <Navigate to="/login" replace /> },
  { path: '*', element: <Navigate to="/login" replace /> },
]

// Central host (Step 3.1): landing, signup (Step 5.1 is blocked - placeholder), login, Super Admin (Step 4.7 dashboard, Step 5.3 panel)
export const centralRoutes = [
  { path: '/', element: S(Landing) },
  { path: '/signup', element: S(Signup) },
  { path: '/learner-signup', element: S(LearnerSignup) },   // D165 ST.1
  // QB.10: the platform's public quizzes, no login
  { path: '/quizzes', element: S(QbPublicQuiz) },
  { path: '/quizzes/:id', element: S(QbPublicQuiz) },
  ...authRoutes,
  area('/super-admin', 'super_admin', [
    { path: 'dashboard', element: S(Dashboard) },
    { path: 'institutions', element: S(Institutions) },
    { path: 'institutions/:id', element: S(InstitutionDetail) },
    { path: 'settings', element: S(PlatformSettings) },
    { path: 'qb/curriculum', element: S(QbCurriculum) },
    { path: 'qb/writers', element: S(QbWriters) },
    { path: 'qb/pricing', element: S(QbPricing) },   // QB.6
    { path: 'qb/blueprints', element: S(QbBlueprints) },   // R2.1.5 (D126)
    { path: 'qb/quizzes', element: S(QbQuizAdmin) },   // QB.10
    { path: 'qb/withdrawals', element: S(QbWithdrawals) },   // QB.10b
    { path: 'ai', element: S(AiPlatform) },   // D164 AI-P1.5
    { path: 'ai-help', element: S(HelpArticles, { mode: 'super' }) },   // D166 AI-Q4 part 2
    { path: 'qb/exam-batches', element: S(QbExamBatches) },   // D165 ST.2
  ]),
  // D65 QB.2: the question-bank writers' panel (writers, moderators and the Super Admin)
  area('/writer', ['content_writer', 'content_moderator', 'super_admin'], [
    { path: 'dashboard', element: S(QbDashboard) },
    { path: 'questions', element: S(QbQuestions) },
    { path: 'ai-reviews', element: S(AiReviews) },   // D164 AI-P1.4
    { path: 'finder', element: S(QbFinder) },
    { path: 'imports', element: S(QbImports) },
    { path: 'imports/:id', element: S(QbImportReview) },
    { path: 'questions/start', element: S(QbQuestionStart) },   // D73: qbank's new-question form, a draft first
    { path: 'questions/:id', element: S(QbQuestionEdit) },
    { path: 'concepts', element: <Suspense fallback={<Loader type="page" />}><QbContentList kind="concepts" /></Suspense> },   // QB.5
    { path: 'concepts/:id', element: S(QbConceptEdit) },
    { path: 'resources', element: <Suspense fallback={<Loader type="page" />}><QbContentList kind="resources" /></Suspense> },
    { path: 'resources/:id', element: S(QbResourceEdit) },
    { path: 'earnings', element: S(QbEarnings) },   // QB.10b (content_writer)
  ]),
  { path: '*', element: <Navigate to="/login" replace /> },
]

export const makeRouter = (isCentral) => createBrowserRouter(isCentral ? centralRoutes : tenantRoutes)
