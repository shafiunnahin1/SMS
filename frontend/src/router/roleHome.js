// Where each role lands after login (docs/templates/react-core-files.md "ProtectedRoute")
export const ROLE_HOME = {
  super_admin: '/super-admin/dashboard', admin: '/admin/dashboard', teacher: '/teacher/dashboard',
  parent: '/parent/dashboard', accountant: '/accountant/dashboard',
  student: '/student/question-bank',   // QB.9 (D65): the question-bank portal is the student panel in R1
  content_writer: '/writer/questions', content_moderator: '/writer/questions',   // D65 QB.2: the question-bank writers' panel (central host)
}

/** Accounts that work on the central host only (no institution): the Super Admin and the question-bank writers */
export const PLATFORM_ROLES = ['super_admin', 'content_writer', 'content_moderator']
