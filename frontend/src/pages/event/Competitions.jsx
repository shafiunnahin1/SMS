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
import { Input } from '../../components/FormField'
import { useStaffCan } from '../../features/staff/StaffDepartment'
import Tabs from '../../ui/variants/Tabs'

const fieldErrors = (e) => Object.fromEntries(Object.entries(e.response?.data?.errors ?? {}).map(([k, m]) => [k, m[0]]))
const thisMonth = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 7)
const monthStart = () => `${thisMonth()}-01`
const today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10)

// D242 EVT.2 /admin/events and /staff/events: the month's events; for one event the attendance of registered students and the
// results (add by the student's ID, correct, remove); a printable points table per class. Read-only staff see everything, change nothing.
export default function Competitions() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const canManage = useStaffCan('staff.event.manage')
  const [tab, setTab] = useState('events')
  const [month, setMonth] = useState(thisMonth())
  const [open, setOpen] = useState(null)
  const [range, setRange] = useState({ from: monthStart(), to: today() })
  const events = useQuery({ queryKey: ['competitions', month], enabled: tab === 'events', queryFn: () => api.get('/events/competitions', { params: { month } }).then(r => r.data.data) })
  const one = useQuery({ queryKey: ['competitions', 'one', open], enabled: !!open, queryFn: () => api.get(`/events/${open}/competition`).then(r => r.data.data) })
  const points = useQuery({ queryKey: ['competitions', 'points', range], enabled: tab === 'points', queryFn: () => api.get('/events/points', { params: range }).then(r => r.data.data) })
  const blank = { student_code: '', position: '', award: '', points: '', remarks: '', certificate_issued: false }
  const [f, setF] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [errors, setErrors] = useState({})
  const refresh = () => qc.invalidateQueries({ queryKey: ['competitions'] })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const mark = async (studentId, status) => { try { await api.patch(`/events/${open}/attendance/${studentId}`, { status }); refresh() } catch { /* interceptor */ } }
  const markAll = async () => { try { await api.patch(`/events/${open}/attendance`, { status: 'attended' }); refresh() } catch { /* interceptor */ } }
  const save = async (e) => {
    e.preventDefault(); setErrors({})
    const body = Object.fromEntries(Object.entries(f).filter(([k]) => !editing || k !== 'student_code').map(([k, v]) => [k, v === '' ? null : v]))
    try {
      if (editing) await api.put(`/event-results/${editing}`, body); else await api.post(`/events/${open}/results`, body)
      setF(blank); setEditing(null); refresh(); useUiStore.getState().addToast(t('evt.saved'))
    } catch (err) { setErrors(fieldErrors(err)) }
  }
  const remove = (r) => useUiStore.getState().openConfirm({ title: t('evt.remove'), description: t('evt.remove_hint', { name: r.student.name }), confirmLabel: t('evt.remove'), type: 'danger',
    onConfirm: async () => { try { await api.delete(`/event-results/${r.id}`); refresh() } catch { /* interceptor */ } } })
  const edit = (r) => { setEditing(r.id); setF({ student_code: '', position: r.position ?? '', award: r.award ?? '', points: r.points ?? '', remarks: r.remarks ?? '', certificate_issued: !!r.certificate_issued }) }
  const pick = (code) => { setEditing(null); setF({ ...blank, student_code: code }) }

  return (
    <div className="flex flex-col gap-4" data-testid="competitions">
      <PageHeader title={t('evt.title')} />
      <Tabs items={['events', 'points'].map(k => ({ key: k, label: t(`evt.tabs.${k}`) }))} value={tab} onChange={setTab} label={t('evt.title')} />
      {tab === 'events' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="flex flex-col gap-3">
            <Input name="month" type="month" ltr label={t('evt.month')} value={month} onChange={(e) => { setMonth(e.target.value); setOpen(null) }} className="w-48" />
            {events.isPending ? <Loader type="skeleton" rows={3} /> : events.isError ? <ErrorState onRetry={events.refetch} /> : !events.data.length ? <EmptyState title={t('evt.none')} /> : (
              <ul className="flex flex-col divide-y divide-line" data-testid="event-list">{events.data.map(e => (
                <li key={e.id} className={`py-2 flex flex-wrap items-center gap-2 ${open === e.id ? 'bg-surface-muted' : ''}`} data-testid="event">
                  <span className="font-medium me-auto" dir="auto">{e.title}</span>
                  <span className="text-xs text-content-muted"><Ltr>{e.event_date}</Ltr>{e.registration_required && <> · {t('evt.registered', { n: e.registrations_count })}</>} · {t('evt.results_n', { n: e.results_count })}</span>
                  <Button variant="secondary" onClick={() => { setOpen(e.id); setEditing(null); setF(blank) }} data-action="open">{t('evt.open')}</Button>
                </li>
              ))}</ul>
            )}
          </Card>
          <Card className="flex flex-col gap-3">
            {!open ? <p className="text-sm text-content-muted">{t('evt.pick_hint')}</p> : one.isPending ? <Loader type="skeleton" rows={3} /> : one.isError ? <ErrorState onRetry={one.refetch} /> : <>
              <h2 className="font-semibold" dir="auto">{one.data.event.title} · <Ltr>{one.data.event.event_date}</Ltr></h2>
              {!one.data.event.started && <p className="text-sm text-content-muted" data-testid="not-started">{t('evt.not_started')}</p>}
              {one.data.event.registration_required && <section className="flex flex-col gap-2" data-testid="attendance">
                <div className="flex items-center gap-2"><h3 className="text-sm font-semibold me-auto">{t('evt.attendance')}</h3>
                  {canManage && one.data.event.started && one.data.registrations.length > 0 && <Button variant="ghost" onClick={markAll} data-action="all-attended">{t('evt.all_attended')}</Button>}</div>
                {!one.data.registrations.length ? <p className="text-sm text-content-muted">{t('evt.no_registrations')}</p> : (
                  <ul className="flex flex-col divide-y divide-line text-sm">{one.data.registrations.map(r => (
                    <li key={r.student.id} className="py-1 flex flex-wrap items-center gap-2" data-testid="registration" data-status={r.status}>
                      <span className="me-auto" dir="auto">{r.student.name} <Ltr className="text-content-muted">{r.student.student_id}</Ltr></span>
                      <span className="text-xs text-content-muted">{t(`evt.statuses.${r.status}`)}</span>
                      {canManage && one.data.event.started && <>
                        <Button variant={r.status === 'attended' ? 'primary' : 'ghost'} onClick={() => mark(r.student.id, 'attended')} data-action="attended">{t('evt.statuses.attended')}</Button>
                        <Button variant={r.status === 'absent' ? 'primary' : 'ghost'} onClick={() => mark(r.student.id, 'absent')} data-action="absent">{t('evt.statuses.absent')}</Button>
                        {r.status === 'attended' && <Button variant="ghost" onClick={() => pick(r.student.student_id)} data-action="pick">{t('evt.give_result')}</Button>}
                      </>}
                    </li>
                  ))}</ul>
                )}
              </section>}
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">{t('evt.results')}</h3>
                {!one.data.results.length ? <p className="text-sm text-content-muted">{t('evt.no_results')}</p> : (
                  <ul className="flex flex-col divide-y divide-line text-sm" data-testid="results">{one.data.results.map(r => (
                    <li key={r.id} className="py-1 flex flex-wrap items-center gap-2" data-testid="result">
                      <span className="font-medium">{r.position ? t('evt.position', { n: r.position }) : '—'}</span>
                      <span className="me-auto" dir="auto">{r.student.name}{r.award && <span className="text-content-muted"> · {r.award}</span>}</span>
                      <span className="text-xs text-content-muted">{t('evt.points_n', { n: r.points })}{r.certificate_issued && <> · {t('evt.certificate')}</>}</span>
                      {canManage && <><Button variant="ghost" onClick={() => edit(r)} data-action="edit">{t('evt.correct')}</Button>
                        <Button variant="ghost" onClick={() => remove(r)} data-action="remove">{t('evt.remove')}</Button></>}
                    </li>
                  ))}</ul>
                )}
              </section>
              {canManage && one.data.event.started && <form className="flex flex-col gap-2 border-t border-line pt-3" onSubmit={save} data-testid="result-form">
                <h3 className="font-semibold">{editing ? t('evt.correct') : t('evt.add_result')}</h3>
                {!editing && <Input name="student_code" label={t('evt.student_code')} ltr value={f.student_code} onChange={set('student_code')} error={errors.student_code ?? errors.student_id} required />}
                <div className="grid grid-cols-2 gap-2">
                  <Input name="position" type="number" min="1" ltr label={t('evt.f_position')} value={f.position} onChange={set('position')} error={errors.position} />
                  <Input name="points" type="number" min="0" ltr label={t('evt.f_points')} value={f.points} onChange={set('points')} error={errors.points} />
                </div>
                <Input name="award" label={t('evt.f_award')} value={f.award} onChange={set('award')} error={errors.award} />
                <Input name="remarks" label={t('evt.f_remarks')} value={f.remarks} onChange={set('remarks')} error={errors.remarks} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="certificate_issued" checked={f.certificate_issued} onChange={set('certificate_issued')} />{t('evt.certificate')}</label>
                {one.data.event.registration_required && <p className="text-xs text-content-muted">{t('evt.attended_only')}</p>}
                <div className="flex gap-2"><Button type="submit" data-action="save-result">{t('common.save')}</Button>
                  {editing && <Button variant="ghost" onClick={() => { setEditing(null); setF(blank) }}>{t('common.cancel')}</Button>}</div>
              </form>}
            </>}
          </Card>
        </div>
      ) : (
        <Card className="flex flex-col gap-3" data-testid="points">
          <div className="flex flex-wrap items-end gap-2 print:hidden">
            <Input name="from" type="date" ltr label={t('evt.from')} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} className="w-44" />
            <Input name="to" type="date" ltr label={t('evt.to')} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} className="w-44" />
            <Button variant="secondary" onClick={() => window.print()} data-action="print">{t('evt.print')}</Button>
          </div>
          {points.isPending ? <Loader type="skeleton" rows={3} /> : points.isError ? <ErrorState onRetry={points.refetch} /> : !points.data.classes.length ? <EmptyState title={t('evt.no_points')} /> : (
            <table className="w-full text-sm" data-testid="points-table">
              <thead><tr className="text-content-muted"><th className="text-start">{t('evt.class')}</th><th className="text-end">{t('evt.f_points')}</th><th className="text-end">{t('evt.firsts')}</th><th className="text-end">{t('evt.results')}</th></tr></thead>
              <tbody>{points.data.classes.map((c, i) => <tr key={c.program?.id ?? `none-${i}`} className="border-t border-line">
                <td dir="auto">{c.program?.name ?? t('evt.no_class')}</td><td className="text-end">{c.points}</td><td className="text-end">{c.firsts}</td><td className="text-end">{c.results}</td></tr>)}</tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  )
}
