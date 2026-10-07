import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { ROLE_HOME } from '../../router/roleHome'
import AuthFrame from './AuthFrame'
import LoginForm from './LoginForm'

export default function Login() {
  const { t } = useTranslation()
  const { isAuthenticated, role } = useAuthStore()
  if (isAuthenticated) return <Navigate to={ROLE_HOME[role] ?? '/'} replace />
  return <AuthFrame title={t('auth.title')}><LoginForm /></AuthFrame>
}
