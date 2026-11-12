import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../api/axios'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import Loader from '../../../components/Loader'
import Ltr from '../../../components/bidi/Ltr'
import { ErrorState } from '../../../components/StateViews'
import { Input, Textarea } from '../../../components/FormField'
import { useUiStore } from '../../../store/uiStore'
import { useInstitutionStore } from '../../../store/institutionStore'
import { useTerms } from '../../../hooks/useTerms'

const CONTACT = ['phone', 'whatsapp', 'email', 'address', 'map_url', 'facebook_url']

// D202 PUB.3 (docs/modules/public-website.md "Admin UI"): /admin/settings/website - switch the public site on or off, its texts
// (with a character count), hero image, contact, admission open/closed and its message, the Google preview (SEO), the new-application
// SMS, and a link to the site. Every text is plain text: what is typed is what visitors see.
export default function WebsiteSettings() {
  const { t } = useTranslation()
  const term = useTerms()
  const qc = useQueryClient()
  const toast = (m) => useUiStore.getState().addToast(m)
  const q = useQuery({ queryKey: ['settings', 'website'], queryFn: () => api.get('/admin/settings/website').then(r => r.data.data) })
  const { register, handleSubmit, reset, watch, setError, formState: { errors, isSubmitting } } = useForm()
  const [uploading, setUploading] = useState(false)
  useEffect(() => { if (q.data) reset(q.data) }, [q.data, reset])
  const v = watch()
  const done = (data) => {
    qc.setQueryData(['settings', 'website'], data)
    qc.invalidateQueries({ queryKey: ['public-site'] })
    useInstitutionStore.setState(s => ({ settings: { ...s.settings, public_site: { enabled: Boolean(data.enabled) } } }))
  }
  const onSubmit = async (f) => {
    const text = (k) => f[k] || null
    try {
      const r = await api.put('/admin/settings/website', {
        enabled: Boolean(f.enabled), admission_open: Boolean(f.admission_open), show_programs: Boolean(f.show_programs), show_notices: Boolean(f.show_notices), alert_sms: Boolean(f.alert_sms),
        headline: text('headline'), tagline: text('tagline'), about: text('about'), admission_message: text('admission_message'),
        contact: Object.fromEntries(CONTACT.map(k => [k, f.contact?.[k] || null])), seo: { title: f.seo?.title || null, description: f.seo?.description || null },
      })
      done(r.data.data)
      toast(t('common.saved'))
    } catch (e) { Object.entries(e.response?.data?.errors ?? {}).forEach(([k, m]) => setError(k, { message: m[0] })) }
  }
  const upload = async (file) => {
    if (!file) return
    const body = new FormData(); body.append('hero', file)
    setUploading(true)
    try {
      const r = await api.post('/admin/settings/website/hero', body)
      done({ ...q.data, hero_url: r.data.data.hero_url })
      toast(t('website.hero_done'))
    } catch { /* the interceptor shows it */ } finally { setUploading(false) }
  }
  if (q.isPending) return <Loader type="page" />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  const box = (name, label) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" {...register(name)} />{label}</label>
  const count = (s, max) => t('website.chars', { n: (s ?? '').length, max })
  const seoTitle = v.seo?.title || v.headline || ''
  const seoDesc = (v.seo?.description || v.about || v.headline || '').slice(0, 160)
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate data-testid="website-settings">
      <PageHeader title={t('website.title')} actions={q.data.site_url && <a href={q.data.site_url} target="_blank" rel="noopener noreferrer" className="text-sm underline">{t('website.view_site')}</a>} />
      <Card className="flex flex-col gap-2">
        {box('enabled', t('website.enabled'))}
        <p className="text-sm text-content-muted">{t('website.enabled_hint')}</p>
        {q.data.site_url && <p className="text-sm"><Ltr>{q.data.site_url}</Ltr></p>}
      </Card>
      <Card className="grid gap-3">
        <Input label={t('website.headline')} hint={count(v.headline, 150)} maxLength={150} error={errors.headline?.message} {...register('headline')} />
        <Input label={t('website.tagline')} hint={count(v.tagline, 200)} maxLength={200} error={errors.tagline?.message} {...register('tagline')} />
        <Textarea rows={6} label={t('website.about')} hint={`${count(v.about, 1500)} · ${t('website.about_hint')}`} maxLength={1500} error={errors.about?.message} {...register('about')} />
        <div className="flex flex-wrap items-center gap-3">
          {q.data.hero_url && <img src={q.data.hero_url} alt="" className="h-20 w-40 object-cover rounded-token" />}
          <label className="text-sm flex flex-col gap-1">{t('website.hero')}
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={e => upload(e.target.files?.[0])} data-testid="hero-input" />
            <span className="text-xs text-content-muted">{t('website.hero_hint')}</span></label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">{box('show_programs', t('website.show_programs', { programs: term('programs') }))}{box('show_notices', t('website.show_notices'))}</div>
      </Card>
      <Card className="grid gap-3">
        <h2 className="font-semibold">{t('website.admission')}</h2>
        {box('admission_open', t('website.admission_open'))}
        <Input label={t('website.admission_message')} hint={count(v.admission_message, 300)} maxLength={300} error={errors.admission_message?.message} {...register('admission_message')} />
        {box('alert_sms', t('website.alert_sms'))}
      </Card>
      <Card className="grid gap-3 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">{t('website.contact')}</h2>
        {CONTACT.map(k => <Input key={k} className={k === 'address' ? 'sm:col-span-2' : ''} ltr={k !== 'address'} label={t(`website.c_${k}`)}
          placeholder={k.endsWith('_url') ? 'https://' : undefined} error={errors.contact?.[k]?.message} {...register(`contact.${k}`)} />)}
      </Card>
      <Card className="grid gap-3">
        <h2 className="font-semibold">{t('website.seo')}</h2>
        <Input label={t('website.seo_title')} hint={count(v.seo?.title, 70)} maxLength={70} error={errors.seo?.title?.message} {...register('seo.title')} />
        <Textarea rows={2} label={t('website.seo_description')} hint={count(v.seo?.description, 160)} maxLength={160} error={errors.seo?.description?.message} {...register('seo.description')} />
        <div className="rounded-token p-3 [border:1px_solid_var(--line)]" data-testid="seo-preview">
          <p className="text-xs text-content-muted">{t('website.seo_preview')}</p>
          <p className="text-primary-fg font-medium" dir="auto">{seoTitle}</p>
          <p className="text-xs"><Ltr>{q.data.site_url}</Ltr></p>
          <p className="text-sm text-content-muted" dir="auto">{seoDesc}</p>
        </div>
      </Card>
      <div className="flex justify-end"><Button type="submit" loading={isSubmitting}>{t('common.save')}</Button></div>
    </form>
  )
}
