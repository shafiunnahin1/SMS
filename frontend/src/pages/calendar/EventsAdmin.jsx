import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import { useTerms } from '../../hooks/useTerms'
import { fmtDate } from '../../i18n/format'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'

const blank = { title: '', description: '', type: 'other', event_date: '', start_time: '', end_time: '', venue: '', target_audience: 'all', program_ids: [], registration_required: false, registration_deadline: '', max_participants: '', is_public: false }
const TYPES = ['academic', 'sports', 'cultural', 'religious', 'other']
const AUD = ['all', 'students', 'teachers', 'parents']

// D213 CAL.2: the admin's events - add, edit, delete, see who registered
export default function EventsAdmin() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const term = useTerms()
  const qc = useQueryClient()
  const [f, setF] = useState(blank)
  const [editId, setEditId] = useState(null)
  const [regsOf, setRegsOf] = useState(null)
  const [busy, setBusy] = useState(false)
  const q = useQuery({ queryKey: ['events', 'admin'], queryFn: () => api.get('/events').then(r => r.data.data) })
  const programs = useQuery({ queryKey: ['programs', 'all'], queryFn: () => api.get('/programs').then(r => r.data.data) })
  const regs = useQuery({ queryKey: ['events', 'regs', regsOf], enabled: !!regsOf, queryFn: () => api.get(`/events/${regsOf}/registrations`).then(r => r.data.data) })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const toggleProgram = (id) => setF({ ...f, program_ids: f.program_ids.includes(id) ? f.program_ids.filter(x => x !== id) : [...f.program_ids, id] })
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    const body = { ...f, start_time: f.start_time || null, end_time: f.end_time || null, venue: f.venue || null, description: f.description || null,
      registration_deadline: f.registration_required && f.registration_deadline ? f.registration_deadline : null,
      max_participants: f.registration_required && f.max_participants ? Number(f.max_participants) : null }
    try {
      if (editId) await api.put(`/events/${editId}`, body)
      else await api.post('/events', body)
      setF(blank); setEditId(null)
    } catch { /* the interceptor shows the error */ } finally { setBusy(false); qc.invalidateQueries({ queryKey: ['events'] }) }
  }
  const edit = (ev) => { setEditId(ev.id); setF({ ...blank, ...Object.fromEntries(Object.entries(ev).map(([k, v]) => [k, v ?? ''])), program_ids: ev.program_ids ?? [], max_participants: ev.max_participants ? String(ev.max_participants) : '' }) }
  const remove = (ev) => useUiStore.getState().openConfirm({ title: t('cal.delete'), description: t('cal.delete_confirm', { title: ev.title }),
    onConfirm: async () => { try { await api.delete(`/events/${ev.id}`) } catch { /* the interceptor shows the error */ } finally { qc.invalidateQueries({ queryKey: ['events'] }) } } })
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <form className="flex flex-col gap-3" onSubmit={save} data-testid="event-form">
          <h2 className="font-semibold">{editId ? t('cal.edit_event') : t('cal.add_event')}</h2>
          <Input name="title" label={t('cal.event_title')} value={f.title} onChange={set('title')} required maxLength={150} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select name="type" label={t('cal.type_label')} options={TYPES.map(v => ({ value: v, label: t(`cal.etype.${v}`) }))} value={f.type} onChange={set('type')} />
            <Input name="event_date" type="date" label={t('cal.date')} value={f.event_date} onChange={set('event_date')} required />
            <Input name="start_time" type="time" label={t('cal.start_time')} value={f.start_time} onChange={set('start_time')} />
            <Input name="end_time" type="time" label={t('cal.end_time')} value={f.end_time} onChange={set('end_time')} />
          </div>
          <Input name="venue" label={t('cal.venue')} value={f.venue} onChange={set('venue')} maxLength={150} />
          <Textarea name="description" label={t('cal.description')} value={f.description} onChange={set('description')} rows={3} />
          <Select name="target_audience" label={t('cal.audience')} options={AUD.map(v => ({ value: v, label: t(`cal.aud.${v}`) }))} value={f.target_audience} onChange={set('target_audience')} />
          {!!programs.data?.length && (
            <fieldset className="flex flex-col gap-1 text-sm">
              <legend className="mb-1">{t('cal.only_programs', { programs: term('programs') })}</legend>
              <div className="flex flex-wrap gap-3">
                {programs.data.map(p => <label key={p.id} className="inline-flex items-center gap-1"><input type="checkbox" checked={f.program_ids.includes(p.id)} onChange={() => toggleProgram(p.id)} />{p.name}</label>)}
              </div>
            </fieldset>
          )}
          <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="registration_required" checked={!!f.registration_required} onChange={set('registration_required')} />{t('cal.registration_required')}</label>
          {f.registration_required && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input name="registration_deadline" type="date" label={t('cal.registration_deadline')} value={f.registration_deadline} onChange={set('registration_deadline')} />
              <Input name="max_participants" type="number" min="1" label={t('cal.max_participants')} value={f.max_participants} onChange={set('max_participants')} ltr />
            </div>
          )}
          {f.target_audience === 'all' && <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="is_public" checked={!!f.is_public} onChange={set('is_public')} />{t('cal.is_public')}</label>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy} data-action="save-event">{t('cal.save')}</Button>
            {editId && <Button variant="ghost" onClick={() => { setEditId(null); setF(blank) }}>{t('cal.cancel')}</Button>}
          </div>
        </form>
      </Card>
      <Card>
        <h2 className="font-semibold mb-2">{t('cal.event_list')}</h2>
        {q.isLoading ? <Loader /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.length ? <EmptyState title={t('cal.no_events')} /> : (
          <ul className="flex flex-col divide-y divide-line text-sm" data-testid="event-list">
            {q.data.map(ev => (
              <li key={ev.id} className="py-2 flex flex-col gap-1">
                <span className="font-medium">{ev.title}</span>
                <span className="text-content-muted">{fmtDate(ev.event_date, locale)} · {t(`cal.aud.${ev.target_audience}`)}{ev.registration_required ? ` · ${t('cal.registered_count', { count: ev.registrations_count ?? 0 })}` : ''}{ev.is_public ? ` · ${t('cal.public')}` : ''}</span>
                <span className="flex flex-wrap gap-2">
                  <Button variant="ghost" onClick={() => edit(ev)} data-action="edit-event">{t('cal.edit')}</Button>
                  {ev.registration_required && <Button variant="ghost" onClick={() => setRegsOf(regsOf === ev.id ? null : ev.id)} data-action="regs">{t('cal.registrations')}</Button>}
                  <Button variant="ghost" onClick={() => remove(ev)} data-action="delete-event">{t('cal.delete')}</Button>
                </span>
                {regsOf === ev.id && (regs.isLoading ? <Loader /> : regs.isError ? <ErrorState onRetry={regs.refetch} /> : !regs.data.length ? <p className="text-content-muted">{t('cal.no_registrations')}</p> : (
                  <ol className="list-decimal ps-5" data-testid="registrations">{regs.data.map(r => <li key={r.id}>{r.student.name} ({r.student.student_id})</li>)}</ol>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
