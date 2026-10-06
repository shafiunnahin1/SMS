import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { useInstitutionStore } from '../../store/institutionStore'
import { useAuthStore } from '../../store/authStore'
import { ROLE_HOME } from '../../router/roleHome'
import CenteredLogin from './login-templates/CenteredLogin'
import SplitLogin from './login-templates/SplitLogin'
import LoginForm from './LoginForm'

// docs/THEMING.md "Login Templates": tokens.login_template picks the wrapper; `cover` arrives with Step 3.5 (falls back to centered)
const TEMPLATES = { centered: CenteredLogin, split: SplitLogin }

export default function Login() {
  const { t } = useTranslation()
  const { institution, theme } = useInstitutionStore()
  const { isAuthenticated, role } = useAuthStore()
  if (isAuthenticated) return <Navigate to={ROLE_HOME[role] ?? '/'} replace />
  const Template = TEMPLATES[theme?.tokens?.login_template] ?? CenteredLogin
  return (
    <Template institution={institution} theme={theme} title={t('auth.title')}>
      <LoginForm />
    </Template>
  )
}
