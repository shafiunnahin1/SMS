import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtMoney } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import Tabs from '../../ui/variants/Tabs'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'
import { useStaffCan } from '../../features/staff/StaffDepartment'

const fieldErrors = (e) => Object.fromEntries(Object.entries(e.response?.data?.errors ?? {}).map(([k, m]) => [k, m[0]]))
const nul = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === '' ? null : v]))

// D229 TRN.2 /admin|staff/transport: vehicles; routes with their stops and riders, putting a student on a route (by the ID card
// number) and taking them off. Staff see the same page; the server allows reading with staff.transport.read and every change
// with staff.transport.manage.
export default function Transport() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('routes')
  return (
    <div className="flex flex-col gap-4" data-testid="transport">
      <PageHeader title={t('trn.title')} />
      <Tabs label={t('trn.title')} value={tab} onChange={setTab} items={['routes', 'vehicles'].map(k => ({ key: k, label: t(`trn.tabs.${k}`) }))} />
      {tab === 'vehicles' ? <Vehicles /> : <Routes />}
    </div>
  )
}

function Vehicles() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const canManage = useStaffCan('staff.transport.manage')
  const list = useQuery({ queryKey: ['transport', 'vehicles'], queryFn: () => api.get('/transport/vehicles').then(r => r.data.data) })
  const blank = { name: '', number_plate: '', capacity: '', driver_name: '', driver_phone: '', helper_name: '', status: 'active' }
  const [f, setF] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [errors, setErrors] = useState({})
  const save = async (e) => {
    e.preventDefault(); setErrors({})
    const body = nul({ ...f, capacity: f.capacity === '' ? '' : Number(f.capacity) })
    try {
      if (editing) await api.put(`/transport/vehicles/${editing}`, body); else await api.post('/transport/vehicles', body)
      setF(blank); setEditing(null); qc.invalidateQueries({ queryKey: ['transport'] }); useUiStore.getState().addToast(t('trn.saved'))
    } catch (err) { setErrors(fieldErrors(err)) }
  }
  const remove = (v) => useUiStore.getState().openConfirm({ title: t('trn.remove_vehicle'), description: v.name, confirmLabel: t('common.delete'), type: 'danger',
    onConfirm: async () => { try { await api.delete(`/transport/vehicles/${v.id}`); qc.invalidateQueries({ queryKey: ['transport'] }) } catch { /* shown by the interceptor */ } } })
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className={canManage ? 'lg:col-span-2' : 'lg:col-span-3'}>
        {list.isPending ? <Loader type="skeleton" rows={3} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : !list.data.length ? <EmptyState title={t('trn.no_vehicles')} /> : (
          <ul className="flex flex-col divide-y divide-line">
            {list.data.map(v => (
              <li key={v.id} className="py-2 flex flex-wrap items-center gap-2" data-testid="vehicle">
                <span className="font-medium" dir="auto">{v.name}</span>
                <Ltr className="text-sm text-content-muted">{v.number_plate}</Ltr>
                <span className="text-sm">{t('trn.seats', { n: v.capacity })}</span>
                {v.driver_name && <span className="text-sm" dir="auto">· {v.driver_name} {v.driver_phone && <Ltr>{v.driver_phone}</Ltr>}</span>}
                <span className="rounded-full px-2 py-0.5 text-xs bg-surface-muted font-medium">{t(`trn.statuses.${v.status}`)}</span>
                {canManage && <span className="ms-auto flex gap-1">
                  <Button variant="ghost" onClick={() => { setEditing(v.id); setF(Object.fromEntries(Object.keys(blank).map(k => [k, v[k] == null ? '' : String(v[k])]))) }} data-action="edit">{t('common.edit')}</Button>
                  <Button variant="ghost" onClick={() => remove(v)} data-action="remove">{t('common.delete')}</Button>
                </span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {canManage && <Card>
        <form className="flex flex-col gap-2" onSubmit={save} data-testid="vehicle-form">
          <h2 className="font-semibold">{editing ? t('trn.edit_vehicle') : t('trn.add_vehicle')}</h2>
          {['name', 'number_plate', 'capacity', 'driver_name', 'driver_phone', 'helper_name'].map(k => (
            <Input key={k} name={k} label={t(`trn.f.${k}`)} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} error={errors[k]}
              required={['name', 'number_plate', 'capacity'].includes(k)} ltr={['number_plate', 'capacity', 'driver_phone'].includes(k)} inputMode={k === 'capacity' ? 'numeric' : k === 'driver_phone' ? 'tel' : undefined} />
          ))}
          <Select name="status" label={t('trn.f.status')} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} options={['active', 'maintenance', 'inactive'].map(s => ({ value: s, label: t(`trn.statuses.${s}`) }))} />
          <div className="flex gap-2"><Button type="submit" data-action="save-vehicle">{t('common.save')}</Button>{editing && <Button variant="ghost" onClick={() => { setEditing(null); setF(blank) }}>{t('common.cancel')}</Button>}</div>
        </form>
      </Card>}
    </div>
  )
}

function Routes() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const canManage = useStaffCan('staff.transport.manage')
  const routes = useQuery({ queryKey: ['transport', 'routes'], queryFn: () => api.get('/transport/routes').then(r => r.data.data) })
  const vehicles = useQuery({ queryKey: ['transport', 'vehicles'], queryFn: () => api.get('/transport/vehicles').then(r => r.data.data) })
  const [open, setOpen] = useState(null)
  const blank = { name: '', vehicle_id: '', morning_departure: '', afternoon_departure: '', monthly_fee: '' }
  const [f, setF] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [errors, setErrors] = useState({})
  const save = async (e) => {
    e.preventDefault(); setErrors({})
    const body = nul({ ...f, vehicle_id: f.vehicle_id === '' ? '' : Number(f.vehicle_id) })
    try {
      if (editing) await api.put(`/transport/routes/${editing}`, body); else await api.post('/transport/routes', body)
      setF(blank); setEditing(null); qc.invalidateQueries({ queryKey: ['transport'] }); useUiStore.getState().addToast(t('trn.saved'))
    } catch (err) { setErrors(fieldErrors(err)) }
  }
  const remove = (r) => useUiStore.getState().openConfirm({ title: t('trn.remove_route'), description: r.name, confirmLabel: t('common.delete'), type: 'danger',
    onConfirm: async () => { try { await api.delete(`/transport/routes/${r.id}`); if (open === r.id) setOpen(null); qc.invalidateQueries({ queryKey: ['transport'] }) } catch { /* shown by the interceptor */ } } })
  const current = routes.data?.find(r => r.id === open)
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className={`${canManage ? 'lg:col-span-2' : 'lg:col-span-3'} flex flex-col gap-4`}>
        <Card>
          {routes.isPending ? <Loader type="skeleton" rows={3} /> : routes.isError ? <ErrorState onRetry={routes.refetch} /> : !routes.data.length ? <EmptyState title={t('trn.no_routes')} /> : (
            <ul className="flex flex-col divide-y divide-line">
              {routes.data.map(r => (
                <li key={r.id} className="py-2 flex flex-wrap items-center gap-2" data-testid="route" aria-current={open === r.id || undefined}>
                  <button type="button" className="font-medium text-primary-fg" dir="auto" onClick={() => setOpen(open === r.id ? null : r.id)} data-action="open">{r.name}</button>
                  {r.vehicle && <span className="text-sm text-content-muted" dir="auto">· {r.vehicle.name}</span>}
                  <span className="text-sm">{r.vehicle ? t('trn.riders_of', { n: r.riders, seats: r.vehicle.capacity }) : t('trn.riders', { n: r.riders })}</span>
                  {r.monthly_fee && <span className="text-sm"><Ltr>{fmtMoney(r.monthly_fee, locale)}</Ltr>{t('trn.per_month')}</span>}
                  {canManage && <span className="ms-auto flex gap-1">
                    <Button variant="ghost" onClick={() => { setEditing(r.id); setF({ name: r.name, vehicle_id: r.vehicle ? String(r.vehicle.id) : '', morning_departure: r.morning_departure ?? '', afternoon_departure: r.afternoon_departure ?? '', monthly_fee: r.monthly_fee ?? '' }) }} data-action="edit">{t('common.edit')}</Button>
                    <Button variant="ghost" onClick={() => remove(r)} data-action="remove">{t('common.delete')}</Button>
                  </span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        {current && <RouteDetail route={current} canManage={canManage} />}
      </div>
      {canManage && <Card>
        <form className="flex flex-col gap-2" onSubmit={save} data-testid="route-form">
          <h2 className="font-semibold">{editing ? t('trn.edit_route') : t('trn.add_route')}</h2>
          <Input name="name" label={t('trn.f.route_name')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={errors.name} required />
          <Select name="vehicle_id" label={t('trn.f.vehicle')} placeholder={t('trn.none')} value={f.vehicle_id} onChange={(e) => setF({ ...f, vehicle_id: e.target.value })} error={errors.vehicle_id}
            options={(vehicles.data ?? []).map(v => ({ value: String(v.id), label: `${v.name} (${v.number_plate})` }))} />
          <div className="grid grid-cols-2 gap-2">
            <Input name="morning_departure" type="time" label={t('trn.f.morning')} ltr value={f.morning_departure} onChange={(e) => setF({ ...f, morning_departure: e.target.value })} error={errors.morning_departure} />
            <Input name="afternoon_departure" type="time" label={t('trn.f.afternoon')} ltr value={f.afternoon_departure} onChange={(e) => setF({ ...f, afternoon_departure: e.target.value })} error={errors.afternoon_departure} />
          </div>
          <Input name="monthly_fee" label={t('trn.f.monthly_fee')} inputMode="decimal" ltr value={f.monthly_fee} onChange={(e) => setF({ ...f, monthly_fee: e.target.value })} error={errors.monthly_fee} hint={t('trn.fee_hint')} />
          <div className="flex gap-2"><Button type="submit" data-action="save-route">{t('common.save')}</Button>{editing && <Button variant="ghost" onClick={() => { setEditing(null); setF(blank) }}>{t('common.cancel')}</Button>}</div>
        </form>
      </Card>}
    </div>
  )
}

function RouteDetail({ route, canManage }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const riders = useQuery({ queryKey: ['transport', 'riders', route.id], queryFn: () => api.get(`/transport/routes/${route.id}/students`).then(r => r.data.data) })
  const [stop, setStop] = useState({ stop_name: '', pickup_time: '', drop_time: '' })
  const [a, setA] = useState({ student_code: '', stop_id: '', direction: 'both', started_on: '' })
  const [errors, setErrors] = useState({})
  const refresh = () => qc.invalidateQueries({ queryKey: ['transport'] })
  const addStop = async (e) => {
    e.preventDefault(); setErrors({})
    try { await api.post(`/transport/routes/${route.id}/stops`, nul(stop)); setStop({ stop_name: '', pickup_time: '', drop_time: '' }); refresh() } catch (err) { setErrors(fieldErrors(err)) }
  }
  const removeStop = async (s) => { try { await api.delete(`/transport/stops/${s.id}`); refresh() } catch { /* shown by the interceptor */ } }
  const assign = async (e) => {
    e.preventDefault(); setErrors({})
    try {
      await api.post('/transport/assign', nul({ route_id: route.id, student_code: a.student_code.trim(), stop_id: a.stop_id === '' ? '' : Number(a.stop_id), direction: a.direction, started_on: a.started_on }))
      setA({ ...a, student_code: '' }); refresh(); useUiStore.getState().addToast(t('trn.assigned'))
    } catch (err) { setErrors(fieldErrors(err)) }
  }
  const unassign = (r) => useUiStore.getState().openConfirm({ title: t('trn.unassign'), description: t('trn.unassign_hint', { name: r.student.name ?? '' }), confirmLabel: t('trn.unassign'),
    onConfirm: async () => { try { await api.post(`/transport/students/${r.student.id}/unassign`, {}); refresh() } catch { /* shown by the interceptor */ } } })
  return (
    <Card className="flex flex-col gap-4" data-testid="route-detail">
      <h2 className="font-semibold" dir="auto">{route.name}</h2>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{t('trn.stops')}</h3>
        {!route.stops.length ? <p className="text-sm text-content-muted">{t('trn.no_stops')}</p> : (
          <ol className="flex flex-col gap-1">
            {route.stops.map(s => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm" data-testid="stop">
                <span className="font-medium">{s.sequence}.</span><span dir="auto">{s.stop_name}</span>
                {s.pickup_time && <span className="text-content-muted">{t('trn.pickup')} <Ltr>{s.pickup_time}</Ltr></span>}
                {s.drop_time && <span className="text-content-muted">{t('trn.drop')} <Ltr>{s.drop_time}</Ltr></span>}
                {canManage && <Button variant="ghost" className="ms-auto" onClick={() => removeStop(s)} data-action="remove-stop">{t('common.delete')}</Button>}
              </li>
            ))}
          </ol>
        )}
        {canManage && <form className="grid gap-2 sm:grid-cols-4 items-end" onSubmit={addStop} data-testid="stop-form">
          <Input name="stop_name" label={t('trn.f.stop_name')} value={stop.stop_name} onChange={(e) => setStop({ ...stop, stop_name: e.target.value })} error={errors.stop_name} required />
          <Input name="pickup_time" type="time" label={t('trn.pickup')} ltr value={stop.pickup_time} onChange={(e) => setStop({ ...stop, pickup_time: e.target.value })} error={errors.pickup_time} />
          <Input name="drop_time" type="time" label={t('trn.drop')} ltr value={stop.drop_time} onChange={(e) => setStop({ ...stop, drop_time: e.target.value })} error={errors.drop_time} />
          <Button type="submit" variant="secondary" data-action="add-stop">{t('trn.add_stop')}</Button>
        </form>}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{t('trn.riders_title')}</h3>
        {canManage && <form className="grid gap-2 sm:grid-cols-2 items-end" onSubmit={assign} data-testid="assign-form">
          <Input name="student_code" label={t('trn.student_code')} ltr value={a.student_code} onChange={(e) => setA({ ...a, student_code: e.target.value })} error={errors.student_code ?? errors.student_id} required />
          <Select name="stop_id" label={t('trn.stop')} placeholder={t('trn.none')} value={a.stop_id} onChange={(e) => setA({ ...a, stop_id: e.target.value })} error={errors.stop_id}
            options={route.stops.map(s => ({ value: String(s.id), label: s.stop_name }))} />
          <Select name="direction" label={t('trn.direction')} value={a.direction} onChange={(e) => setA({ ...a, direction: e.target.value })} options={['both', 'pickup_only', 'drop_only'].map(d => ({ value: d, label: t(`trn.directions.${d}`) }))} />
          <Input name="started_on" type="date" label={t('trn.started_on')} ltr value={a.started_on} onChange={(e) => setA({ ...a, started_on: e.target.value })} error={errors.started_on} hint={t('trn.started_hint')} />
          <div><Button type="submit" disabled={!a.student_code.trim()} data-action="assign">{t('trn.assign')}</Button></div>
        </form>}
        {riders.isPending ? <Loader type="skeleton" rows={2} /> : riders.isError ? <ErrorState onRetry={riders.refetch} /> : !riders.data.length ? <p className="text-sm text-content-muted">{t('trn.no_riders')}</p> : (
          <ul className="flex flex-col divide-y divide-line" data-testid="rider-list">
            {riders.data.map(r => (
              <li key={r.id} className="py-2 flex flex-wrap items-center gap-2 text-sm" data-testid="rider">
                <span className="font-medium" dir="auto">{r.student.name}</span><Ltr className="text-content-muted">{r.student.student_id}</Ltr>
                {r.stop && <span dir="auto">· {r.stop.stop_name}</span>}
                <span className="text-content-muted">{t(`trn.directions.${r.direction}`)}</span>
                {canManage && <Button variant="ghost" className="ms-auto" onClick={() => unassign(r)} data-action="unassign">{t('trn.unassign')}</Button>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  )
}
