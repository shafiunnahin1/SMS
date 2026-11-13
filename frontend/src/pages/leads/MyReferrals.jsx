import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import api from '../../api/axios'
import { useTerms } from '../../hooks/useTerms'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'
import { useCrud } from '../../features/academic/useCrud'
import { useUiStore } from '../../store/uiStore'

const PHONE = /^(?:\+?88)?01[3-9]\d{8}$/
const blank = { name: '', phone: '', guardian_name: '', current_class: '', interested_program_id: '', message: '' }

// D203 REF.1 /teacher/referrals and /staff/referrals: a teacher or staff member fills in an admission application for someone they
// bring and becomes its referrer; below, only their own referrals and how far each got. No phone numbers are shown back.
export default function MyReferrals() {
  const { t } = useTranslation()
  const term = useTerms()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const programs = useCrud('programs').list
  const q = useQuery({ queryKey: ['referrals'], queryFn: () => api.get('/referrals').then(r => r.data) })
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))
  const save = async () => {
    if (!PHONE.test(form.phone.trim())) { setErrors({ phone: t('public_site.bad_phone') }); return }
    setBusy(true); setErrors({})
    try {
      await api.post('/referrals', { name: form.name, phone: form.phone.trim(), guardian_name: form.guardian_name || null, current_class: form.current_class || null,
        interested_program_id: form.interested_program_id ? Number(form.interested_program_id) : null, message: form.message || null })
      useUiStore.getState().addToast(t('referrals.sent'))
      setForm(null); qc.invalidateQueries({ queryKey: ['referrals'] })
    } catch (e) {
      const v = e?.response?.data?.errors
      if (v) setErrors(Object.fromEntries(Object.entries(v).map(([k, m]) => [k, [].concat(m)[0]])))
    } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('referrals.title')} actions={!form && <Button onClick={() => setForm(blank)}><Plus aria-hidden="true" className="h-4 w-4" />{t('referrals.new')}</Button>} />
      <p className="text-sm text-content-muted">{t('referrals.hint')}</p>
      {form && (
        <Card className="grid gap-3 sm:grid-cols-2" data-testid="referral-form">
          <Input label={t('leads.name')} value={form.name} onChange={set('name')} error={errors.name} maxLength={100} />
          <Input ltr inputMode="tel" placeholder="01XXXXXXXXX" label={t('leads.phone')} value={form.phone} onChange={set('phone')} error={errors.phone} />
          <Input label={t('leads.guardian')} value={form.guardian_name} onChange={set('guardian_name')} maxLength={100} />
          <Input label={t('leads.current_class')} value={form.current_class} onChange={set('current_class')} maxLength={100} />
          <Select label={t('leads.interested', { program: term('program') })} placeholder="—" value={form.interested_program_id} onChange={set('interested_program_id')}
            options={(programs.data ?? []).map(p => ({ value: String(p.id), label: p.name }))} error={errors.interested_program_id} />
          <Textarea className="sm:col-span-2" rows={2} label={t('public_site.f_message')} value={form.message} onChange={set('message')} maxLength={500} />
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setForm(null); setErrors({}) }}>{t('common.cancel')}</Button>
            <Button onClick={save} loading={busy} disabled={!form.name.trim() || !form.phone.trim()}>{t('referrals.send')}</Button>
          </div>
        </Card>
      )}
      {q.isPending ? <Loader type="cards" count={2} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : <>
        <Card data-testid="referral-totals"><p className="text-sm">{t('referrals.totals', { n: q.data.meta.total, admitted: q.data.meta.admitted })}</p></Card>
        {!q.data.data.length ? <EmptyState title={t('referrals.none')} /> : q.data.data.map(r => (
          <Card key={r.id} className="flex flex-wrap items-center justify-between gap-2" data-testid="referral">
            <span><span className="font-medium" dir="auto">{r.name}</span>{r.program && <span className="text-sm text-content-muted"> · <span dir="auto">{r.program}</span></span>}</span>
            <span className="text-sm">{t(`leads.statuses.${r.status}`)} · {fmtDate(r.created_at, locale)}</span>
          </Card>
        ))}
      </>}
    </div>
  )
}
