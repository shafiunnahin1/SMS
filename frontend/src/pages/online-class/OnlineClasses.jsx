import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import { useTerms } from '../../hooks/useTerms'
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
const PLATFORMS = ['google_meet', 'zoom', 'jitsi', 'custom']

// D231 OCL.2 /admin/online-class, /teacher/online-class, /staff/online-class: schedule a class for a batch or a whole program with
// its https meeting link; upcoming and past lists; change, cancel, mark completed with a recording link. A teacher schedules as
// themselves and changes only their own (the server checks; staff need staff.online_class.manage).
export default function OnlineClasses() {
  const { t } = useTranslation()
  const terms = useTerms()
  const qc = useQueryClient()
  const role = useAuthStore((s) => s.user?.role)
  const [when, setWhen] = useState('upcoming')
  const canManage = useStaffCan('staff.online_class.manage')   // staff without the manage key only read
  const list = useQuery({ queryKey: ['online-classes', when], queryFn: () => api.get('/online-classes', { params: { when } }).then(r => r.data.data) })
  const opts = useQuery({ queryKey: ['online-classes', 'options'], queryFn: () => api.get('/online-classes/options').then(r => r.data.data) })
  const blank = { title: '', program_id: '', batch_id: '', subject_id: '', teacher_id: '', platform: 'google_meet', meeting_link: '', meeting_id: '', passcode: '', date: '', time: '', duration_minutes: '60', description: '' }
  const [f, setF] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [errors, setErrors] = useState({})
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value, ...(k === 'program_id' ? { batch_id: '', subject_id: '' } : {}) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['online-classes'] })
  const save = async (e) => {
    e.preventDefault(); setErrors({})
    const n = (v) => (v === '' ? null : Number(v))
    const body = { title: f.title, program_id: n(f.program_id), batch_id: n(f.batch_id), subject_id: n(f.subject_id), platform: f.platform, meeting_link: f.meeting_link.trim(),
      meeting_id: f.meeting_id || null, passcode: f.passcode || null, scheduled_at: f.date && f.time ? `${f.date} ${f.time}` : '', duration_minutes: n(f.duration_minutes), description: f.description || null,
      ...(role === 'teacher' ? {} : { teacher_id: n(f.teacher_id) }) }
    try {
      if (editing) await api.put(`/online-classes/${editing}`, body); else await api.post('/online-classes', body)
      setF(blank); setEditing(null); refresh(); useUiStore.getState().addToast(t(editing ? 'ocl.saved' : 'ocl.scheduled'))
    } catch (err) { setErrors(fieldErrors(err)) }
  }
  const edit = (c) => {
    setEditing(c.id)
    setF({ title: c.title, program_id: String(c.program.id), batch_id: c.batch ? String(c.batch.id) : '', subject_id: c.subject ? String(c.subject.id) : '', teacher_id: String(c.teacher.id), platform: c.platform ?? 'google_meet',
      meeting_link: c.meeting_link ?? '', meeting_id: c.meeting_id ?? '', passcode: c.passcode ?? '', date: c.scheduled_at.slice(0, 10), time: c.scheduled_at.slice(11, 16), duration_minutes: String(c.duration_minutes), description: c.description ?? '' })
  }
  const cancel = (c) => useUiStore.getState().openConfirm({ title: t('ocl.cancel'), description: t('ocl.cancel_hint', { title: c.title }), confirmLabel: t('ocl.cancel'), type: 'danger',
    onConfirm: async () => { try { await api.delete(`/online-classes/${c.id}`); refresh() } catch { /* shown by the interceptor */ } } })
  const complete = async (c) => {
    const url = window.prompt(t('ocl.recording_prompt'), '')
    if (url === null) return
    try { await api.patch(`/online-classes/${c.id}/complete`, { recording_url: url.trim() || null }); refresh() } catch { /* shown by the interceptor */ }
  }
  const o = opts.data
  const batches = (o?.batches ?? []).filter(b => String(b.program_id) === f.program_id)
  const subjects = (o?.subjects ?? []).filter(s => String(s.program_id) === f.program_id)
  return (
    <div className="flex flex-col gap-4" data-testid="online-classes">
      <PageHeader title={t('ocl.title')} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className={`${canManage ? 'lg:col-span-2' : 'lg:col-span-3'} flex flex-col gap-3`}>
          <Tabs label={t('ocl.title')} value={when} onChange={setWhen} items={['upcoming', 'past'].map(k => ({ key: k, label: t(`ocl.tabs.${k}`) }))} />
          {list.isPending ? <Loader type="skeleton" rows={3} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : !list.data.length ? <EmptyState title={t(`ocl.none_${when}`)} /> : (
            <ul className="flex flex-col divide-y divide-line">
              {list.data.map(c => (
                <li key={c.id} className="py-3 flex flex-col gap-1" data-testid="class-row" data-status={c.status}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium" dir="auto">{c.title}</span>
                    <span className="rounded-full px-2 py-0.5 text-xs bg-surface-muted font-medium">{t(`ocl.statuses.${c.status}`)}</span>
                  </div>
                  <p className="text-sm text-content-muted">
                    {[c.batch?.name ?? `${c.program.name ?? ''} (${t('ocl.whole', { program: terms('program') })})`, c.subject?.name, c.teacher?.name].filter(Boolean).join(' · ')} · <Ltr>{c.scheduled_at}</Ltr> · {t('ocl.minutes', { n: c.duration_minutes })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {c.meeting_link && ['scheduled', 'live'].includes(c.status) && <a className="text-sm font-medium text-primary-fg underline" href={c.meeting_link} target="_blank" rel="noopener noreferrer">{t('ocl.join')}</a>}
                    {c.recording_url && <a className="text-sm font-medium text-primary-fg underline" href={c.recording_url} target="_blank" rel="noopener noreferrer">{t('ocl.recording')}</a>}
                    {canManage && ['scheduled', 'live', 'ended'].includes(c.status) && <span className="ms-auto flex gap-1">
                      {c.status === 'scheduled' && <Button variant="ghost" onClick={() => edit(c)} data-action="edit">{t('common.edit')}</Button>}
                      {c.status !== 'scheduled' && <Button variant="secondary" onClick={() => complete(c)} data-action="complete">{t('ocl.complete')}</Button>}
                      <Button variant="ghost" onClick={() => cancel(c)} data-action="cancel">{t('ocl.cancel')}</Button>
                    </span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {canManage && <Card>
          <form className="flex flex-col gap-2" onSubmit={save} data-testid="class-form">
            <h2 className="font-semibold">{editing ? t('ocl.edit') : t('ocl.new')}</h2>
            <Input name="title" label={t('ocl.f.title')} value={f.title} onChange={set('title')} error={errors.title} required />
            <Select name="program_id" label={terms('program')} placeholder={t('ocl.pick')} value={f.program_id} onChange={set('program_id')} error={errors.program_id} required
              options={(o?.programs ?? []).map(p => ({ value: String(p.id), label: p.name }))} />
            <Select name="batch_id" label={terms('batch')} placeholder={t('ocl.whole', { program: terms('program') })} value={f.batch_id} onChange={set('batch_id')} error={errors.batch_id}
              options={batches.map(b => ({ value: String(b.id), label: b.name }))} />
            <Select name="subject_id" label={t('ocl.f.subject')} placeholder={t('ocl.none')} value={f.subject_id} onChange={set('subject_id')} error={errors.subject_id}
              options={subjects.map(s => ({ value: String(s.id), label: s.name }))} />
            {role !== 'teacher' && <Select name="teacher_id" label={t('ocl.f.teacher')} placeholder={t('ocl.pick')} value={f.teacher_id} onChange={set('teacher_id')} error={errors.teacher_id}
              options={(o?.teachers ?? []).map(x => ({ value: String(x.id), label: x.name ?? `#${x.id}` }))} />}
            <div className="grid grid-cols-2 gap-2">
              <Input name="date" type="date" label={t('ocl.f.date')} ltr value={f.date} onChange={set('date')} error={errors.scheduled_at} required />
              <Input name="time" type="time" label={t('ocl.f.time')} ltr value={f.time} onChange={set('time')} required />
            </div>
            <Input name="duration_minutes" label={t('ocl.f.duration')} inputMode="numeric" ltr value={f.duration_minutes} onChange={set('duration_minutes')} error={errors.duration_minutes} />
            <Select name="platform" label={t('ocl.f.platform')} value={f.platform} onChange={set('platform')} options={PLATFORMS.map(p => ({ value: p, label: t(`ocl.platforms.${p}`) }))} />
            <Input name="meeting_link" type="url" label={t('ocl.f.meeting_link')} ltr placeholder="https://" value={f.meeting_link} onChange={set('meeting_link')} error={errors.meeting_link} required />
            <div className="grid grid-cols-2 gap-2">
              <Input name="meeting_id" label={t('ocl.meeting_id')} ltr value={f.meeting_id} onChange={set('meeting_id')} error={errors.meeting_id} />
              <Input name="passcode" label={t('ocl.passcode')} ltr value={f.passcode} onChange={set('passcode')} error={errors.passcode} />
            </div>
            <Textarea name="description" label={t('ocl.f.description')} rows={2} value={f.description} onChange={set('description')} error={errors.description} />
            <p className="text-xs text-content-muted">{t('ocl.notice_hint')}</p>
            <div className="flex gap-2"><Button type="submit" data-action="save-class">{editing ? t('common.save') : t('ocl.schedule')}</Button>{editing && <Button variant="ghost" onClick={() => { setEditing(null); setF(blank) }}>{t('common.cancel')}</Button>}</div>
          </form>
        </Card>}
      </div>
    </div>
  )
}
