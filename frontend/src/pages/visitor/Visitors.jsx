import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'
import { useStaffCan } from '../../features/staff/StaffDepartment'
import Tabs from '../../ui/variants/Tabs'

const fieldErrors = (e) => Object.fromEntries(Object.entries(e.response?.data?.errors ?? {}).map(([k, m]) => [k, m[0]]))
const today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10)
const time = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')
const ID_TYPES = ['nid', 'passport', 'driving_license', 'other']
const FIELDS = ['visitor_name', 'purpose', 'visitor_phone', 'whom_to_meet', 'department', 'id_type', 'id_number', 'badge_no']

// D240 VIS.2 /admin/visitors and /staff/visitors: today's visitors (inside now / left, search), a check-in form with an optional
// photo, check-out, the admin's same-day correction, and a printable date-range report. Read-only staff see the lists only.
export default function Visitors() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const isAdmin = useAuthStore((s) => s.user?.role) === 'admin'
  const canManage = useStaffCan('staff.visitor.manage')
  const [tab, setTab] = useState('today')
  const [q, setQ] = useState('')
  const [range, setRange] = useState({ from: today(), to: today() })
  const day = useQuery({ queryKey: ['visitors', 'day', q], enabled: tab === 'today', queryFn: () => api.get('/visitors', { params: { q: q.trim() || undefined } }).then(r => r.data.data) })
  const report = useQuery({ queryKey: ['visitors', 'report', range], enabled: tab === 'report', queryFn: () => api.get('/visitors/report', { params: range }).then(r => r.data.data) })
  const blank = Object.fromEntries(FIELDS.map(k => [k, k === 'id_type' ? 'nid' : '']))
  const [f, setF] = useState(blank)
  const [photo, setPhoto] = useState(null)
  const [editing, setEditing] = useState(null)
  const [errors, setErrors] = useState({})
  const [photoKey, setPhotoKey] = useState(0)
  const refresh = () => qc.invalidateQueries({ queryKey: ['visitors'] })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const reset = () => { setF(blank); setPhoto(null); setEditing(null); setErrors({}); setPhotoKey(k => k + 1) }

  const save = async (e) => {
    e.preventDefault(); setErrors({})
    try {
      if (editing) {
        await api.put(`/visitors/${editing}`, Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v])))
      } else {
        const fd = new FormData()
        Object.entries(f).forEach(([k, v]) => { if (v !== '') fd.append(k, v) })
        if (photo) fd.append('photo', photo)
        await api.post('/visitors/check-in', fd)
      }
      reset(); refresh(); useUiStore.getState().addToast(t('vis.saved'))
    } catch (err) { setErrors(fieldErrors(err)) }
  }
  const checkOut = (v) => useUiStore.getState().openConfirm({ title: t('vis.check_out'), description: t('vis.check_out_hint', { name: v.visitor_name }), confirmLabel: t('vis.check_out'),
    onConfirm: async () => { try { await api.patch(`/visitors/${v.id}/check-out`); refresh() } catch { /* shown by the interceptor */ } } })
  const edit = (v) => { setEditing(v.id); setF(Object.fromEntries(FIELDS.map(k => [k, v[k] ?? (k === 'id_type' ? 'nid' : '')]))); setErrors({}) }

  const Row = ({ v }) => (
    <li className="py-2 flex flex-col gap-1" data-testid="visitor" data-state={v.check_out ? 'left' : 'inside'}>
      <div className="flex flex-wrap items-center gap-2">
        {v.photo_url && <img src={v.photo_url} alt="" className="h-10 w-10 rounded-full object-cover" />}
        <span className="font-medium" dir="auto">{v.visitor_name}</span>
        {v.badge_no && <span className="rounded-full px-2 py-0.5 text-xs bg-surface-muted text-content">{t('vis.badge')} <Ltr>{v.badge_no}</Ltr></span>}
        <span className="text-xs text-content-muted"><Ltr>{time(v.check_in)}</Ltr>{v.check_out && <> – <Ltr>{time(v.check_out)}</Ltr></>}</span>
      </div>
      <p className="text-sm" dir="auto">{v.purpose}{v.whom_to_meet && <span className="text-content-muted"> · {t('vis.to_meet')}: {v.whom_to_meet}</span>}{v.department && <span className="text-content-muted"> · {v.department}</span>}</p>
      {(v.visitor_phone || v.id_number) && <p className="text-xs text-content-muted">{v.visitor_phone && <Ltr>{v.visitor_phone}</Ltr>}{v.id_number && <> · {t(`vis.id_types.${v.id_type ?? 'other'}`)} <Ltr>{v.id_number}</Ltr></>}</p>}
      <div className="flex flex-wrap gap-2">
        {canManage && !v.check_out && <Button variant="secondary" onClick={() => checkOut(v)} data-action="check-out">{t('vis.check_out')}</Button>}
        {isAdmin && <Button variant="ghost" onClick={() => edit(v)} data-action="edit">{t('vis.correct')}</Button>}
      </div>
    </li>
  )

  return (
    <div className="flex flex-col gap-4" data-testid="visitors">
      <PageHeader title={t('vis.title')} />
      <Tabs items={['today', 'report'].map(k => ({ key: k, label: t(`vis.tabs.${k}`) }))} value={tab} onChange={setTab} label={t('vis.title')} />
      {tab === 'today' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col gap-3">
            <Input name="q" label={t('vis.search')} value={q} onChange={(e) => setQ(e.target.value)} />
            {day.isPending ? <Loader type="skeleton" rows={3} /> : day.isError ? <ErrorState onRetry={day.refetch} /> : <>
              <h2 className="font-semibold">{t('vis.inside', { n: day.data.inside.length })}</h2>
              {!day.data.inside.length ? <p className="text-sm text-content-muted">{t('vis.none_inside')}</p>
                : <ul className="flex flex-col divide-y divide-line" data-testid="inside">{day.data.inside.map(v => <Row key={v.id} v={v} />)}</ul>}
              <h2 className="font-semibold">{t('vis.left', { n: day.data.left.length })}</h2>
              {!day.data.left.length ? <p className="text-sm text-content-muted">{t('vis.none_left')}</p>
                : <ul className="flex flex-col divide-y divide-line" data-testid="left">{day.data.left.map(v => <Row key={v.id} v={v} />)}</ul>}
            </>}
          </Card>
          {(canManage || editing) && <Card>
            <form className="flex flex-col gap-2" onSubmit={save} data-testid="visitor-form">
              <h2 className="font-semibold">{editing ? t('vis.correct') : t('vis.new')}</h2>
              <Input name="visitor_name" label={t('vis.f.visitor_name')} value={f.visitor_name} onChange={set('visitor_name')} error={errors.visitor_name} required />
              <Input name="purpose" label={t('vis.f.purpose')} value={f.purpose} onChange={set('purpose')} error={errors.purpose} required />
              <div className="grid grid-cols-2 gap-2">
                <Input name="visitor_phone" label={t('vis.f.visitor_phone')} ltr value={f.visitor_phone} onChange={set('visitor_phone')} error={errors.visitor_phone} />
                <Input name="badge_no" label={t('vis.f.badge_no')} ltr value={f.badge_no} onChange={set('badge_no')} error={errors.badge_no} />
                <Input name="whom_to_meet" label={t('vis.f.whom_to_meet')} value={f.whom_to_meet} onChange={set('whom_to_meet')} error={errors.whom_to_meet} />
                <Input name="department" label={t('vis.f.department')} value={f.department} onChange={set('department')} error={errors.department} />
                <Select name="id_type" label={t('vis.f.id_type')} value={f.id_type} onChange={set('id_type')} options={ID_TYPES.map(x => ({ value: x, label: t(`vis.id_types.${x}`) }))} />
                <Input name="id_number" label={t('vis.f.id_number')} ltr value={f.id_number} onChange={set('id_number')} error={errors.id_number} />
              </div>
              {!editing && <label className="flex flex-col gap-1 text-sm">{t('vis.f.photo')}
                <input key={photoKey} type="file" name="photo" accept="image/jpeg,image/png,image/webp" capture="user" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
                {errors.photo && <span className="text-danger text-xs">{errors.photo}</span>}</label>}
              <p className="text-xs text-content-muted">{t('vis.privacy_hint')}</p>
              <div className="flex gap-2"><Button type="submit" data-action="save-visitor">{editing ? t('common.save') : t('vis.check_in')}</Button>
                {editing && <Button variant="ghost" onClick={reset}>{t('common.cancel')}</Button>}</div>
            </form>
          </Card>}
        </div>
      ) : (
        <Card className="flex flex-col gap-3" data-testid="visitor-report">
          <div className="flex flex-wrap items-end gap-2 print:hidden">
            <Input name="from" type="date" ltr label={t('vis.from')} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="w-44" />
            <Input name="to" type="date" ltr label={t('vis.to')} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="w-44" />
            <Button variant="secondary" onClick={() => window.print()} data-action="print">{t('vis.print')}</Button>
          </div>
          {report.isPending ? <Loader type="skeleton" rows={3} /> : report.isError ? <ErrorState onRetry={report.refetch} /> : <>
            <p className="font-semibold" data-testid="report-total">{t('vis.total', { n: report.data.total })}</p>
            {!report.data.total ? <EmptyState title={t('vis.none_report')} /> : <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><h3 className="text-sm font-semibold">{t('vis.per_day')}</h3>
                  <ul className="text-sm">{Object.entries(report.data.per_day).map(([d, n]) => <li key={d} className="flex justify-between"><Ltr>{d}</Ltr><span>{n}</span></li>)}</ul></div>
                <div><h3 className="text-sm font-semibold">{t('vis.per_purpose')}</h3>
                  <ul className="text-sm" data-testid="per-purpose">{Object.entries(report.data.per_purpose).map(([p, n]) => <li key={p} className="flex justify-between"><span dir="auto">{p}</span><span>{n}</span></li>)}</ul></div>
              </div>
              <table className="w-full text-sm">
                <thead><tr className="text-start text-content-muted"><th className="text-start">{t('vis.f.visitor_name')}</th><th className="text-start">{t('vis.f.purpose')}</th><th className="text-start">{t('vis.in')}</th><th className="text-start">{t('vis.out')}</th></tr></thead>
                <tbody>{report.data.entries.map(v => <tr key={v.id} className="border-t border-line"><td dir="auto">{v.visitor_name}</td><td dir="auto">{v.purpose}</td>
                  <td><Ltr>{v.check_in?.slice(0, 10)} {time(v.check_in)}</Ltr></td><td><Ltr>{time(v.check_out)}</Ltr></td></tr>)}</tbody>
              </table>
            </>}
          </>}
        </Card>
      )}
    </div>
  )
}
