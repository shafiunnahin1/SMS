import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { ROLE_HOME } from './roleHome'

// docs/templates/react-core-files.md "ProtectedRoute"

export default function ProtectedRoute({ children, role }) {
  const { isAuthenticated, role: userRole } = useAuthStore()
  const location = useLocation()
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />
  if (role && !(Array.isArray(role) ? role : [role]).includes(userRole)) return <Navigate to={ROLE_HOME[userRole] ?? '/login'} replace />
  return children
}
