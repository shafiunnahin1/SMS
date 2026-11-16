import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export const keyOf = (a) => `${a.batch_id}:${a.subject_id}:${a.teacher_id}`

// D224 SYL.3 / D225: lesson plans of one batch subject - write one (for the admin and staff: in that teacher's name), mark it taught
// (covers its unit) or skipped, remove it while planned. `units` = the subject's unit list, or null where it is not shown (staff).
export default function LessonPlans({ assignment, units }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const key = ['lesson-plans', assignment.batch_id, assignment.subject_id]
  const q = useQuery({ queryKey: key, queryFn: () => api.get('/lesson-plans', { params: { batch_id: assignment.batch_id, subject_id: assignment.subject_id } }).then(r => r.data.data) })
  const blank = { planned_date: today(), unit_id: '', objective: '', activities: '', resources: '' }
  const [f, setF] = useState(blank)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ['syllabus'] }) }
  const run = async (fn) => {
    setBusy(true); setErrors({})
    try { await fn(); refresh(); return true } catch (e) { setErrors(Object.fromEntries(Object.entries(e.response?.data?.errors ?? {}).map(([k, m]) => [k, m[0]]))); return false } finally { setBusy(false) }
  }
  const save = async (e) => {
    e.preventDefault()
    const body = { batch_id: assignment.batch_id, subject_id: assignment.subject_id, teacher_id: assignment.teacher_id, planned_date: f.planned_date,
      unit_id: f.unit_id ? Number(f.unit_id) : null, objective: f.objective || null, activities: f.activities || null, resources: f.resources || null }
    if (await run(() => api.post('/lesson-plans', body))) { setF(blank); useUiStore.getState().addToast(t('syl.plan_saved')) }
  }
  const remove = (p) => useUiStore.getState().openConfirm({ title: t('syl.remove_plan'), confirmLabel: t('common.delete'), type: 'danger', onConfirm: () => run(() => api.delete(`/lesson-plans/${p.id}`)) })
  const unitTitle = (id) => units?.find(u => u.id === id)?.title
  const leaves = (units ?? []).filter(u => !(units ?? []).some(c => c.parent_id === u.id))
  return (
    <div className="flex flex-col gap-3" data-testid="lesson-plans">
      <form className="grid gap-2 sm:grid-cols-2" onSubmit={save} data-testid="plan-form">
        <Input type="date" name="planned_date" label={t('syl.planned_date')} ltr value={f.planned_date} onChange={(e) => setF({ ...f, planned_date: e.target.value })} error={errors.planned_date} required />
        {units && <Select name="unit_id" label={t('syl.unit')} placeholder={t('syl.no_unit')} value={f.unit_id} onChange={(e) => setF({ ...f, unit_id: e.target.value })} error={errors.unit_id}
          options={leaves.map(u => ({ value: String(u.id), label: u.title }))} />}
        <Textarea className="sm:col-span-2" name="objective" label={t('syl.objective')} rows={2} value={f.objective} onChange={(e) => setF({ ...f, objective: e.target.value })} />
        <Textarea name="activities" label={t('syl.activities')} rows={2} value={f.activities} onChange={(e) => setF({ ...f, activities: e.target.value })} />
        <Textarea name="resources" label={t('syl.resources')} rows={2} value={f.resources} onChange={(e) => setF({ ...f, resources: e.target.value })} />
        {errors.teacher_id && <p className="text-sm text-danger sm:col-span-2">{errors.teacher_id}</p>}
        <div className="sm:col-span-2"><Button type="submit" loading={busy} data-action="add-plan">{t('syl.add_plan')}</Button></div>
      </form>
      {q.isPending ? <Loader type="skeleton" rows={3} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.length ? <EmptyState title={t('syl.no_plans')} /> : (
        <ul className="flex flex-col divide-y divide-line" data-testid="plan-list">
          {q.data.map(p => (
            <li key={p.id} className="py-2 flex flex-wrap items-center gap-2" data-testid="plan" data-status={p.status}>
              <Ltr>{p.planned_date}</Ltr>
              {p.unit_id && <span className="text-sm" dir="auto">{unitTitle(p.unit_id) ?? `#${p.unit_id}`}</span>}
              {p.objective && <span className="text-sm text-content-muted" dir="auto">· {p.objective}</span>}
              <span className="rounded-full px-2 py-0.5 text-xs bg-surface-muted font-medium">{t(`syl.statuses.${p.status}`)}</span>
              {p.status === 'planned' && <span className="ms-auto flex gap-2">
                <Button variant="secondary" onClick={() => run(() => api.post(`/lesson-plans/${p.id}/taught`))} data-action="taught">{t('syl.taught')}</Button>
                <Button variant="ghost" onClick={() => run(() => api.post(`/lesson-plans/${p.id}/skipped`))} data-action="skipped">{t('syl.skipped')}</Button>
                <Button variant="ghost" onClick={() => remove(p)} data-action="remove">{t('common.delete')}</Button>
              </span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
