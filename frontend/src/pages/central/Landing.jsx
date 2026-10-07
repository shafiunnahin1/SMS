import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import LanguageSwitcher from '../../layouts/parts/LanguageSwitcher'

// Central host (docs/templates/react-core-files.md router, Revision 6): the platform's own page. The marketing site and self-signup
// (Step 5.1, blocked until the module-based pricing is re-specified - D47) are not built; this page links to the Super Admin login.
export default function Landing() {
  const { t } = useTranslation()
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center bg-surface-muted text-content">
      <div className="absolute top-4 end-4"><LanguageSwitcher /></div>
      <h1 className="text-2xl font-semibold">{import.meta.env.VITE_APP_NAME ?? 'Education Management'}</h1>
      <p className="text-content-muted max-w-md">{t('central.tagline')}</p>
      <div className="flex gap-2">
        <Link to="/login" className="inline-flex items-center h-10 px-4 rounded-token bg-primary text-on-primary text-sm font-medium hover:opacity-90">{t('central.login')}</Link>
        <Link to="/signup" className="inline-flex items-center h-10 px-4 rounded-token text-sm font-medium text-primary-fg hover:bg-primary-soft">{t('central.signup')}</Link>
      </div>
    </div>
  )
}
