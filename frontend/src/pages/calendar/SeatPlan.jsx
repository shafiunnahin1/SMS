import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useCrud } from '../../features/academic/useCrud'
import { usePrint } from '../../hooks/usePrint'
import { useTerms } from '../../hooks/useTerms'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'

// D213 CAL.3: pick an exam, list its rooms (name, seats, benches a row), generate the plan in roll order, move a student to a
// free seat, print the room-wise PDF
export default function SeatPlan() {
  const { t } = useTranslation()
  const term = useTerms()
  const qc = useQueryClient()
  const exams = useCrud('exams').list
  const { preview, loading } = usePrint()
  const [examId, setExamId] = useState('')
  const [rooms, setRooms] = useState([{ name: '', capacity: '', columns: '5' }])
  const [busy, setBusy] = useState(false)
  const [move, setMove] = useState({})
  const plan = useQuery({ queryKey: ['seat-plan', examId], enabled: !!examId, queryFn: () => api.get(`/exams/${examId}/seat-plan`).then(r => r.data.data) })
  const setRoom = (i, k) => (e) => setRooms(rooms.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)))
  const refresh = () => qc.invalidateQueries({ queryKey: ['seat-plan', examId] })
  const generate = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post(`/exams/${examId}/seat-plan/generate`, { rooms: rooms.map(r => ({ name: r.name.trim(), capacity: Number(r.capacity), columns: r.columns ? Number(r.columns) : null })) })
    } catch { /* the interceptor shows the error */ } finally { setBusy(false); refresh() }
  }
  const doMove = async (sid) => {
    const m = move[sid] ?? {}
    if (!m.room || !m.seat) return
    try { await api.put(`/exams/${examId}/seat-plan/${sid}`, { room_name: m.room, seat_number: m.seat.trim() }); setMove({ ...move, [sid]: {} }) } catch { /* the interceptor shows the error */ } finally { refresh() }
  }
  const examOptions = (exams.data ?? []).map(x => ({ value: String(x.id), label: x.name + (x.program?.name ? ` (${x.program.name})` : '') }))
  const total = rooms.reduce((n, r) => n + (Number(r.capacity) || 0), 0)
  return (
    <div className="flex flex-col gap-4" data-testid="seat-plan">
      <Card>
        <Select name="exam" label={t('seat.exam')} placeholder={t('seat.pick_exam')} options={examOptions} value={examId} onChange={(e) => setExamId(e.target.value)} />
      </Card>
      {examId && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <form className="flex flex-col gap-3" onSubmit={generate} data-testid="rooms-form">
              <h2 className="font-semibold">{t('seat.rooms')}</h2>
              {rooms.map((r, i) => (
                <div key={i} className="grid gap-2 grid-cols-3 items-end">
                  <Input name={`room-${i}`} label={t('seat.room_name')} value={r.name} onChange={setRoom(i, 'name')} required maxLength={50} />
                  <Input name={`capacity-${i}`} type="number" min="1" label={t('seat.capacity')} value={r.capacity} onChange={setRoom(i, 'capacity')} required ltr />
                  <Input name={`columns-${i}`} type="number" min="1" max="20" label={t('seat.columns')} value={r.columns} onChange={setRoom(i, 'columns')} ltr />
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => setRooms([...rooms, { name: '', capacity: '', columns: '5' }])} data-action="add-room">{t('seat.add_room')}</Button>
                {rooms.length > 1 && <Button variant="ghost" onClick={() => setRooms(rooms.slice(0, -1))}>{t('seat.remove_room')}</Button>}
              </div>
              <p className="text-sm text-content-muted">{t('seat.summary', { seats: total, students: plan.data?.students ?? 0 })}</p>
              <div><Button type="submit" disabled={busy} data-action="generate">{t('seat.generate')}</Button></div>
            </form>
          </Card>
          <Card>
            {plan.isLoading ? <Loader /> : plan.isError ? <ErrorState onRetry={plan.refetch} /> : !plan.data.rooms.length ? <EmptyState title={t('seat.none')} /> : (
              <div className="flex flex-col gap-4" data-testid="plan">
                <div><Button onClick={() => preview(`/exams/${examId}/seat-plan/print`)} disabled={loading} data-action="print">{t('seat.print')}</Button></div>
                {plan.data.rooms.map(room => (
                  <section key={room.name} className="flex flex-col gap-1">
                    <h3 className="font-semibold">{t('seat.room_name')}: {room.name} · {t('seat.count', { count: room.seats.length })}</h3>
                    <ul className="flex flex-col divide-y divide-line text-sm">
                      {room.seats.map(st => (
                        <li key={st.student_id} className="py-1 flex flex-wrap items-center gap-2">
                          <span className="font-medium">{t('seat.seat')} {st.seat_number}</span>
                          <span>{st.name} ({st.code}){st.roll != null ? ` · ${t('seat.roll')} ${st.roll}` : ''}{st.batch ? ` · ${term('batch')} ${st.batch}` : ''}</span>
                          <span className="inline-flex gap-1 items-end">
                            <Select aria-label={t('seat.to_room')} name={`to-room-${st.student_id}`} placeholder={t('seat.to_room')} options={plan.data.rooms.map(x => ({ value: x.name, label: x.name }))}
                              value={move[st.student_id]?.room ?? ''} onChange={(e) => setMove({ ...move, [st.student_id]: { ...move[st.student_id], room: e.target.value } })} />
                            <Input aria-label={t('seat.to_seat')} name={`to-seat-${st.student_id}`} placeholder={t('seat.to_seat')} className="w-20" ltr value={move[st.student_id]?.seat ?? ''}
                              onChange={(e) => setMove({ ...move, [st.student_id]: { ...move[st.student_id], seat: e.target.value } })} />
                            <Button variant="ghost" onClick={() => doMove(st.student_id)} data-action="move">{t('seat.move')}</Button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
