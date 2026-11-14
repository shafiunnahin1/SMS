import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'
import { useLocale } from '../../ui/I18nProvider'
import { fmtHijri } from '../../features/hijri/hijri'

// D214 MAD.1 /admin/settings/madrasa: the hifz switch and its settings (pages a para, days before "behind", parents' view);
// D214 MAD.2: the Hijri calendar display; D214 MAD.3: second-language names
export default function MadrasaSettings() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['settings', 'hifz'], queryFn: () => api.get('/admin/settings/hifz').then(r => r.data.data) })
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (q.data) setF({ enabled: q.data.enabled, pages_per_para: String(q.data.pages_per_para), stale_days: String(q.data.stale_days), show_parents: q.data.show_parents }) }, [q.data])
  if (q.isPending || (!f && !q.isError)) return <Loader type="page" />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.put('/admin/settings/hifz', { enabled: f.enabled, pages_per_para: Number(f.pages_per_para), stale_days: Number(f.stale_days), show_parents: f.show_parents })
      useUiStore.getState().addToast(t('hifz.settings_saved'))
    } catch { /* the interceptor shows the error */ } finally { setBusy(false); qc.invalidateQueries({ queryKey: ['settings', 'hifz'] }) }
  }
  return (
    <div className="flex flex-col gap-4" data-testid="madrasa-settings">
      <PageHeader title={t('hifz.settings_title')} />
      <Card>
        <form className="flex flex-col gap-3 sm:max-w-md" onSubmit={save} data-testid="hifz-settings">
          <h2 className="font-semibold">{t('hifz.title')}</h2>
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="enabled" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} />{t('hifz.enable')}</label>
          <Input name="pages_per_para" type="number" min="1" max="100" step="0.5" label={t('hifz.pages_per_para')} hint={t('hifz.pages_per_para_hint')} value={f.pages_per_para} onChange={(e) => setF({ ...f, pages_per_para: e.target.value })} required ltr />
          <Input name="stale_days" type="number" min="1" max="365" label={t('hifz.stale_days')} value={f.stale_days} onChange={(e) => setF({ ...f, stale_days: e.target.value })} required ltr />
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="show_parents" checked={f.show_parents} onChange={(e) => setF({ ...f, show_parents: e.target.checked })} />{t('hifz.show_parents')}</label>
          <p className="text-sm text-content-muted">{t('hifz.reload_hint')}</p>
          <div><Button type="submit" disabled={busy} data-action="save">{t('hifz.save')}</Button></div>
        </form>
      </Card>
      <HijriSettings />
      <AltNameSettings />
    </div>
  )
}

// D214 MAD.2: the Hijri date beside the Gregorian one - on / off and the moon-sighting offset
function HijriSettings() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['settings', 'calendar'], queryFn: () => api.get('/settings/calendar').then(r => r.data.data) })
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  const cur = f ?? (q.data ? { secondary: q.data.secondary, hijri_offset: String(q.data.hijri_offset) } : null)
  if (q.isPending) return <Loader />
  if (q.isError || !cur) return <ErrorState onRetry={q.refetch} />
  const today = new Date().toISOString().slice(0, 10)
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.put('/admin/settings/calendar', { secondary: cur.secondary, hijri_offset: Number(cur.hijri_offset) })
      useUiStore.getState().addToast(t('hifz.settings_saved'))
    } catch { /* the interceptor shows the error */ } finally { setBusy(false); setF(null); qc.invalidateQueries({ queryKey: ['settings', 'calendar'] }) }
  }
  return (
    <Card>
      <form className="flex flex-col gap-3 sm:max-w-md" onSubmit={save} data-testid="hijri-settings">
        <h2 className="font-semibold">{t('hijri.title')}</h2>
        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="hijri" checked={cur.secondary === 'hijri'} onChange={(e) => setF({ ...cur, secondary: e.target.checked ? 'hijri' : 'none' })} />{t('hijri.enable')}</label>
        <Select name="hijri_offset" label={t('hijri.offset')} hint={t('hijri.offset_hint')} value={cur.hijri_offset} onChange={(e) => setF({ ...cur, hijri_offset: e.target.value })}
          options={[-2, -1, 0, 1, 2].map(n => ({ value: String(n), label: t('hijri.offset_n', { n: n > 0 ? `+${n}` : String(n) }) }))} />
        <p className="text-sm" data-testid="hijri-preview">{t('hijri.today')}: {fmtHijri(today, locale, Number(cur.hijri_offset)) ?? t('hijri.unsupported')}</p>
        <p className="text-sm text-content-muted">{t('hijri.note')}</p>
        <div><Button type="submit" disabled={busy} data-action="save-hijri">{t('hifz.save')}</Button></div>
      </form>
    </Card>
  )
}

// D214 MAD.3: second-language names - which language, and the institution's own second name (saved with the general settings)
function AltNameSettings() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['settings', 'general'], queryFn: () => api.get('/admin/settings/general').then(r => r.data.data) })
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  const cur = f ?? (q.data ? { alt_name_locale: q.data.alt_name_locale ?? '', name_alt: q.data.name_alt ?? '' } : null)
  if (q.isPending) return <Loader />
  if (q.isError || !cur) return <ErrorState onRetry={q.refetch} />
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.put('/admin/settings/general', { alt_name_locale: cur.alt_name_locale || null, name_alt: cur.name_alt.trim() || null })
      useUiStore.getState().addToast(t('hifz.settings_saved'))
    } catch { /* the interceptor shows the error */ } finally { setBusy(false); setF(null); qc.invalidateQueries({ queryKey: ['settings', 'general'] }) }
  }
  return (
    <Card>
      <form className="flex flex-col gap-3 sm:max-w-md" onSubmit={save} data-testid="altname-settings">
        <h2 className="font-semibold">{t('altname.title')}</h2>
        <Select name="alt_name_locale" label={t('altname.language')} value={cur.alt_name_locale} onChange={(e) => setF({ ...cur, alt_name_locale: e.target.value })}
          options={[{ value: '', label: t('altname.off') }, { value: 'ar', label: t('altname.languages.ar') }, { value: 'en', label: t('altname.languages.en') }]} />
        {cur.alt_name_locale && <Input name="name_alt" label={t('altname.institution')} dir={cur.alt_name_locale === 'ar' ? 'rtl' : 'ltr'} maxLength={150} value={cur.name_alt} onChange={(e) => setF({ ...cur, name_alt: e.target.value })} />}
        <p className="text-sm text-content-muted">{t('altname.note')}</p>
        <div><Button type="submit" disabled={busy} data-action="save-altname">{t('hifz.save')}</Button></div>
      </form>
    </Card>
  )
}
