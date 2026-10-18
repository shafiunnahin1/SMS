import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useInstitutionStore } from '../../store/institutionStore'
import CenteredLogin from './login-templates/CenteredLogin'
import SplitLogin from './login-templates/SplitLogin'
import CoverLogin from './login-templates/CoverLogin'

// The institution's login template (tokens.login_template) around any auth page: login, forgot / reset / change password
const TEMPLATES = { centered: CenteredLogin, split: SplitLogin, cover: CoverLogin }
export default function AuthFrame({ title, children }) {
  const { institution, theme } = useInstitutionStore()
  const Template = TEMPLATES[theme?.tokens?.login_template] ?? CenteredLogin
  const { t } = useTranslation()
  return (
    <Template institution={institution} theme={theme} title={title}>
      {children}
      {/* Step 8.1 (D27): the policy and the terms are one click from every sign-in screen */}
      <nav className="mt-4 flex justify-center gap-4 text-xs text-content-muted" data-testid="legal-links">
        <Link to="/privacy" className="underline">{t('legal.privacy')}</Link>
        <Link to="/terms" className="underline">{t('legal.terms')}</Link>
      </nav>
    </Template>
  )
}
