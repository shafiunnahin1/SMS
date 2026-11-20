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
import Tabs from '../../ui/variants/Tabs'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'
import { useStaffCan } from '../../features/staff/StaffDepartment'

const fieldErrors = (e) => Object.fromEntries(Object.entries(e.response?.data?.errors ?? {}).map(([k, m]) => [k, m[0]]))
const today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10)   // Asia/Dhaka

/** one meeting's status badge, date, people and dated notes (shared with the parent page) */
export function MeetingCard({ m, children }) {
  const { t } = useTranslation()
  return (
    <li className="py-3 flex flex-col gap-1" data-testid="meeting" data-status={m.status}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium" dir="auto">{m.subject}</span>
        <span className="rounded-full px-2 py-0.5 text-xs bg-surface-muted font-medium">{t(`mtg.statuses.${m.status}`)}</span>
        {m.requested_by === 'parent' && <span className="text-xs text-content-muted">{t('mtg.by_parent')}</span>}
      </div>
      <p className="text-sm text-content-muted">
        <Ltr>{m.date}</Ltr> · <Ltr>{m.time}</Ltr> · <span dir="auto">{m.location === 'School Office' ? t('mtg.location_default') : m.location}</span> · <span dir="auto">{m.student.name}</span> · <span dir="auto">{m.teacher.name}</span>
      </p>
      {m.notes && <p className="text-sm whitespace-pre-line" dir="auto">{m.notes}</p>}
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </li>
  )
}

// D235 MTG.2 /admin/meetings, /teacher/meetings, /staff/meetings: request a meeting with a student's parents (a teacher for their own
// students; the admin and staff pick the teacher), change the time, cancel, mark completed with notes. Staff need
// staff.meeting.manage for the forms and buttons (useStaffCan); the server checks again.
export default function Meetings() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const role = useAuthStore((s) => s.user?.role)
  const canManage = useStaffCan('staff.meeting.manage')
  const [when, setWhen] = useState('upcoming')
  const list = useQuery({ queryKey: ['meetings', when], queryFn: () => api.get('/meetings', { params: { when } }).then(r => r.data.data) })
  const teachers = useQuery({ queryKey: ['meetings', 'teachers'], enabled: role !== 'teacher' && canManage, queryFn: () => api.get('/teachers').then(r => r.data.data) })
  const blank = { student_code: '', teacher_id: '', subject: '', proposed_date: '', proposed_time: '', location: '', notes: '' }
  const [f, setF] = useState(blank)
  const [errors, setErrors] = useState({})
  const refresh = () => qc.invalidateQueries({ queryKey: ['meetings'] })
  const save = async (e) => {
    e.preventDefault(); setErrors({})
    const body = { student_code: f.student_code.trim(), subject: f.subject, proposed_date: f.proposed_date, proposed_time: f.proposed_time, location: f.location || null, notes: f.notes || null,
      ...(role === 'teacher' ? {} : { teacher_id: f.teacher_id === '' ? null : Number(f.teacher_id) }) }
    try { await api.post('/meetings', body); setF(blank); refresh(); useUiStore.getState().addToast(t('mtg.requested')) } catch (err) { setErrors(fieldErrors(err)) }
  }
  const retime = async (m) => {
    const date = window.prompt(t('mtg.new_date'), m.date); if (!date) return
    const time = window.prompt(t('mtg.new_time'), m.time); if (!time) return
    try { await api.put(`/meetings/${m.id}`, { proposed_date: date.trim(), proposed_time: time.trim() }); refresh() } catch { /* shown by the interceptor */ }
  }
  const cancel = (m) => useUiStore.getState().openConfirm({ title: t('mtg.cancel'), description: t('mtg.cancel_hint', { subject: m.subject }), confirmLabel: t('mtg.cancel'), type: 'danger',
    onConfirm: async () => { try { await api.patch(`/meetings/${m.id}/cancel`, {}); refresh() } catch { /* shown by the interceptor */ } } })
  const complete = async (m) => {
    const notes = window.prompt(t('mtg.outcome_prompt'), ''); if (!notes || !notes.trim()) return
    try { await api.patch(`/meetings/${m.id}/complete`, { notes: notes.trim() }); refresh() } catch { /* shown by the interceptor */ }
  }
  return (
    <div className="flex flex-col gap-4" data-testid="meetings">
      <PageHeader title={t('mtg.title')} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className={`${canManage ? 'lg:col-span-2' : 'lg:col-span-3'} flex flex-col gap-3`}>
          <Tabs label={t('mtg.title')} value={when} onChange={setWhen} items={['upcoming', 'past'].map(k => ({ key: k, label: t(`mtg.tabs.${k}`) }))} />
          {list.isPending ? <Loader type="skeleton" rows={3} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : !list.data.length ? <EmptyState title={t(`mtg.none_${when}`)} /> : (
            <ul className="flex flex-col divide-y divide-line">
              {list.data.map(m => (
                <MeetingCard key={m.id} m={m}>
                  {canManage && ['pending', 'confirmed'].includes(m.status) && <>
                    <Button variant="ghost" onClick={() => retime(m)} data-action="retime">{t('mtg.retime')}</Button>
                    {m.date <= today() && <Button variant="secondary" onClick={() => complete(m)} data-action="complete">{t('mtg.complete')}</Button>}
                    <Button variant="ghost" onClick={() => cancel(m)} data-action="cancel">{t('mtg.cancel')}</Button>
                  </>}
                </MeetingCard>
              ))}
            </ul>
          )}
        </Card>
        {canManage && <Card>
          <form className="flex flex-col gap-2" onSubmit={save} data-testid="meeting-form">
            <h2 className="font-semibold">{t('mtg.new')}</h2>
            <Input name="student_code" label={t('mtg.student_code')} ltr value={f.student_code} onChange={(e) => setF({ ...f, student_code: e.target.value })} error={errors.student_code ?? errors.student_id} required />
            {role !== 'teacher' && <Select name="teacher_id" label={t('mtg.teacher')} placeholder={t('mtg.pick')} value={f.teacher_id} onChange={(e) => setF({ ...f, teacher_id: e.target.value })} error={errors.teacher_id}
              options={(teachers.data ?? []).map(x => ({ value: String(x.id), label: x.name ?? x.user?.name ?? `#${x.id}` }))} />}
            <Input name="subject" label={t('mtg.subject')} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} error={errors.subject} required />
            <div className="grid grid-cols-2 gap-2">
              <Input name="proposed_date" type="date" label={t('mtg.date')} ltr min={today()} value={f.proposed_date} onChange={(e) => setF({ ...f, proposed_date: e.target.value })} error={errors.proposed_date} required />
              <Input name="proposed_time" type="time" label={t('mtg.time')} ltr value={f.proposed_time} onChange={(e) => setF({ ...f, proposed_time: e.target.value })} error={errors.proposed_time} required />
            </div>
            <Input name="location" label={t('mtg.location')} placeholder={t('mtg.location_default')} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} error={errors.location} />
            <Textarea name="notes" label={t('mtg.notes')} rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} error={errors.notes} />
            <p className="text-xs text-content-muted">{t('mtg.notice_hint')}</p>
            <div><Button type="submit" data-action="request">{t('mtg.request')}</Button></div>
          </form>
        </Card>}
      </div>
    </div>
  )
}
