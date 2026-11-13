import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import api from '../../api/axios'
import { useTerms } from '../../hooks/useTerms'
import { usePrint } from '../../hooks/usePrint'
import { useUiStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import StatusBadge from '../../components/StatusBadge'
import Modal from '../../ui/variants/Modal'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'

const blank = { subject_id: '', batch_id: '', teacher_id: '', title: '', description: '', due_date: '', file: null }

// D212 /teacher/homework and /admin/homework: give homework (a teacher only for subjects they teach; the admin names the teacher),
// the list, and per homework every target student - mark a paper hand-in, see the answer or file, grade with feedback.
export default function HomeworkTeacher() {
  const { t } = useTranslation()
  const term = useTerms()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const isAdmin = useAuthStore(s => s.user?.role) === 'admin'
  const list = useQuery({ queryKey: ['homework', 'mine'], queryFn: () => api.get('/homework').then(r => r.data.data) })
  const opts = useQuery({ queryKey: ['homework', 'options'], queryFn: () => api.get('/homework/options').then(r => r.data.data) })
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})
  const [open, setOpen] = useState(null)   // the homework whose submissions are shown

  const subject = opts.data?.subjects.find(s => String(s.id) === String(form?.subject_id))
  const batchOpts = (opts.data?.batches ?? []).filter(b => subject && b.program_id === subject.program.id && (!subject.batch_ids || subject.batch_ids.includes(b.id)))
  const save = async () => {
    setBusy(true); setErrors({})
    const fd = new FormData()
    fd.append('program_id', subject.program.id); fd.append('subject_id', form.subject_id)
    for (const k of ['batch_id', 'teacher_id', 'title', 'description', 'due_date']) if (form[k]) fd.append(k, form[k])
    if (form.file) fd.append('file', form.file)
    try {
      await api.post('/homework', fd)
      useUiStore.getState().addToast(t('common.saved'))
      setForm(null); qc.invalidateQueries({ queryKey: ['homework'] })
    } catch (e) {
      const v = e.response?.data?.errors
      if (v) setErrors(Object.fromEntries(Object.entries(v).map(([k, m]) => [k, [].concat(m)[0]])))
    } finally { setBusy(false) }
  }
  const remove = (h) => useUiStore.getState().openConfirm({ title: t('common.delete'), description: t('hw.delete_confirm'), type: 'danger',
    onConfirm: async () => { try { await api.delete(`/homework/${h.id}`) } catch { /* the interceptor shows the error */ } finally { qc.invalidateQueries({ queryKey: ['homework'] }) } } })

  return (
    <div className="flex flex-col gap-4" data-testid="homework-teacher">
      <PageHeader title={t('hw.title')} actions={<Button onClick={() => { setErrors({}); setForm({ ...blank }) }} data-action="new"><Plus size={16} aria-hidden="true" />{t('hw.new')}</Button>} />
      {list.isPending ? <Loader type="skeleton" rows={4} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : !list.data.length ? <EmptyState title={t('hw.none')} /> : (
        <div className="flex flex-col gap-3">
          {list.data.map(h => (
            <Card key={h.id} className="flex flex-col gap-1" data-hw={h.id}>
              <span className="font-semibold" dir="auto">{h.title}</span>
              <span className="text-sm text-content-muted">{h.subject?.name} · {h.program?.name}{h.batch ? ` · ${h.batch.name}` : ''}{h.due_date ? ` · ${t('hw.due', { date: fmtDate(h.due_date, locale) })}` : ''}{isAdmin && h.teacher ? ` · ${h.teacher}` : ''}</span>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="secondary" onClick={() => setOpen(h)} data-action="submissions">{t('hw.submissions')}</Button>
                <Button variant="ghost" onClick={() => remove(h)} data-action="delete">{t('common.delete')}</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={t('hw.new')}>
        {form && (
          <div className="grid gap-3 sm:grid-cols-2" data-testid="hw-form">
            <Select className="sm:col-span-2" label={t('hw.subject')} placeholder="—" value={form.subject_id} name="subject_id" error={errors.subject_id}
              onChange={e => setForm(f => ({ ...f, subject_id: e.target.value, batch_id: '' }))}
              options={(opts.data?.subjects ?? []).map(s => ({ value: String(s.id), label: `${s.program.name} · ${s.name}` }))} />
            <Select label={term('batch')} placeholder={subject?.batch_ids ? '—' : t('hw.all_batches')} value={form.batch_id} name="batch_id" error={errors.batch_id}
              onChange={e => setForm(f => ({ ...f, batch_id: e.target.value }))} options={batchOpts.map(b => ({ value: String(b.id), label: b.name }))} />
            {isAdmin && <Select label={t('hw.teacher')} placeholder="—" value={form.teacher_id} name="teacher_id" error={errors.teacher_id}
              onChange={e => setForm(f => ({ ...f, teacher_id: e.target.value }))} options={(opts.data?.teachers ?? []).map(x => ({ value: String(x.id), label: x.name }))} />}
            <Input className="sm:col-span-2" label={t('hw.title_field')} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} name="title" maxLength={150} error={errors.title} />
            <Textarea className="sm:col-span-2" label={t('hw.description')} rows={4} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} name="description" maxLength={5000} />
            <Input label={t('hw.due_date')} type="date" ltr value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} name="due_date" error={errors.due_date} />
            <Input label={t('hw.file')} type="file" accept=".pdf,image/*" onChange={e => setForm(f => ({ ...f, file: e.target.files?.[0] ?? null }))} name="file" error={errors.file} />
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setForm(null)}>{t('common.cancel')}</Button>
              <Button onClick={save} loading={busy} disabled={!subject || !form.title.trim() || (subject.batch_ids && !form.batch_id) || (isAdmin && !form.teacher_id)} data-action="save">{t('hw.give')}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ''}>
        {open && <Submissions hw={open} />}
      </Modal>
    </div>
  )
}

function Submissions({ hw }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { preview } = usePrint()
  const q = useQuery({ queryKey: ['homework', 'subs', hw.id], queryFn: () => api.get(`/homework/${hw.id}/submissions`).then(r => r.data) })
  const [grades, setGrades] = useState({})
  const refresh = () => qc.invalidateQueries({ queryKey: ['homework', 'subs', hw.id] })
  const act = async (fn) => { try { await fn() } catch { /* the interceptor shows the error */ } finally { refresh() } }
  if (q.isPending) return <Loader type="skeleton" rows={4} />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  if (!q.data.data.length) return <EmptyState title={t('hw.no_students')} />
  return (
    <div className="flex flex-col gap-2" data-testid="hw-submissions">
      <p className="text-sm text-content-muted">{t('hw.submitted_of', { n: q.data.meta.submitted, total: q.data.meta.total })}</p>
      <ul className="flex flex-col divide-y divide-line">
        {q.data.data.map(({ student: s, submission: sub }) => {
          const g = grades[s.id] ?? { grade: sub?.grade ?? '', feedback: sub?.feedback ?? '' }
          return (
            <li key={s.id} className="py-2 flex flex-col gap-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{s.name} <span className="text-content-muted"><Ltr>{s.student_id}</Ltr></span></span>
                <span className="inline-flex items-center gap-2">
                  {sub ? <StatusBadge status={`hw_${sub.status}`} /> : <StatusBadge status="hw_missing" />}
                  {sub?.on_paper && <span className="text-xs text-content-muted">{t('hw.on_paper')}</span>}
                  {sub?.has_file && <Button variant="secondary" onClick={() => preview(`/homework/submissions/${sub.id}/file`)} data-action="file">{t('hw.open_file')}</Button>}
                  {!sub && <Button variant="secondary" onClick={() => act(() => api.post(`/homework/${hw.id}/paper`, { student_id: s.id }))} data-action="paper">{t('hw.mark_paper')}</Button>}
                </span>
              </div>
              {sub?.text_answer && <p className="whitespace-pre-line" dir="auto">{sub.text_answer}</p>}
              {sub && (
                <div className="flex flex-wrap items-end gap-2">
                  <Input label={t('hw.grade')} value={g.grade} maxLength={10} name={`grade-${s.id}`} className="w-24" onChange={e => setGrades(x => ({ ...x, [s.id]: { ...g, grade: e.target.value } }))} />
                  <Input label={t('hw.feedback')} value={g.feedback} maxLength={2000} name={`feedback-${s.id}`} className="flex-1 min-w-40" onChange={e => setGrades(x => ({ ...x, [s.id]: { ...g, feedback: e.target.value } }))} />
                  <Button onClick={() => act(() => api.post(`/homework/submissions/${sub.id}/grade`, { grade: g.grade || null, feedback: g.feedback || null }))} disabled={!g.grade && !g.feedback} data-action="grade">{t('hw.save_grade')}</Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
