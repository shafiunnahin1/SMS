import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, Navigate, useSearchParams } from 'react-router-dom'
import api from '../../api/axios'
import { useInstitutionStore } from '../../store/institutionStore'
import { useAuthStore } from '../../store/authStore'
import { useTerms } from '../../hooks/useTerms'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate } from '../../i18n/format'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'
import LanguageSwitcher from '../../layouts/parts/LanguageSwitcher'
import PoweredBy from '../../layouts/parts/PoweredBy'
import AdmissionTransparency from './AdmissionTransparency'

// D202 PUB.3 (docs/modules/public-website.md "Routes & Pages"): the institution's small public site - Home, Notices, Admission -
// in its own theme (colours, font, radius) but not its app layout. Every institution text is shown as plain text, never as HTML.
// With the site off (or the module off) `/` goes to /login.
export const PHONE = /^(?:\+?88)?01[3-9]\d{8}$/

const useSite = () => useQuery({ queryKey: ['public-site'], queryFn: () => api.get('/public/site').then(r => r.data.data), staleTime: 60_000 })

export function PublicLayout({ children }) {
  const { t } = useTranslation()
  const institution = useInstitutionStore(s => s.institution)
  const theme = useInstitutionStore(s => s.theme)
  const site = useSite()
  const name = site.data?.name ?? institution?.name ?? ''
  const logo = site.data?.logo_url ?? theme?.logo_url
  const nav = ({ isActive }) => `px-2 py-1 rounded-token text-sm ${isActive ? 'bg-primary-soft text-primary-fg' : 'hover:bg-surface-muted'}`
  return (
    <div className="min-h-screen bg-surface-muted text-content flex flex-col">
      <header className="bg-surface [border-bottom:1px_solid_var(--line)]">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            {logo && <img src={logo} alt="" className="h-9 w-9 object-contain" />}<span dir="auto">{name}</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1" aria-label={t('public_site.menu')}>
            <NavLink to="/" end className={nav}>{t('public_site.home')}</NavLink>
            <NavLink to="/notices" className={nav}>{t('public_site.notices')}</NavLink>
            <NavLink to="/admission" className={nav}>{t('public_site.admission')}</NavLink>
            <Link to="/login" className="px-3 py-1 rounded-token text-sm bg-primary text-on-primary">{t('public_site.login')}</Link>
            <LanguageSwitcher />
          </nav>
        </div>
      </header>
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">{children}</main>
      <footer className="bg-surface [border-top:1px_solid_var(--line)]">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span dir="auto">© {name}</span>
          <span className="flex gap-4"><Link to="/privacy" className="underline">{t('legal.privacy')}</Link><Link to="/terms" className="underline">{t('legal.terms')}</Link></span>
        </div>
        <PoweredBy theme={theme} />
      </footer>
    </div>
  )
}

const Paras = ({ text }) => (text ?? '').split(/\n\s*\n/).filter(p => p.trim()).map((p, n) => <p key={n} className="leading-relaxed whitespace-pre-line" dir="auto">{p}</p>)

function Contact({ c }) {
  const { t } = useTranslation()
  if (!c || !Object.values(c).some(Boolean)) return null
  return (
    <Card className="flex flex-col gap-2" data-testid="public-contact">
      <h2 className="text-lg font-semibold">{t('public_site.contact')}</h2>
      {c.phone && <p>{t('public_site.phone')}: <a className="underline" href={`tel:${c.phone}`}><Ltr>{c.phone}</Ltr></a></p>}
      {c.whatsapp && <p>WhatsApp: <a className="underline" href={`https://wa.me/88${c.whatsapp.replace(/\D/g, '').slice(-11)}`} rel="noopener noreferrer" target="_blank"><Ltr>{c.whatsapp}</Ltr></a></p>}
      {c.email && <p>{t('public_site.email')}: <a className="underline" href={`mailto:${c.email}`}><Ltr>{c.email}</Ltr></a></p>}
      {c.address && <p dir="auto">{c.address}</p>}
      <p className="flex flex-wrap gap-4">
        {c.map_url?.startsWith('https://') && <a className="underline" href={c.map_url} rel="noopener noreferrer" target="_blank">{t('public_site.map')}</a>}
        {c.facebook_url?.startsWith('https://') && <a className="underline" href={c.facebook_url} rel="noopener noreferrer" target="_blank">Facebook</a>}
      </p>
    </Card>
  )
}

export function PublicHome() {
  const { t } = useTranslation()
  const term = useTerms()
  const { locale } = useLocale()
  const site = useSite()
  if (site.isPending) return <PublicLayout><Loader type="cards" count={3} /></PublicLayout>
  if (site.isError) return <PublicLayout><ErrorState onRetry={site.refetch} /></PublicLayout>
  const d = site.data, s = d.settings
  return (
    <PublicLayout>
      {s.hero_url && <img src={s.hero_url} alt="" className="w-full max-h-80 object-cover rounded-token" data-testid="public-hero-image" />}
      <section className="rounded-token bg-primary text-on-primary p-6 sm:p-10 flex flex-col gap-3" data-testid="public-hero">
        <h1 className="text-2xl sm:text-3xl font-bold" dir="auto">{s.headline || d.name}</h1>
        {s.tagline && <p className="text-lg" dir="auto">{s.tagline}</p>}
        <div className="flex flex-wrap gap-2">
          {s.admission_open && <Link to="/admission" className="px-4 h-10 inline-flex items-center rounded-token bg-surface text-content font-medium">{t('public_site.apply')}</Link>}
          <Link to="/login" className="px-4 h-10 inline-flex items-center rounded-token [border:1px_solid_currentColor] font-medium">{t('public_site.login')}</Link>
        </div>
      </section>
      {s.about && <Card className="flex flex-col gap-2"><h2 className="text-lg font-semibold">{t('public_site.about')}</h2><Paras text={s.about} /></Card>}
      {s.show_programs && d.programs.length > 0 && (
        <section className="flex flex-col gap-3" data-testid="public-programs">
          <h2 className="text-lg font-semibold">{term('programs')}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.programs.map(p => (
              <Card key={p.id} className="flex flex-col gap-1">
                <h3 className="font-semibold" dir="auto">{p.name}</h3>
                {p.public_description && <p className="text-sm" dir="auto">{p.public_description}</p>}
                {(p.duration_months || p.course_fee) && <p className="text-sm text-content-muted">
                  {p.duration_months ? t('public_site.months', { n: p.duration_months }) : null}{p.duration_months && p.course_fee ? ' · ' : null}{p.course_fee ? <>{t('public_site.fee')}: <Ltr>{p.course_fee}</Ltr></> : null}</p>}
                {p.batches?.length > 0 && <p className="text-sm text-content-muted">{term('batches')}: <span dir="auto">{p.batches.map(b => b.name).join(', ')}</span></p>}
              </Card>
            ))}
          </div>
        </section>
      )}
      {s.show_notices && d.notices.length > 0 && (
        <Card className="flex flex-col gap-2" data-testid="public-notices-recent">
          <h2 className="text-lg font-semibold">{t('public_site.recent_notices')}</h2>
          {d.notices.map(n => <p key={n.id} className="flex flex-wrap justify-between gap-2"><span dir="auto">{n.title}</span><span className="text-sm text-content-muted">{fmtDate(n.published_at, locale)}</span></p>)}
          <Link to="/notices" className="text-sm underline">{t('public_site.all_notices')}</Link>
        </Card>
      )}
      <Contact c={s.contact} />
    </PublicLayout>
  )
}

export function PublicNotices() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page')) || 1)
  const q = useQuery({ queryKey: ['public-notices', page], queryFn: () => api.get('/public/notices', { params: { page } }).then(r => r.data) })
  return (
    <PublicLayout>
      <h1 className="text-2xl font-semibold">{t('public_site.notices')}</h1>
      {q.isPending ? <Loader type="cards" count={3} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.data.length ? <EmptyState title={t('public_site.no_notices')} /> : <>
        {q.data.data.map(n => (
          <Card key={n.id} className="flex flex-col gap-2" data-testid="public-notice">
            <h2 className="font-semibold" dir="auto">{n.title}</h2>
            <p className="text-sm text-content-muted">{fmtDate(n.published_at, locale)}</p>
            <Paras text={n.content} />
          </Card>
        ))}
        {q.data.meta.last_page > 1 && (
          <div className="flex items-center justify-center gap-3">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setParams({ page: String(page - 1) })}>{t('public_site.newer')}</Button>
            <span className="text-sm">{t('public_site.page_of', { n: page, total: q.data.meta.last_page })}</span>
            <Button variant="secondary" disabled={page >= q.data.meta.last_page} onClick={() => setParams({ page: String(page + 1) })}>{t('public_site.older')}</Button>
          </div>
        )}
      </>}
    </PublicLayout>
  )
}

const blank = { name: '', guardian_name: '', phone: '', email: '', current_class: '', interested_program_id: '', interested_batch_id: '', message: '', consent: false, website: '' }

export function PublicAdmission() {
  const [qs] = useSearchParams()   // D209 ACY.3: /admission?transparency=<cycle id> shows that cycle's public record
  const transparency = Number(qs.get('transparency')) || null
  const { t } = useTranslation()
  const term = useTerms()
  const site = useSite()
  const [f, setF] = useState(blank)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [appNo, setAppNo] = useState(null)
  const set = (k) => (e) => setF(v => ({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const submit = async (e) => {
    e.preventDefault()
    const err = {}
    if (!f.name.trim()) err.name = t('public_site.required')
    if (!PHONE.test(f.phone.trim())) err.phone = t('public_site.bad_phone')
    if (!f.consent) err.consent = t('public_site.consent_required')
    setErrors(err)
    if (Object.keys(err).length) return
    setBusy(true)
    try {
      const body = { ...f, phone: f.phone.trim(), interested_program_id: f.interested_program_id ? Number(f.interested_program_id) : null,
        interested_batch_id: f.interested_batch_id ? Number(f.interested_batch_id) : null }
      const r = await api.post('/public/admission', body)
      setDone(r.data.message ?? t('public_site.thanks'))
      setAppNo(r.data.application_no ?? null)   // D209 ACY.1
    } catch (x) {
      const v = x?.response?.data?.errors
      if (v) setErrors(Object.fromEntries(Object.entries(v).map(([k, m]) => [k, [].concat(m)[0]])))
    } finally { setBusy(false) }
  }
  if (transparency) return <PublicLayout><AdmissionTransparency id={transparency} /></PublicLayout>
  if (site.isPending) return <PublicLayout><Loader type="cards" count={1} /></PublicLayout>
  if (site.isError) return <PublicLayout><ErrorState onRetry={site.refetch} /></PublicLayout>
  const s = site.data.settings
  const program = site.data.programs.find(p => String(p.id) === String(f.interested_program_id))
  return (
    <PublicLayout>
      <h1 className="text-2xl font-semibold">{t('public_site.admission_title')}</h1>
      {!s.admission_open ? <Card data-testid="admission-closed"><p>{t('public_site.admission_closed')}</p></Card>
        : done ? <Card data-testid="admission-done"><p className="font-medium" dir="auto">{done}</p>{appNo && <p className="mt-2" data-testid="application-no">{t('public_site.application_no')}: <strong><Ltr>{appNo}</Ltr></strong> <span className="text-sm text-content-muted">{t('public_site.application_no_keep')}</span></p>}</Card> : (
        <Card>
          <form onSubmit={submit} noValidate className="grid gap-3 sm:grid-cols-2" data-testid="admission-form">
            <Input label={`${t('public_site.f_name')} *`} value={f.name} onChange={set('name')} error={errors.name} maxLength={100} />
            <Input label={t('public_site.f_guardian')} value={f.guardian_name} onChange={set('guardian_name')} maxLength={100} />
            <Input label={`${t('public_site.f_phone')} *`} ltr inputMode="tel" placeholder="01XXXXXXXXX" value={f.phone} onChange={set('phone')} error={errors.phone} />
            <Input label={t('public_site.email')} ltr type="email" value={f.email} onChange={set('email')} error={errors.email} />
            <Input label={t('public_site.f_class')} value={f.current_class} onChange={set('current_class')} maxLength={100} />
            {site.data.programs.length > 0 && <Select label={t('public_site.f_program', { program: term('program') })} placeholder="—" value={f.interested_program_id}
              onChange={e => setF(v => ({ ...v, interested_program_id: e.target.value, interested_batch_id: '' }))} options={site.data.programs.map(p => ({ value: String(p.id), label: p.name }))} />}
            {program?.batches?.length > 0 && <Select label={term('batch')} placeholder="—" value={f.interested_batch_id} onChange={set('interested_batch_id')}
              options={program.batches.map(b => ({ value: String(b.id), label: b.name }))} />}
            <Textarea className="sm:col-span-2" rows={3} label={t('public_site.f_message')} value={f.message} onChange={set('message')} maxLength={500} />
            {/* honeypot: hidden from people, filled by bots */}
            <div aria-hidden="true" className="sr-only"><label>Website<input tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} name="website" /></label></div>
            <div className="sm:col-span-2 flex flex-col gap-1">
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-primary)]" checked={f.consent} onChange={set('consent')} />
                <span>{t('public_site.consent_1')} <Link to="/privacy" className="underline">{t('legal.privacy')}</Link> {t('public_site.consent_2')}</span></label>
              {errors.consent && <p className="text-xs text-red-600" role="alert">{errors.consent}</p>}
            </div>
            <div className="sm:col-span-2 flex justify-end"><Button type="submit" loading={busy}>{t('public_site.submit')}</Button></div>
          </form>
        </Card>
      )}
    </PublicLayout>
  )
}

/** `/`: the public home while the site is on, otherwise the login page */
export function PublicRoot() {
  const on = useInstitutionStore(s => Boolean(s.settings?.public_site?.enabled) && s.hasModule('public_site'))
  return on ? <PublicHome /> : <Navigate to="/login" replace />
}

export function PublicGate({ children }) {
  const on = useInstitutionStore(s => Boolean(s.settings?.public_site?.enabled) && s.hasModule('public_site'))
  return on ? children : <Navigate to="/login" replace />
}

/** `/notices` is also the signed-in readers' notice board: signed in -> the board, otherwise the public notices */
export function NoticesEntry({ board }) {
  const signedIn = useAuthStore(s => s.isAuthenticated)
  if (signedIn) return board
  return <PublicGate><PublicNotices /></PublicGate>
}
