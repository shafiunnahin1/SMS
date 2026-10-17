import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { ROLE_HOME } from './roleHome'
import Loader from '../components/Loader'

// docs/templates/react-core-files.md "ProtectedRoute". While the session check (GET /auth/me) runs, a page skeleton - not a bounce to
// /login. A user who must change the password goes to /change-password first (the server's password.fresh enforces the same).
export default function ProtectedRoute({ children, role }) {
  const { isAuthenticated, checked, role: userRole, user } = useAuthStore()
  const location = useLocation()
  if (!checked) return <Loader type="page" fullScreen />
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />
  if (user?.must_change_password && location.pathname !== '/change-password') return <Navigate to="/change-password" replace />
  if (role && !(Array.isArray(role) ? role : [role]).includes(userRole)) return <Navigate to={ROLE_HOME[userRole] ?? '/login'} replace />
  return children
}
