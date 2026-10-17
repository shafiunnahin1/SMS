import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import Card from '../../components/Card'

// Self-signup is Step 5.1, which AGENTS.md marks BLOCKED until module-based subscriptions are re-specified (D47)
export default function Signup() {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface-muted">
      <Card className="max-w-sm text-center flex flex-col gap-3">
        <h1 className="text-lg font-semibold">{t('central.signup')}</h1>
        <p className="text-sm text-content-muted">{t('central.signup_soon')}</p>
        <Link to="/" className="text-sm text-primary-fg">{t('common.back')}</Link>
      </Card>
    </div>
  )
}
