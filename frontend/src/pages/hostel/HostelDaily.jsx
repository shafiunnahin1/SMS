import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtMoney } from '../../i18n/format'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'
import { useStaffCan } from '../../features/staff/StaffDepartment'

const fieldErrors = (e) => Object.fromEntries(Object.entries(e.response?.data?.errors ?? {}).map(([k, m]) => [k, m[0]]))
const today = () => { const d = new Date(Date.now() + 6 * 3600e3); return d.toISOString().slice(0, 10) }   // Asia/Dhaka
const thisMonth = () => today().slice(0, 7)
const prevMonth = (m) => { const [y, mo] = m.split('-').map(Number); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}` }
const MEALS = ['breakfast', 'lunch', 'dinner']

// D233 HST.5: the daily hostel work - mess settings, month and bills; the meal-off sheet; the bazar book; visitors; night attendance.
// Every part works on one hostel (HostelPicker). Staff without staff.hostel.manage only read (useStaffCan); the server checks again.
export function HostelPicker({ value, onChange }) {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['hostel', 'list'], queryFn: () => api.get('/hostel').then(r => r.data.data) })
  const current = value ?? q.data?.[0]?.id
  useEffect(() => { if (value == null && current) onChange(current) }, [value, current, onChange])
  if (q.isPending) return <Loader type="skeleton" rows={1} />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  if (!q.data.length) return <EmptyState title={t('hst.no_hostels')} />
  return <Select name="hostel" label={t('hst.hostel')} value={String(current)} onChange={(e) => onChange(Number(e.target.value))} className="sm:w-72"
    options={q.data.map(h => ({ value: String(h.id), label: `${h.name} (${t(`hst.types.${h.type}`)})` }))} />
}

export function Mess({ hostelId }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const canManage = useStaffCan('staff.hostel.manage')
  const [month, setMonth] = useState(thisMonth())
  const q = useQuery({ queryKey: ['hostel', 'mess', hostelId, month], enabled: !!hostelId, queryFn: () => api.get(`/hostel/${hostelId}/mess`, { params: { month } }).then(r => r.data.data) })
  const bills = useQuery({ queryKey: ['hostel', 'mess-bills', hostelId, month], enabled: !!q.data?.closed, queryFn: () => api.get(`/hostel/${hostelId}/mess/bills`, { params: { month } }).then(r => r.data.data) })
  const [f, setF] = useState(null)
  const [errors, setErrors] = useState({})
  if (!hostelId) return null
  if (q.isPending) return <Loader type="skeleton" rows={3} />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  const d = q.data
  const s = f ?? d.settings
  const save = async (e) => {
    e.preventDefault(); setErrors({})
    const body = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v === '' ? null : v]))
    try { await api.put(`/hostel/${hostelId}/mess`, body); setF(null); qc.invalidateQueries({ queryKey: ['hostel'] }); useUiStore.getState().addToast(t('hst.saved')) } catch (err) { setErrors(fieldErrors(err)) }
  }
  const close = () => useUiStore.getState().openConfirm({ title: t('hst.mess.close'), description: t('hst.mess.close_hint', { month }), confirmLabel: t('hst.mess.close'),
    onConfirm: async () => { try { await api.post(`/hostel/${hostelId}/mess/close`, { month }); qc.invalidateQueries({ queryKey: ['hostel'] }) } catch { /* shown by the interceptor */ } } })
  const adjust = async (b) => {
    const amount = window.prompt(t('hst.mess.adjust_amount'), '')
    if (!amount) return
    const note = window.prompt(t('hst.mess.adjust_note'), '')
    if (!note) return
    try { await api.post(`/hostel/mess-bills/${b.id}/adjust`, { amount: amount.trim(), note: note.trim() }); qc.invalidateQueries({ queryKey: ['hostel', 'mess-bills'] }) } catch { /* shown by the interceptor */ }
  }
  const field = (k, label) => <Input key={k} name={k} label={label} inputMode="decimal" ltr value={s[k] ?? ''} onChange={(e) => setF({ ...s, [k]: e.target.value })} error={errors[k]} disabled={!canManage} />
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2 flex flex-col gap-3" data-testid="mess-month">
        <div className="flex flex-wrap items-end gap-2">
          <Input name="month" type="month" label={t('hst.mess.month')} ltr value={month} onChange={(e) => setMonth(e.target.value || thisMonth())} className="w-44" />
          <Button variant="ghost" onClick={() => setMonth(prevMonth(thisMonth()))}>{t('hst.mess.last_month')}</Button>
        </div>
        {d.settings.mess_mode === 'none' ? <EmptyState title={t('hst.mess.off')} /> : <>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><dt className="text-content-muted">{t('hst.mess.members')}</dt><dd className="text-lg font-semibold">{d.members}</dd></div>
            <div><dt className="text-content-muted">{t('hst.mess.meals')}</dt><dd className="text-lg font-semibold"><Ltr>{d.meals.weighted}</Ltr></dd></div>
            <div><dt className="text-content-muted">{t('hst.mess.bazar')}</dt><dd className="text-lg font-semibold"><Ltr>{fmtMoney(d.bazar, locale)}</Ltr></dd></div>
            {d.settings.mess_mode === 'meal_rate' && <div><dt className="text-content-muted">{t('hst.mess.rate')}</dt><dd className="text-lg font-semibold"><Ltr>{fmtMoney(d.closed?.meal_rate ?? d.rate_so_far ?? 0, locale)}</Ltr></dd></div>}
          </dl>
          <p className="text-sm text-content-muted">{t('hst.mess.meal_split', { b: d.meals.breakfast, l: d.meals.lunch, d: d.meals.dinner })}</p>
          {d.closed ? <p className="text-sm" data-testid="mess-closed">{t(d.closed.by_job ? 'hst.mess.closed_job' : 'hst.mess.closed_staff', { at: d.closed.at })}</p>
            : d.can_close && canManage ? <div><Button onClick={close} data-action="close-month">{t('hst.mess.close')}</Button></div>
            : <p className="text-sm text-content-muted">{t(d.settings.mess_mode === 'meal_rate' ? 'hst.mess.open_rate' : 'hst.mess.open_auto')}</p>}
          {d.closed && (bills.isPending ? <Loader type="skeleton" rows={2} /> : bills.data && (
            <ul className="flex flex-col divide-y divide-line" data-testid="mess-bills">
              {bills.data.rows.map(b => (
                <li key={b.id} className="py-2 flex flex-wrap items-center gap-2 text-sm" data-testid="mess-bill" data-kind={b.kind}>
                  <span className="font-medium" dir="auto">{b.student.name}</span><Ltr className="text-content-muted">{b.student.student_id}</Ltr>
                  {b.kind === 'bill' ? <span>{t('hst.mess.meals_n', { n: b.meals })}</span> : <span className="text-content-muted" dir="auto">{t('hst.mess.adjustment')}: {b.note}</span>}
                  <span className="font-medium"><Ltr>{fmtMoney(b.amount, locale)}</Ltr></span>
                  {canManage && b.kind === 'bill' && <Button variant="ghost" className="ms-auto" onClick={() => adjust(b)} data-action="adjust">{t('hst.mess.adjust')}</Button>}
                </li>
              ))}
            </ul>
          ))}
        </>}
      </Card>
      <Card>
        <form className="flex flex-col gap-2" onSubmit={save} data-testid="mess-settings">
          <h2 className="font-semibold">{t('hst.mess.settings')}</h2>
          <Select name="mess_mode" label={t('hst.mess.mode')} value={s.mess_mode} onChange={(e) => setF({ ...s, mess_mode: e.target.value })} error={errors.mess_mode} disabled={!canManage}
            options={['none', 'fixed_monthly', 'per_meal', 'meal_rate'].map(m => ({ value: m, label: t(`hst.mess.modes.${m}`) }))} />
          <p className="text-xs text-content-muted">{t(`hst.mess.mode_hint.${s.mess_mode}`)}</p>
          {s.mess_mode === 'fixed_monthly' && field('mess_monthly_fee', t('hst.mess.monthly_fee'))}
          {s.mess_mode === 'per_meal' && MEALS.map(m => field(`${m}_rate`, t(`hst.mess.rate_of.${m}`)))}
          {s.mess_mode === 'meal_rate' && MEALS.map(m => field(`${m}_weight`, t(`hst.mess.weight_of.${m}`)))}
          {canManage && <div><Button type="submit" data-action="save-mess">{t('common.save')}</Button></div>}
        </form>
      </Card>
    </div>
  )
}

export function Meals({ hostelId }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const canManage = useStaffCan('staff.hostel.manage')
  const [date, setDate] = useState(today())
  const q = useQuery({ queryKey: ['hostel', 'meals', hostelId, date], enabled: !!hostelId, queryFn: () => api.get(`/hostel/${hostelId}/meals`, { params: { date } }).then(r => r.data.data) })
  const [edits, setEdits] = useState({})
  if (!hostelId) return null
  const offOf = (m) => edits[m.student.id] ?? m.off
  const toggle = (m, meal) => { const cur = offOf(m); setEdits({ ...edits, [m.student.id]: cur.includes(meal) ? cur.filter(x => x !== meal) : [...cur, meal] }) }
  const save = async () => {
    try {
      await api.put(`/hostel/${hostelId}/meals`, { date, offs: Object.entries(edits).map(([sid, meals]) => ({ student_id: Number(sid), meals })) })
      setEdits({}); qc.invalidateQueries({ queryKey: ['hostel'] }); useUiStore.getState().addToast(t('hst.saved'))
    } catch { /* shown by the interceptor */ }
  }
  return (
    <Card className="flex flex-col gap-3" data-testid="meal-sheet">
      <div className="flex flex-wrap items-end gap-3">
        <Input name="date" type="date" label={t('hst.date')} ltr value={date} onChange={(e) => { setDate(e.target.value || today()); setEdits({}) }} className="w-44" />
        <p className="text-sm text-content-muted">{t('hst.meals.hint')}</p>
      </div>
      {q.isPending ? <Loader type="skeleton" rows={3} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.members.length ? <EmptyState title={t('hst.meals.none')} /> : <>
        {q.data.closed && <p className="text-sm text-content-muted">{t('hst.meals.closed')}</p>}
        <ul className="flex flex-col divide-y divide-line">
          {q.data.members.map(m => (
            <li key={m.student.id} className="py-2 flex flex-wrap items-center gap-3" data-testid="meal-row">
              <span className="font-medium min-w-32" dir="auto">{m.student.name}</span>
              {MEALS.map(meal => {
                const off = offOf(m).includes(meal)
                return (
                  <label key={meal} className="inline-flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={!off} disabled={!canManage || q.data.closed} onChange={() => toggle(m, meal)} aria-label={`${m.student.name} ${t(`hst.meals.${meal}`)}`} />
                    <span className={off ? 'line-through text-content-muted' : ''}>{t(`hst.meals.${meal}`)}</span>
                  </label>
                )
              })}
            </li>
          ))}
        </ul>
        {canManage && !q.data.closed && <div><Button onClick={save} disabled={!Object.keys(edits).length} data-action="save-meals">{t('hst.meals.save')}</Button></div>}
      </>}
    </Card>
  )
}

export function Bazar({ hostelId }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const canManage = useStaffCan('staff.hostel.manage')
  const [month, setMonth] = useState(thisMonth())
  const q = useQuery({ queryKey: ['hostel', 'bazar', hostelId, month], enabled: !!hostelId, queryFn: () => api.get(`/hostel/${hostelId}/bazar`, { params: { month } }).then(r => r.data.data) })
  const [f, setF] = useState({ date: today(), amount: '', note: '', method: 'cash' })
  const [errors, setErrors] = useState({})
  if (!hostelId) return null
  const add = async (e) => {
    e.preventDefault(); setErrors({})
    try { await api.post(`/hostel/${hostelId}/bazar`, { ...f, note: f.note || null }); setF({ ...f, amount: '', note: '' }); qc.invalidateQueries({ queryKey: ['hostel'] }); useUiStore.getState().addToast(t('hst.saved')) } catch (err) { setErrors(fieldErrors(err)) }
  }
  const reverse = (b) => useUiStore.getState().openConfirm({ title: t('hst.bazar.reverse'), description: t('hst.bazar.reverse_hint', { amount: b.amount }), confirmLabel: t('hst.bazar.reverse'), type: 'danger',
    onConfirm: async () => { try { await api.post(`/hostel/bazar/${b.id}/reverse`); qc.invalidateQueries({ queryKey: ['hostel'] }) } catch { /* shown by the interceptor */ } } })
  return (
    <div className="flex flex-col gap-4">
      {canManage && <Card><form className="grid gap-3 sm:grid-cols-5 items-end" onSubmit={add} data-testid="bazar-form">
        <Input name="date" type="date" label={t('hst.date')} ltr value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} error={errors.date} />
        <Input name="amount" label={t('hst.bazar.amount')} inputMode="decimal" ltr value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} error={errors.amount} required />
        <Input name="note" label={t('hst.bazar.note')} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} error={errors.note} />
        <Select name="method" label={t('hst.bazar.method')} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} options={['cash', 'bank', 'bkash', 'nagad', 'rocket', 'other'].map(m => ({ value: m, label: t(`payouts.methods.${m}`) }))} />
        <Button type="submit" data-action="add-bazar">{t('hst.bazar.add')}</Button>
      </form><p className="mt-2 text-xs text-content-muted">{t('hst.bazar.hint')}</p></Card>}
      <Card className="flex flex-col gap-3">
        <Input name="month" type="month" label={t('hst.mess.month')} ltr value={month} onChange={(e) => setMonth(e.target.value || thisMonth())} className="w-44" />
        {q.isPending ? <Loader type="skeleton" rows={3} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.rows.length ? <EmptyState title={t('hst.bazar.none')} /> : <>
          <ul className="flex flex-col divide-y divide-line" data-testid="bazar-list">
            {q.data.rows.map(b => (
              <li key={b.id} className="py-2 flex flex-wrap items-center gap-3 text-sm" data-testid="bazar-row">
                <Ltr className="text-content-muted">{b.date}</Ltr>
                <span className="font-medium"><Ltr>{fmtMoney(b.amount, locale)}</Ltr></span>
                {b.note && <span dir="auto">{b.note}</span>}
                {b.reversal_of_id && <span className="rounded-full px-2 py-0.5 text-xs bg-surface-muted">{t('hst.bazar.reversal')}</span>}
                {b.reversed && <span className="rounded-full px-2 py-0.5 text-xs bg-surface-muted">{t('hst.bazar.reversed')}</span>}
                {canManage && !b.reversal_of_id && !b.reversed && <Button variant="ghost" className="ms-auto" onClick={() => reverse(b)} data-action="reverse">{t('hst.bazar.reverse')}</Button>}
              </li>
            ))}
          </ul>
          <p className="text-sm font-semibold">{t('hst.bazar.total')}: <Ltr>{fmtMoney(q.data.total, locale)}</Ltr></p>
        </>}
      </Card>
    </div>
  )
}

export function Visitors({ hostelId }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const canManage = useStaffCan('staff.hostel.manage')
  const [date, setDate] = useState(today())
  const q = useQuery({ queryKey: ['hostel', 'visitors', hostelId, date], enabled: !!hostelId, queryFn: () => api.get(`/hostel/${hostelId}/visitors`, { params: { date } }).then(r => r.data.data) })
  const blank = { student_code: '', visitor_name: '', relation: '', phone: '', purpose: '' }
  const [f, setF] = useState(blank)
  const [errors, setErrors] = useState({})
  if (!hostelId) return null
  const add = async (e) => {
    e.preventDefault(); setErrors({})
    const body = Object.fromEntries(Object.entries({ ...f, student_code: f.student_code.trim() }).map(([k, v]) => [k, v === '' ? null : v]))
    try { await api.post(`/hostel/${hostelId}/visitors`, body); setF(blank); qc.invalidateQueries({ queryKey: ['hostel', 'visitors'] }); useUiStore.getState().addToast(t('hst.saved')) } catch (err) { setErrors(fieldErrors(err)) }
  }
  const out = async (v) => { try { await api.put(`/hostel/visitors/${v.id}`, { out_at: null }); qc.invalidateQueries({ queryKey: ['hostel', 'visitors'] }) } catch { /* shown by the interceptor */ } }
  return (
    <div className="flex flex-col gap-4">
      {canManage && <Card><form className="grid gap-3 sm:grid-cols-3 items-end" onSubmit={add} data-testid="visitor-form">
        <Input name="student_code" label={t('hst.student_code')} ltr value={f.student_code} onChange={(e) => setF({ ...f, student_code: e.target.value })} error={errors.student_code} required />
        <Input name="visitor_name" label={t('hst.visitors.name')} value={f.visitor_name} onChange={(e) => setF({ ...f, visitor_name: e.target.value })} error={errors.visitor_name} required />
        <Input name="relation" label={t('hst.visitors.relation')} value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })} error={errors.relation} />
        <Input name="phone" label={t('hst.visitors.phone')} ltr inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} error={errors.phone} />
        <Input name="purpose" label={t('hst.visitors.purpose')} value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} error={errors.purpose} />
        <Button type="submit" data-action="add-visitor">{t('hst.visitors.add')}</Button>
      </form></Card>}
      <Card className="flex flex-col gap-3">
        <Input name="date" type="date" label={t('hst.date')} ltr value={date} onChange={(e) => setDate(e.target.value || today())} className="w-44" />
        {q.isPending ? <Loader type="skeleton" rows={3} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.length ? <EmptyState title={t('hst.visitors.none')} /> : (
          <ul className="flex flex-col divide-y divide-line">
            {q.data.map(v => (
              <li key={v.id} className="py-2 flex flex-wrap items-center gap-2 text-sm" data-testid="visitor">
                <span className="font-medium" dir="auto">{v.visitor_name}</span>{v.relation && <span className="text-content-muted" dir="auto">({v.relation})</span>}
                <span dir="auto">→ {v.student.name}</span>
                <span className="text-content-muted"><Ltr>{v.in_at.slice(11)}</Ltr>{v.out_at && <> – <Ltr>{v.out_at.slice(11)}</Ltr></>}</span>
                {v.purpose && <span className="text-content-muted" dir="auto">· {v.purpose}</span>}
                {canManage && !v.out_at && <Button variant="ghost" className="ms-auto" onClick={() => out(v)} data-action="visitor-out">{t('hst.visitors.out')}</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

export function Attendance({ hostelId }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const canManage = useStaffCan('staff.hostel.manage')
  const [date, setDate] = useState(today())
  const q = useQuery({ queryKey: ['hostel', 'attendance', hostelId, date], enabled: !!hostelId, queryFn: () => api.get(`/hostel/${hostelId}/attendance`, { params: { date } }).then(r => r.data.data) })
  const [marks, setMarks] = useState({})
  if (!hostelId) return null
  const statusOf = (r) => marks[r.student.id] ?? r.status
  const save = async () => {
    try {
      await api.put(`/hostel/${hostelId}/attendance`, { date, marks: q.data.rows.map(r => ({ student_id: r.student.id, status: statusOf(r) })).filter(m => m.status !== 'present') })
      setMarks({}); qc.invalidateQueries({ queryKey: ['hostel', 'attendance'] }); useUiStore.getState().addToast(t('hst.att.saved'))
    } catch { /* shown by the interceptor */ }
  }
  return (
    <Card className="flex flex-col gap-3" data-testid="attendance-sheet">
      <div className="flex flex-wrap items-end gap-3">
        <Input name="date" type="date" label={t('hst.date')} ltr value={date} max={today()} onChange={(e) => { setDate(e.target.value || today()); setMarks({}) }} className="w-44" />
        {q.data && <span className="text-sm text-content-muted">{t(q.data.taken ? 'hst.att.taken' : 'hst.att.not_taken')}</span>}
      </div>
      {q.isPending ? <Loader type="skeleton" rows={3} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.rows.length ? <EmptyState title={t('hst.att.none')} /> : <>
        <ul className="flex flex-col divide-y divide-line">
          {q.data.rows.map(r => (
            <li key={r.student.id} className="py-2 flex flex-wrap items-center gap-3" data-testid="attendance-row" data-status={statusOf(r)}>
              <span className="font-medium min-w-32" dir="auto">{r.student.name}</span>
              <span className="text-sm text-content-muted">{t('hst.room_n', { n: r.room_number })}</span>
              <span className="ms-auto inline-flex gap-1" role="radiogroup" aria-label={r.student.name ?? ''}>
                {['present', 'absent', 'leave'].map(st => (
                  <button key={st} type="button" role="radio" aria-checked={statusOf(r) === st} disabled={!canManage}
                    className={`rounded-token px-3 h-8 text-sm border ${statusOf(r) === st ? 'bg-primary text-on-primary border-transparent' : 'bg-surface border-line'}`}
                    onClick={() => setMarks({ ...marks, [r.student.id]: st })} data-action={`mark-${st}`}>{t(`hst.att.${st}`)}</button>
                ))}
              </span>
            </li>
          ))}
        </ul>
        {canManage && <div><Button onClick={save} data-action="save-attendance">{t('hst.att.save')}</Button></div>}
      </>}
    </Card>
  )
}
