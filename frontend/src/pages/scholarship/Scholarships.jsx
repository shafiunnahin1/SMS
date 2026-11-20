import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'
import { useStaffCan } from '../../features/staff/StaffDepartment'

const fieldErrors = (e) => Object.fromEntries(Object.entries(e.response?.data?.errors ?? {}).map(([k, m]) => [k, m[0]]))

/** "৫০% of the monthly tuition" or "৳ 2500.00" (shared with the family pages) */
export function Benefit({ s }) {
  const { t } = useTranslation()
  return s.benefit === 'percentage'
    ? <span>{t('sch.pct_benefit', { pct: s.percentage })}</span>
    : <span>{t('sch.amount_benefit')} <Ltr>৳ {s.amount}</Ltr></span>
}

// D236 SCH.2 /admin/scholarships (and /staff/scholarships in SCH.3): the scholarships with their slots and pending count; create
// (exactly one benefit), close; one scholarship's applications - approve / reject once, revoke an approval with a reason. Read-only
// staff get no form or buttons.
export default function Scholarships() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const canManage = useStaffCan('staff.scholarship.manage')
  const [status, setStatus] = useState('')
  const [open, setOpen] = useState(null)
  const list = useQuery({ queryKey: ['scholarships', status], queryFn: () => api.get('/scholarships', { params: { status: status || undefined } }).then(r => r.data.data) })
  const years = useQuery({ queryKey: ['academic-years'], retry: false, queryFn: () => api.get('/academic-years').then(r => r.data.data) })
  const apps = useQuery({ queryKey: ['scholarships', 'apps', open], enabled: !!open, queryFn: () => api.get(`/scholarships/${open}/applications`).then(r => r.data.data) })
  const blank = { name: '', benefit: 'percentage', value: '', funded_by: '', criteria: '', description: '', academic_year_id: '', total_slots: '', application_deadline: '' }
  const [f, setF] = useState(blank)
  const [errors, setErrors] = useState({})
  const [revoking, setRevoking] = useState(null)
  const [reason, setReason] = useState('')
  const refresh = () => qc.invalidateQueries({ queryKey: ['scholarships'] })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const create = async (e) => {
    e.preventDefault(); setErrors({})
    const { benefit, value, ...rest } = f
    const body = Object.fromEntries(Object.entries({ ...rest, [benefit]: value }).map(([k, v]) => [k, v === '' ? null : v]))
    try {
      await api.post('/scholarships', body)
      setF(blank); refresh(); useUiStore.getState().addToast(t('sch.saved'))
    } catch (err) { const fe = fieldErrors(err); setErrors({ ...fe, value: fe.amount ?? fe.percentage }) }
  }
  const close = (s) => useUiStore.getState().openConfirm({ title: t('sch.close'), description: t('sch.close_hint', { name: s.name }), confirmLabel: t('sch.close'),
    onConfirm: async () => { try { await api.patch(`/scholarships/${s.id}/close`); refresh() } catch { /* shown by the interceptor */ } } })
  const decide = (a, decision) => useUiStore.getState().openConfirm({ title: t(`sch.${decision}`), description: t(`sch.${decision}_hint`, { name: a.student.name }), confirmLabel: t(`sch.${decision}`),
    onConfirm: async () => { try { await api.patch(`/scholarships/applications/${a.id}/award`, { decision }); refresh() } catch { /* shown by the interceptor */ } } })
  const revoke = async (e) => {
    e.preventDefault()
    try { await api.patch(`/scholarships/applications/${revoking}/revoke`, { reason }); setRevoking(null); setReason(''); refresh() } catch { /* shown by the interceptor */ }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="scholarships">
      <PageHeader title={t('sch.title')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2"><h2 className="font-semibold me-auto">{t('sch.list')}</h2>
            <Select name="status_filter" label={t('sch.status')} placeholder={t('sch.all')} value={status} onChange={(e) => setStatus(e.target.value)} className="w-40"
              options={['open', 'awarded', 'closed'].map(x => ({ value: x, label: t(`sch.statuses.${x}`) }))} /></div>
          {list.isPending ? <Loader type="skeleton" rows={3} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : !list.data.length ? <EmptyState title={t('sch.none')} /> : (
            <ul className="flex flex-col divide-y divide-line" data-testid="scholarship-list">{list.data.map(s => (
              <li key={s.id} className={`py-2 flex flex-col gap-1 ${open === s.id ? 'bg-surface-muted' : ''}`} data-testid="scholarship" data-status={s.status}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium" dir="auto">{s.name}</span>
                  <span className="rounded-full px-2 py-0.5 text-xs bg-primary-soft text-primary-fg">{t(`sch.statuses.${s.status}`)}</span>
                </div>
                <p className="text-sm"><Benefit s={s} />{s.funded_by && <span className="text-content-muted" dir="auto"> · {s.funded_by}</span>}</p>
                <p className="text-xs text-content-muted">
                  {s.total_slots != null ? t('sch.slots', { left: s.available_slots, total: s.total_slots }) : t('sch.no_limit')}
                  {s.application_deadline && <> · {t('sch.deadline')}: <Ltr>{s.application_deadline}</Ltr></>}
                  {s.academic_year && <> · {s.academic_year.name}</>}
                  {' · '}{t('sch.counts', { all: s.applications_count, pending: s.pending_count })}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setOpen(s.id)} data-action="applications">{t('sch.applications')}</Button>
                  {canManage && s.status !== 'closed' && <Button variant="ghost" onClick={() => close(s)} data-action="close">{t('sch.close')}</Button>}
                </div>
              </li>
            ))}</ul>
          )}
        </Card>

        <Card className="flex flex-col gap-3">
          {open ? (apps.isPending ? <Loader type="skeleton" rows={3} /> : apps.isError ? <ErrorState onRetry={apps.refetch} /> : <>
            <div className="flex flex-wrap items-baseline gap-2"><h2 className="font-semibold me-auto" dir="auto">{apps.data.scholarship.name}</h2>
              <Button variant="ghost" onClick={() => { setOpen(null); setRevoking(null) }}>{t('common.close')}</Button></div>
            {!apps.data.applications.length ? <EmptyState title={t('sch.no_applications')} /> : (
              <ul className="flex flex-col divide-y divide-line" data-testid="application-list">{apps.data.applications.map(a => (
                <li key={a.id} className="py-2 flex flex-col gap-1" data-testid="application" data-status={a.status}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium" dir="auto">{a.student.name}</span><Ltr className="text-xs text-content-muted">{a.student.student_id}</Ltr>
                    <span className="rounded-full px-2 py-0.5 text-xs bg-surface-muted text-content">{t(`sch.app_statuses.${a.status}`)}</span>
                  </div>
                  <p className="text-sm" dir="auto">{a.reason}</p>
                  <p className="text-xs text-content-muted">
                    {a.gpa && <>{t('sch.gpa')}: <Ltr>{a.gpa}</Ltr> · </>}{a.household_income && <>{t('sch.income')}: <span dir="auto">{a.household_income}</span> · </>}
                    {a.decided_by && <>{t('sch.decided_by')}: <span dir="auto">{a.decided_by.name}</span></>}
                  </p>
                  {canManage && a.status === 'pending' && <div className="flex flex-wrap gap-2">
                    <Button onClick={() => decide(a, 'approved')} data-action="approve">{t('sch.approved')}</Button>
                    <Button variant="secondary" onClick={() => decide(a, 'rejected')} data-action="reject">{t('sch.rejected')}</Button>
                  </div>}
                  {canManage && a.status === 'approved' && (revoking === a.id ? (
                    <form className="flex flex-wrap items-end gap-2" onSubmit={revoke} data-testid="revoke-form">
                      <Input name="reason" label={t('sch.revoke_reason')} value={reason} onChange={(e) => setReason(e.target.value)} className="flex-1 min-w-40" required />
                      <Button type="submit" data-action="confirm-revoke">{t('sch.revoke')}</Button>
                      <Button variant="ghost" onClick={() => setRevoking(null)}>{t('common.cancel')}</Button>
                    </form>
                  ) : <div><Button variant="ghost" onClick={() => { setRevoking(a.id); setReason('') }} data-action="revoke">{t('sch.revoke')}</Button></div>)}
                </li>
              ))}</ul>
            )}
          </>) : canManage ? (
            <form className="flex flex-col gap-2" onSubmit={create} data-testid="scholarship-form">
              <h2 className="font-semibold">{t('sch.new')}</h2>
              <Input name="name" label={t('sch.name')} value={f.name} onChange={set('name')} error={errors.name} required />
              <div className="grid grid-cols-2 gap-2">
                <Select name="benefit" label={t('sch.benefit')} value={f.benefit} onChange={set('benefit')} options={[{ value: 'percentage', label: t('sch.by_percentage') }, { value: 'amount', label: t('sch.by_amount') }]} />
                <Input name="value" type="number" step="0.01" min="0.01" max={f.benefit === 'percentage' ? 100 : undefined} ltr label={f.benefit === 'percentage' ? t('sch.percentage') : t('sch.amount')} value={f.value} onChange={set('value')} error={errors.value} required />
              </div>
              <p className="text-xs text-content-muted">{f.benefit === 'percentage' ? t('sch.pct_hint') : t('sch.amount_hint')}</p>
              <div className="grid grid-cols-2 gap-2">
                <Input name="total_slots" type="number" min="1" ltr label={t('sch.total_slots')} value={f.total_slots} onChange={set('total_slots')} error={errors.total_slots} />
                <Input name="application_deadline" type="date" ltr label={t('sch.deadline')} value={f.application_deadline} onChange={set('application_deadline')} error={errors.application_deadline} />
              </div>
              {years.isSuccess && years.data.length > 0 && <Select name="academic_year_id" label={t('sch.year')} placeholder={t('sch.any_year')} value={f.academic_year_id} onChange={set('academic_year_id')} error={errors.academic_year_id}
                options={years.data.map(y => ({ value: String(y.id), label: y.name }))} />}
              <Input name="funded_by" label={t('sch.funded_by')} value={f.funded_by} onChange={set('funded_by')} error={errors.funded_by} />
              <Textarea name="criteria" label={t('sch.criteria')} rows={2} value={f.criteria} onChange={set('criteria')} error={errors.criteria} />
              <Textarea name="description" label={t('sch.description')} rows={2} value={f.description} onChange={set('description')} error={errors.description} />
              <div><Button type="submit" data-action="save-scholarship">{t('common.save')}</Button></div>
            </form>
          ) : <p className="text-sm text-content-muted">{t('sch.pick_hint')}</p>}
        </Card>
      </div>
    </div>
  )
}
