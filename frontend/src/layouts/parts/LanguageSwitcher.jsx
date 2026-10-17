import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { LOCALES } from '../../i18n/locales'
import { useLocale } from '../../ui/I18nProvider'

// docs/I18N.md section 1: only the enabled languages, each in its own script; hidden when only one is enabled; no page reload
export default function LanguageSwitcher({ className = '' }) {
  const { t } = useTranslation()
  const { locale, setLocale, enabled } = useLocale()
  if (!enabled || enabled.length < 2) return null
  return (
    <label data-testid="language-switcher" className={`inline-flex items-center gap-1 text-sm ${className}`}>
      <Languages aria-hidden="true" className="h-4 w-4" />
      <span className="sr-only">{t('common.language')}</span>
      <select value={locale} onChange={e => setLocale(e.target.value)} className="bg-transparent text-inherit rounded-token h-8 px-1 [border:1px_solid_var(--line)]">
        {enabled.map(l => <option key={l} value={l} className="text-content bg-surface">{LOCALES[l]?.label ?? l}</option>)}
      </select>
    </label>
  )
}
