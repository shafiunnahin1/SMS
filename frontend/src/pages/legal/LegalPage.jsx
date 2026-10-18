import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useLocale } from '../../ui/I18nProvider'
import { useInstitutionStore } from '../../store/institutionStore'
import { parseLegal } from '../../features/legal/renderLegal'
import Loader from '../../components/Loader'
import { ErrorState } from '../../components/StateViews'
import LanguageSwitcher from '../../layouts/parts/LanguageSwitcher'

// Step 8.1 (D27, privacy-and-consent.md section 8): /privacy and /terms on every host, no login. The text is the owner's file
// public/legal/{doc}.{locale}.md (Bengali when a language has none); "draft" shows until the lawyer's text replaces it.
export default function LegalPage({ doc }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const institution = useInstitutionStore(s => s.institution)
  const platform = import.meta.env.VITE_APP_NAME ?? 'Education Management'
  const q = useQuery({
    queryKey: ['legal', doc, locale],
    queryFn: async () => {
      for (const lang of [locale, 'bn']) {
        const r = await fetch(`/legal/${doc}.${lang}.md`)
        if (r.ok && !(r.headers.get('content-type') ?? '').includes('text/html')) return r.text()   // a missing file comes back as the app's own page
      }
      throw new Error('legal text missing')
    },
  })
  const parsed = q.data ? parseLegal(q.data, { institution_name: institution?.name ?? platform, platform_name: platform,
    contact: institution?.phone ?? institution?.email ?? platform, platform_contact: platform }) : null
  return (
    <div className="min-h-screen bg-surface-muted text-content">
      <div className="max-w-3xl mx-auto p-4 sm:p-8 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <Link to="/" className="text-sm text-primary-fg underline">{institution?.name ?? platform}</Link>
          <LanguageSwitcher />
        </div>
        <article className="bg-surface rounded-token p-4 sm:p-8 [border:1px_solid_var(--line)] flex flex-col gap-3" data-testid={`legal-${doc}`}>
          {q.isPending ? <Loader type="skeleton" rows={8} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : <>
            {parsed.draft && <p className="text-sm rounded-token p-3 bg-amber-100 text-amber-800" role="note" data-testid="legal-draft">{t('legal.draft')}</p>}
            {parsed.blocks.map((b, n) => b.type === 'h1' ? <h1 key={n} className="text-2xl font-semibold" dir="auto">{b.text}</h1>
              : b.type === 'h2' ? <h2 key={n} className="text-lg font-semibold mt-2" dir="auto">{b.text}</h2>
              : b.type === 'ul' ? <ul key={n} className="list-disc ps-6 flex flex-col gap-1">{b.items.map((it, k) => <li key={k} dir="auto">{it}</li>)}</ul>
              : <p key={n} className="leading-relaxed" dir="auto">{b.text}</p>)}
          </>}
        </article>
        <nav className="flex gap-4 text-sm"><Link to="/privacy" className="underline">{t('legal.privacy')}</Link><Link to="/terms" className="underline">{t('legal.terms')}</Link></nav>
      </div>
    </div>
  )
}
