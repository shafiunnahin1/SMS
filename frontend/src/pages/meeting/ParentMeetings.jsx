import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'
import { MeetingCard } from './Meetings'

const fieldErrors = (e) => Object.fromEntries(Object.entries(e.response?.data?.errors ?? {}).map(([k, m]) => [k, m[0]]))
const today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10)

// D235 MTG.2 /parent/meetings: the parent's meetings - confirm, ask for another time with a note, cancel - and asking a teacher of
// their child for a meeting
export default function ParentMeetings() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['meetings', 'parent'], queryFn: () => api.get('/parent/meetings').then(r => r.data.data) })
  const children = useQuery({ queryKey: ['parent', 'children'], queryFn: () => api.get('/parent/children').then(r => r.data.data) })
  const [f, setF] = useState({ student_id: '', teacher_id: '', subject: '', proposed_date: '', proposed_time: '', notes: '' })
  const child = f.student_id || (children.data?.[0] ? String(children.data[0].id) : '')
  const teachers = useQuery({ queryKey: ['meetings', 'child-teachers', child], enabled: !!child, queryFn: () => api.get(`/parent/children/${child}/teachers`).then(r => r.data.data) })
  const [errors, setErrors] = useState({})
  const refresh = () => qc.invalidateQueries({ queryKey: ['meetings'] })
  const act = async (fn) => { try { await fn(); refresh() } catch { /* shown by the interceptor */ } }
  const confirm = (m) => act(() => api.patch(`/parent/meetings/${m.id}/confirm`))
  const another = (m) => { const note = window.prompt(t('mtg.another_prompt'), ''); if (note && note.trim()) act(() => api.patch(`/parent/meetings/${m.id}/reschedule`, { note: note.trim() })) }
  const cancel = (m) => useUiStore.getState().openConfirm({ title: t('mtg.cancel'), description: t('mtg.cancel_hint', { subject: m.subject }), confirmLabel: t('mtg.cancel'), type: 'danger',
    onConfirm: () => act(() => api.patch(`/parent/meetings/${m.id}/cancel`)) })
  const ask = async (e) => {
    e.preventDefault(); setErrors({})
    try {
      await api.post('/parent/meetings', { student_id: Number(child), teacher_id: Number(f.teacher_id), subject: f.subject, proposed_date: f.proposed_date, proposed_time: f.proposed_time, notes: f.notes || null })
      setF({ ...f, teacher_id: '', subject: '', proposed_date: '', proposed_time: '', notes: '' }); refresh(); useUiStore.getState().addToast(t('mtg.asked'))
    } catch (err) { setErrors(fieldErrors(err)) }
  }
  return (
    <div className="flex flex-col gap-4" data-testid="parent-meetings">
      <PageHeader title={t('mtg.title')} />
      <Card>
        {list.isPending ? <Loader type="skeleton" rows={3} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : !list.data.length ? <EmptyState title={t('mtg.none_parent')} /> : (
          <ul className="flex flex-col divide-y divide-line">
            {list.data.map(m => (
              <MeetingCard key={m.id} m={m}>
                {m.status === 'pending' && m.requested_by !== 'parent' && <Button onClick={() => confirm(m)} data-action="confirm">{t('mtg.confirm')}</Button>}
                {['pending', 'confirmed'].includes(m.status) && <>
                  <Button variant="secondary" onClick={() => another(m)} data-action="another">{t('mtg.another')}</Button>
                  <Button variant="ghost" onClick={() => cancel(m)} data-action="cancel">{t('mtg.cancel')}</Button>
                </>}
              </MeetingCard>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <form className="flex flex-col gap-2" onSubmit={ask} data-testid="ask-form">
          <h2 className="font-semibold">{t('mtg.ask_title')}</h2>
          {(children.data ?? []).length > 1 && <Select name="student_id" label={t('hw.child')} value={child} onChange={(e) => setF({ ...f, student_id: e.target.value, teacher_id: '' })}
            options={children.data.map(c => ({ value: String(c.id), label: c.name }))} />}
          <Select name="teacher_id" label={t('mtg.teacher')} placeholder={t('mtg.pick')} value={f.teacher_id} onChange={(e) => setF({ ...f, teacher_id: e.target.value })} error={errors.teacher_id}
            options={(teachers.data ?? []).map(x => ({ value: String(x.id), label: x.name ?? `#${x.id}` }))} />
          <Input name="subject" label={t('mtg.subject')} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} error={errors.subject} required />
          <div className="grid grid-cols-2 gap-2">
            <Input name="proposed_date" type="date" label={t('mtg.date')} ltr min={today()} value={f.proposed_date} onChange={(e) => setF({ ...f, proposed_date: e.target.value })} error={errors.proposed_date} required />
            <Input name="proposed_time" type="time" label={t('mtg.time')} ltr value={f.proposed_time} onChange={(e) => setF({ ...f, proposed_time: e.target.value })} error={errors.proposed_time} required />
          </div>
          <Textarea name="notes" label={t('mtg.notes')} rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} error={errors.notes} />
          <div><Button type="submit" disabled={!f.teacher_id} data-action="ask">{t('mtg.ask')}</Button></div>
        </form>
      </Card>
    </div>
  )
}
