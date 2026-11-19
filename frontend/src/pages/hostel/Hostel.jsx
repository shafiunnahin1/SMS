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
import { HostelPicker, Mess, Meals, Bazar, Visitors, Attendance } from './HostelDaily'

const fieldErrors = (e) => Object.fromEntries(Object.entries(e.response?.data?.errors ?? {}).map(([k, m]) => [k, m[0]]))
const nul = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === '' ? null : v]))

// D233 HST.2 /admin/hostel and /staff/hostel: hostels with occupancy, a hostel's rooms, allocations (put a student in a room by the
// ID card number, check out, past stays) and the occupancy report. Staff without staff.hostel.manage only read (useStaffCan).
export default function Hostel() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('allocations')
  const [hostel, setHostel] = useState(null)
  return (
    <div className="flex flex-col gap-4" data-testid="hostel">
      <PageHeader title={t('hst.title')} />
      <Tabs label={t('hst.title')} value={tab} onChange={setTab} items={TABS.map(k => ({ key: k, label: t(`hst.tabs.${k}`) }))} />
      {DAILY[tab] && <HostelPicker value={hostel} onChange={setHostel} />}
      {DAILY[tab] && (() => { const Part = DAILY[tab]; return <Part hostelId={hostel} /> })()}
      {tab === 'hostels' && <Hostels onRooms={(h) => { setHostel(h.id); setTab('rooms') }} />}
      {tab === 'rooms' && <Rooms hostelId={hostel} onPick={setHostel} />}
      {tab === 'allocations' && <Allocations />}
      {tab === 'report' && <Report />}
    </div>
  )
}

// D233 HST.5: the daily parts work on the picked hostel
const TABS = ['allocations', 'attendance', 'meals', 'mess', 'bazar', 'visitors', 'hostels', 'rooms', 'report']
const DAILY = { attendance: Attendance, meals: Meals, mess: Mess, bazar: Bazar, visitors: Visitors }

const useHostels = () => useQuery({ queryKey: ['hostel', 'list'], queryFn: () => api.get('/hostel').then(r => r.data.data) })

function Hostels({ onRooms }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const canManage = useStaffCan('staff.hostel.manage')
  const list = useHostels()
  const blank = { name: '', type: 'boys', warden_name: '', warden_phone: '' }
  const [f, setF] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [errors, setErrors] = useState({})
  const save = async (e) => {
    e.preventDefault(); setErrors({})
    try {
      if (editing) await api.put(`/hostel/${editing}`, nul(f)); else await api.post('/hostel', nul(f))
      setF(blank); setEditing(null); qc.invalidateQueries({ queryKey: ['hostel'] }); useUiStore.getState().addToast(t('hst.saved'))
    } catch (err) { setErrors(fieldErrors(err)) }
  }
  const remove = (h) => useUiStore.getState().openConfirm({ title: t('hst.remove_hostel'), description: h.name, confirmLabel: t('common.delete'), type: 'danger',
    onConfirm: async () => { try { await api.delete(`/hostel/${h.id}`); qc.invalidateQueries({ queryKey: ['hostel'] }) } catch { /* shown by the interceptor */ } } })
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className={canManage ? 'lg:col-span-2' : 'lg:col-span-3'}>
        {list.isPending ? <Loader type="skeleton" rows={3} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : !list.data.length ? <EmptyState title={t('hst.no_hostels')} /> : (
          <ul className="flex flex-col divide-y divide-line">
            {list.data.map(h => (
              <li key={h.id} className="py-2 flex flex-wrap items-center gap-2" data-testid="hostel-row">
                <button type="button" className="font-medium text-primary-fg" dir="auto" onClick={() => onRooms(h)} data-action="rooms">{h.name}</button>
                <span className="rounded-full px-2 py-0.5 text-xs bg-surface-muted font-medium">{t(`hst.types.${h.type}`)}</span>
                <span className="text-sm">{t('hst.occupancy', { occupied: h.occupied, seats: h.seats, rooms: h.total_rooms })}</span>
                {h.warden_name && <span className="text-sm text-content-muted" dir="auto">· {h.warden_name} {h.warden_phone && <Ltr>{h.warden_phone}</Ltr>}</span>}
                {canManage && <span className="ms-auto flex gap-1">
                  <Button variant="ghost" onClick={() => { setEditing(h.id); setF({ name: h.name, type: h.type, warden_name: h.warden_name ?? '', warden_phone: h.warden_phone ?? '' }) }} data-action="edit">{t('common.edit')}</Button>
                  <Button variant="ghost" onClick={() => remove(h)} data-action="remove">{t('common.delete')}</Button>
                </span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {canManage && <Card>
        <form className="flex flex-col gap-2" onSubmit={save} data-testid="hostel-form">
          <h2 className="font-semibold">{editing ? t('hst.edit_hostel') : t('hst.add_hostel')}</h2>
          <Input name="name" label={t('hst.f.name')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} error={errors.name} required />
          <Select name="type" label={t('hst.f.type')} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} error={errors.type} options={['boys', 'girls'].map(x => ({ value: x, label: t(`hst.types.${x}`) }))} />
          <Input name="warden_name" label={t('hst.f.warden_name')} value={f.warden_name} onChange={(e) => setF({ ...f, warden_name: e.target.value })} error={errors.warden_name} />
          <Input name="warden_phone" label={t('hst.f.warden_phone')} ltr inputMode="tel" value={f.warden_phone} onChange={(e) => setF({ ...f, warden_phone: e.target.value })} error={errors.warden_phone} />
          <div className="flex gap-2"><Button type="submit" data-action="save-hostel">{t('common.save')}</Button>{editing && <Button variant="ghost" onClick={() => { setEditing(null); setF(blank) }}>{t('common.cancel')}</Button>}</div>
        </form>
      </Card>}
    </div>
  )
}

function Rooms({ hostelId, onPick }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const canManage = useStaffCan('staff.hostel.manage')
  const hostels = useHostels()
  const current = hostelId ?? hostels.data?.[0]?.id
  const rooms = useQuery({ queryKey: ['hostel', 'rooms', current], enabled: !!current, queryFn: () => api.get(`/hostel/${current}/rooms`).then(r => r.data.data) })
  const blank = { room_number: '', floor: '1', capacity: '', monthly_fee: '' }
  const [f, setF] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [errors, setErrors] = useState({})
  const save = async (e) => {
    e.preventDefault(); setErrors({})
    const body = nul({ ...f, floor: f.floor === '' ? '' : Number(f.floor), capacity: f.capacity === '' ? '' : Number(f.capacity) })
    try {
      if (editing) await api.put(`/hostel/${current}/rooms/${editing}`, body); else await api.post(`/hostel/${current}/rooms`, body)
      setF(blank); setEditing(null); qc.invalidateQueries({ queryKey: ['hostel'] }); useUiStore.getState().addToast(t('hst.saved'))
    } catch (err) { setErrors(fieldErrors(err)) }
  }
  const remove = (r) => useUiStore.getState().openConfirm({ title: t('hst.remove_room'), description: r.room_number, confirmLabel: t('common.delete'), type: 'danger',
    onConfirm: async () => { try { await api.delete(`/hostel/${current}/rooms/${r.id}`); qc.invalidateQueries({ queryKey: ['hostel'] }) } catch { /* shown by the interceptor */ } } })
  if (hostels.isPending) return <Loader type="skeleton" rows={3} />
  if (hostels.isError) return <ErrorState onRetry={hostels.refetch} />
  if (!hostels.data.length) return <EmptyState title={t('hst.no_hostels')} />
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className={`${canManage ? 'lg:col-span-2' : 'lg:col-span-3'} flex flex-col gap-3`}>
        <Select name="hostel" label={t('hst.hostel')} value={String(current)} onChange={(e) => { onPick(Number(e.target.value)); setEditing(null); setF(blank) }} className="sm:w-72"
          options={hostels.data.map(h => ({ value: String(h.id), label: `${h.name} (${t(`hst.types.${h.type}`)})` }))} />
        {rooms.isPending ? <Loader type="skeleton" rows={3} /> : rooms.isError ? <ErrorState onRetry={rooms.refetch} /> : !rooms.data.length ? <EmptyState title={t('hst.no_rooms')} /> : (
          <ul className="flex flex-col divide-y divide-line">
            {rooms.data.map(r => (
              <li key={r.id} className="py-2 flex flex-wrap items-center gap-3" data-testid="room-row">
                <span className="font-medium">{t('hst.room_n', { n: r.room_number })}</span>
                <span className="text-sm text-content-muted">{t('hst.floor_n', { n: r.floor })}</span>
                <span className="flex items-center gap-2 text-sm">
                  <span className="h-2 w-20 rounded-full bg-surface-muted overflow-hidden" aria-hidden="true"><span className="block h-full bg-primary" style={{ width: `${Math.min(100, Math.round(100 * r.occupied / Math.max(1, r.capacity)))}%` }} /></span>
                  {t('hst.seats_of', { occupied: r.occupied, capacity: r.capacity })}
                </span>
                {r.monthly_fee && <span className="text-sm"><Ltr>{fmtMoney(r.monthly_fee, locale)}</Ltr>{t('hst.per_month')}</span>}
                {canManage && <span className="ms-auto flex gap-1">
                  <Button variant="ghost" onClick={() => { setEditing(r.id); setF({ room_number: r.room_number, floor: String(r.floor), capacity: String(r.capacity), monthly_fee: r.monthly_fee ?? '' }) }} data-action="edit">{t('common.edit')}</Button>
                  <Button variant="ghost" onClick={() => remove(r)} data-action="remove">{t('common.delete')}</Button>
                </span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {canManage && <Card>
        <form className="flex flex-col gap-2" onSubmit={save} data-testid="room-form">
          <h2 className="font-semibold">{editing ? t('hst.edit_room') : t('hst.add_room')}</h2>
          <div className="grid grid-cols-2 gap-2">
            <Input name="room_number" label={t('hst.f.room_number')} ltr value={f.room_number} onChange={(e) => setF({ ...f, room_number: e.target.value })} error={errors.room_number} required />
            <Input name="floor" label={t('hst.f.floor')} inputMode="numeric" ltr value={f.floor} onChange={(e) => setF({ ...f, floor: e.target.value })} error={errors.floor} />
          </div>
          <Input name="capacity" label={t('hst.f.capacity')} inputMode="numeric" ltr value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} error={errors.capacity} required />
          <Input name="monthly_fee" label={t('hst.f.monthly_fee')} inputMode="decimal" ltr value={f.monthly_fee} onChange={(e) => setF({ ...f, monthly_fee: e.target.value })} error={errors.monthly_fee} hint={t('hst.fee_hint')} />
          <div className="flex gap-2"><Button type="submit" data-action="save-room">{t('common.save')}</Button>{editing && <Button variant="ghost" onClick={() => { setEditing(null); setF(blank) }}>{t('common.cancel')}</Button>}</div>
        </form>
      </Card>}
    </div>
  )
}

function Allocations() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const canManage = useStaffCan('staff.hostel.manage')
  const [status, setStatus] = useState('active')
  const list = useQuery({ queryKey: ['hostel', 'allocations', status], queryFn: () => api.get('/hostel/allocations', { params: { status } }).then(r => r.data.data) })
  const free = useQuery({ queryKey: ['hostel', 'free'], enabled: canManage, queryFn: () => api.get('/hostel/available-rooms').then(r => r.data.data) })
  const [a, setA] = useState({ student_code: '', room_id: '', check_in_date: '' })
  const [errors, setErrors] = useState({})
  const allocate = async (e) => {
    e.preventDefault(); setErrors({})
    try {
      await api.post('/hostel/allocate', nul({ student_code: a.student_code.trim(), room_id: Number(a.room_id), check_in_date: a.check_in_date }))
      setA({ student_code: '', room_id: '', check_in_date: '' }); qc.invalidateQueries({ queryKey: ['hostel'] }); useUiStore.getState().addToast(t('hst.allocated'))
    } catch (err) { setErrors(fieldErrors(err)) }
  }
  const setMess = async (x) => { try { await api.put(`/hostel/allocations/${x.id}/mess`, { with_mess: !x.with_mess }); qc.invalidateQueries({ queryKey: ['hostel'] }) } catch { /* shown by the interceptor */ } }
  const checkout = (x) => useUiStore.getState().openConfirm({ title: t('hst.checkout'), description: t('hst.checkout_hint', { name: x.student.name ?? '' }), confirmLabel: t('hst.checkout'),
    onConfirm: async () => { try { await api.patch(`/hostel/allocations/${x.id}/checkout`, {}); qc.invalidateQueries({ queryKey: ['hostel'] }) } catch { /* shown by the interceptor */ } } })
  return (
    <div className="flex flex-col gap-4">
      {canManage && <Card>
        <form className="grid gap-3 sm:grid-cols-4 items-end" onSubmit={allocate} data-testid="allocate-form">
          <Input name="student_code" label={t('hst.student_code')} ltr value={a.student_code} onChange={(e) => setA({ ...a, student_code: e.target.value })} error={errors.student_code ?? errors.student_id} required />
          <Select name="room_id" label={t('hst.free_room')} placeholder={t('hst.pick')} value={a.room_id} onChange={(e) => setA({ ...a, room_id: e.target.value })} error={errors.room_id}
            options={(free.data ?? []).map(r => ({ value: String(r.id), label: `${r.hostel.name} · ${t('hst.room_n', { n: r.room_number })} (${r.capacity - r.occupied})` }))} />
          <Input name="check_in_date" type="date" label={t('hst.check_in')} ltr value={a.check_in_date} onChange={(e) => setA({ ...a, check_in_date: e.target.value })} error={errors.check_in_date} hint={t('hst.check_in_hint')} />
          <Button type="submit" disabled={!a.student_code.trim() || !a.room_id} data-action="allocate">{t('hst.allocate')}</Button>
        </form>
      </Card>}
      <Card className="flex flex-col gap-3">
        <Select name="status" label={t('hst.show')} value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-56" options={['active', 'checked_out'].map(s => ({ value: s, label: t(`hst.statuses.${s}`) }))} />
        {list.isPending ? <Loader type="skeleton" rows={3} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : !list.data.length ? <EmptyState title={t(`hst.none_${status}`)} /> : (
          <ul className="flex flex-col divide-y divide-line" data-testid="allocation-list">
            {list.data.map(x => (
              <li key={x.id} className="py-2 flex flex-wrap items-center gap-2 text-sm" data-testid="allocation">
                <span className="font-medium" dir="auto">{x.student.name}</span><Ltr className="text-content-muted">{x.student.student_id}</Ltr>
                <span dir="auto">· {x.hostel.name} · {t('hst.room_n', { n: x.room.room_number })}</span>
                <span className="text-content-muted">{t('hst.since')} <Ltr>{x.check_in_date}</Ltr>{x.check_out_date && <> – <Ltr>{x.check_out_date}</Ltr></>}</span>
                {x.status === 'active' && <label className="ms-auto inline-flex items-center gap-1.5"><input type="checkbox" checked={x.with_mess} disabled={!canManage} onChange={() => setMess(x)} data-action="with-mess" />{t('hst.with_mess')}</label>}
                {canManage && x.status === 'active' && <Button variant="ghost" onClick={() => checkout(x)} data-action="checkout">{t('hst.checkout')}</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Report() {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['hostel', 'report'], queryFn: () => api.get('/hostel/reports/occupancy').then(r => r.data.data) })
  if (q.isPending) return <Loader type="skeleton" rows={3} />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  if (!q.data.length) return <EmptyState title={t('hst.no_hostels')} />
  return (
    <Card><div className="overflow-x-auto"><table className="w-full text-sm" data-testid="occupancy-report">
      <thead><tr className="text-start text-content-muted">{['hostel', 'rooms', 'seats', 'occupied', 'free'].map(k => <th key={k} className="py-2 pe-3 text-start font-medium">{t(`hst.r.${k}`)}</th>)}</tr></thead>
      <tbody className="divide-y divide-line">{q.data.map(h => (
        <tr key={h.id}><td className="py-2 pe-3" dir="auto">{h.name} <span className="text-content-muted">({t(`hst.types.${h.type}`)})</span></td><td className="pe-3">{h.rooms}</td><td className="pe-3">{h.seats}</td><td className="pe-3">{h.occupied}</td><td className="pe-3 font-medium">{h.free}</td></tr>
      ))}</tbody>
    </table></div></Card>
  )
}
