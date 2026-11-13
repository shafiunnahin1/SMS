import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import api from '../../api/axios'
import { useTerms } from '../../hooks/useTerms'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'
import { useCrud } from '../../features/academic/useCrud'
import { useUiStore } from '../../store/uiStore'
import Ltr from '../../components/bidi/Ltr'
import { useAuthStore } from '../../store/authStore'

const STATUSES = ['new', 'contacted', 'visited', 'lost']
const SOURCES = ['walk_in', 'website', 'facebook', 'referral', 'leaflet']
const blank = { name: '', phone: '', guardian_name: '', current_class: '', interested_program_id: '', source: 'walk_in', follow_up_date: '', note: '', referred_by: '' }

// D202 PUB.1 /admin/leads: people who asked about admission. Add one, move it along (new -> contacted -> visited | lost), set the
// next follow-up, and turn it into a student: "Admit" enrols the applicant in the chosen group with the details already taken.
export default function Leads() {
  const { t } = useTranslation()
  const term = useTerms()
  const qc = useQueryClient()
  const toast = (m) => useUiStore.getState().addToast(m)
  const [status, setStatus] = useState('')
  const [form, setForm] = useState(null)
  const [admit, setAdmit] = useState(null)        // { id, batch_id }
  const [referrer, setReferrer] = useState('')    // D203: filter by referrer
  const [period, setPeriod] = useState({ from: '', to: '' })
  const isAdmin = useAuthStore(s => s.role) === 'admin'
  const programs = useCrud('programs').list
  const batches = useCrud('batches').list
  // D203: the people who may be named as referrer - active teachers and staff accounts (the admin only edits)
  const teachers = useQuery({ queryKey: ['teachers', 'referrers'], queryFn: () => api.get('/teachers', { params: { per_page: 100 } }).then(r => r.data.data), enabled: isAdmin })
  const staff = useQuery({ queryKey: ['admin-staff', 'referrers'], queryFn: () => api.get('/admin/staff', { params: { per_page: 100 } }).then(r => r.data.data), enabled: isAdmin })
  const summary = useQuery({ queryKey: ['leads-referral-summary', period], queryFn: () => api.get('/leads/referral-summary', { params: Object.fromEntries(Object.entries(period).filter(([, v]) => v)) }).then(r => r.data) })
  const referrers = [...new Map([
    ...(teachers.data ?? []).filter(x => x.user_id && x.status !== 'inactive').map(x => [String(x.user_id), x.name]),
    ...(staff.data ?? []).filter(x => x.is_active).map(x => [String(x.id), x.name]),
    ...(summary.data?.meta ? summary.data.data : []).map(x => [String(x.user_id), x.name]),
  ]).entries()].map(([value, label]) => ({ value, label: label ?? `#${value}` }))
  const params = { ...(status ? { status } : {}), ...(referrer ? { referred_by: referrer } : {}) }
  const q = useQuery({ queryKey: ['leads', params], queryFn: () => api.get('/leads', { params }).then(r => r.data) })
  const reload = () => { qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['leads-referral-summary'] }) }
  const run = async (fn, done) => { try { await fn(); toast(t('common.saved')); done?.(); reload() } catch { /* the interceptor shows it */ } }
  const save = () => run(() => api.post('/leads', { ...form, interested_program_id: form.interested_program_id ? Number(form.interested_program_id) : null,
    follow_up_date: form.follow_up_date || null, guardian_name: form.guardian_name || null, current_class: form.current_class || null, note: form.note || null,
    referred_by: form.referred_by ? Number(form.referred_by) : null }), () => setForm(null))
  const patch = (l, body) => run(() => api.put(`/leads/${l.id}`, body))
  const convert = (l) => run(() => api.post(`/leads/${l.id}/convert`, admit.batch_id ? { batch_ids: [Number(admit.batch_id)] } : {}), () => setAdmit(null))
  const remove = (l) => { if (window.confirm(t('common.delete_confirm', { name: l.name }))) run(() => api.delete(`/leads/${l.id}`)) }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('leads.title')} actions={!form && <Button onClick={() => setForm(blank)}><Plus aria-hidden="true" className="h-4 w-4" />{t('leads.new')}</Button>} />
      {q.data?.meta?.follow_up_today > 0 && <Card data-testid="leads-today"><p className="text-sm">{t('leads.follow_up_today', { n: q.data.meta.follow_up_today })}</p></Card>}
      {form && (
        <Card className="grid gap-3 sm:grid-cols-2" data-testid="lead-form">
          <Input label={t('leads.name')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Input ltr inputMode="tel" label={t('leads.phone')} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          <Input label={t('leads.guardian')} value={form.guardian_name} onChange={e => setForm(f => ({ ...f, guardian_name: e.target.value }))} />
          <Input label={t('leads.current_class')} value={form.current_class} onChange={e => setForm(f => ({ ...f, current_class: e.target.value }))} />
          <Select label={t('leads.interested', { program: term('program') })} placeholder="—" value={form.interested_program_id} onChange={e => setForm(f => ({ ...f, interested_program_id: e.target.value }))}
            options={(programs.data ?? []).map(p => ({ value: String(p.id), label: p.name }))} />
          <Select label={t('leads.source')} value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} options={SOURCES.map(v => ({ value: v, label: t(`leads.sources.${v}`) }))} />
          <Input type="date" ltr label={t('leads.follow_up')} value={form.follow_up_date} onChange={e => setForm(f => ({ ...f, follow_up_date: e.target.value }))} />
          <Select label={t('referrals.referrer')} placeholder={t('referrals.no_referrer')} value={form.referred_by} onChange={e => setForm(f => ({ ...f, referred_by: e.target.value }))} options={referrers} />
          <Textarea className="sm:col-span-2" rows={2} label={t('leads.note')} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setForm(null)}>{t('common.cancel')}</Button>
            <Button onClick={save} disabled={!form.name || !form.phone}>{t('common.save')}</Button>
          </div>
        </Card>
      )}
      <Card className="flex flex-col gap-3" data-testid="referral-summary">
        <h2 className="font-semibold">{t('referrals.summary')}</h2>
        <div className="flex flex-wrap items-end gap-2">
          <Input type="date" ltr label={t('referrals.from')} value={period.from} onChange={e => setPeriod(p => ({ ...p, from: e.target.value }))} />
          <Input type="date" ltr label={t('referrals.to')} value={period.to} onChange={e => setPeriod(p => ({ ...p, to: e.target.value }))} />
        </div>
        {summary.isPending ? <Loader type="skeleton" rows={2} /> : summary.isError || !summary.data?.meta ? <ErrorState onRetry={summary.refetch} /> : !summary.data.data.length
          ? <p className="text-sm text-content-muted">{t('referrals.summary_none')}</p> : (
          <ul className="flex flex-col gap-1 text-sm">
            {summary.data.data.map(r => <li key={r.user_id} className="flex flex-wrap justify-between gap-2"><span dir="auto">{r.name ?? `#${r.user_id}`}</span>
              <span>{t('referrals.row', { n: r.applications, admitted: r.admitted })}</span></li>)}
            <li className="flex justify-between gap-2 font-medium [border-top:1px_solid_var(--line)] pt-1"><span>{t('referrals.total')}</span>
              <span>{t('referrals.row', { n: summary.data.meta.applications, admitted: summary.data.meta.admitted })}</span></li>
          </ul>
        )}
      </Card>
      <div className="grid gap-2 sm:grid-cols-2 max-w-xl">
        <Select label={t('leads.status')} value={status} onChange={e => setStatus(e.target.value)}
          options={[{ value: '', label: t('leads.all') }, ...[...STATUSES, 'enrolled'].map(v => ({ value: v, label: t(`leads.statuses.${v}`) }))]} />
        <Select label={t('referrals.referrer')} value={referrer} onChange={e => setReferrer(e.target.value)}
          options={[{ value: '', label: t('leads.all') }, ...referrers]} />
      </div>
      {q.isPending ? <Loader type="cards" count={2} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.data.length ? <EmptyState title={t('leads.none')} /> : q.data.data.map(l => (
        <Card key={l.id} className="flex flex-col gap-2" data-testid="lead">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold"><span dir="auto">{l.name}</span> · <Ltr>{l.phone}</Ltr></h2>
            <span className="text-sm">{t(`leads.statuses.${l.status}`)}{l.source && <> · {t(`leads.sources.${l.source}`, l.source)}</>}</span>
          </div>
          <p className="text-sm text-content-muted" dir="auto">
            {[l.guardian_name, l.current_class, l.program, l.batch].filter(Boolean).join(' · ')}{l.follow_up_date && <> · {t('leads.follow_up')}: <Ltr>{l.follow_up_date}</Ltr></>}
          </p>
          {(l.message || l.note) && <p className="text-sm" dir="auto">{[l.message, l.note].filter(Boolean).join(' — ')}</p>}
          {isAdmin ? (
            <div className="max-w-xs"><Select label={t('referrals.referrer')} placeholder={t('referrals.no_referrer')} value={l.referred_by ? String(l.referred_by) : ''}
              onChange={e => patch(l, { referred_by: e.target.value ? Number(e.target.value) : null })}
              options={referrers.some(o => o.value === String(l.referred_by)) || !l.referred_by ? referrers : [...referrers, { value: String(l.referred_by), label: l.referrer ?? `#${l.referred_by}` }]} /></div>
          ) : l.referrer && <p className="text-sm">{t('referrals.referrer')}: <span dir="auto">{l.referrer}</span></p>}
          {l.status !== 'enrolled' && (
            <div className="flex flex-wrap items-end gap-2">
              <Select label={t('leads.status')} value={l.status} onChange={e => patch(l, { status: e.target.value })} options={STATUSES.map(v => ({ value: v, label: t(`leads.statuses.${v}`) }))} />
              <Input type="date" ltr label={t('leads.follow_up')} value={l.follow_up_date ?? ''} onChange={e => patch(l, { follow_up_date: e.target.value || null })} />
              <Button onClick={() => setAdmit(admit?.id === l.id ? null : { id: l.id, batch_id: l.interested_batch_id ? String(l.interested_batch_id) : '' })}>{t('leads.admit')}</Button>
              <Button variant="ghost" onClick={() => remove(l)}>{t('common.delete')}</Button>
            </div>
          )}
          {admit?.id === l.id && (
            <div className="flex flex-wrap items-end gap-2" data-testid="lead-admit">
              <Select className="grow" label={term('batch')} placeholder={t('leads.no_batch')} value={admit.batch_id} onChange={e => setAdmit(a => ({ ...a, batch_id: e.target.value }))}
                options={(batches.data ?? []).filter(b => !l.interested_program_id || String(b.program_id ?? b.program?.id) === String(l.interested_program_id)).map(b => ({ value: String(b.id), label: b.name }))} />
              <Button onClick={() => convert(l)}>{t('leads.admit_confirm')}</Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}
