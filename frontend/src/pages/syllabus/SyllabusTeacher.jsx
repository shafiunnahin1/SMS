import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Select } from '../../components/FormField'
import CoverageTree from '../../features/syllabus/CoverageTree'
import LessonPlans, { keyOf } from '../../features/syllabus/LessonPlans'

// D224 SYL.3 /teacher/syllabus: pick one of the batch subjects you teach - tick the lessons covered (the simple way) or write lesson
// plans (the full way); your own lessons behind their plan. A help for the teacher, not a measure of them.
export default function SyllabusTeacher() {
  const { t } = useTranslation()
  const mine = useQuery({ queryKey: ['syllabus', 'assignments'], queryFn: () => api.get('/lesson-plans/assignments').then(r => r.data.data) })
  const [pick, setPick] = useState('')
  if (mine.isPending) return <Loader type="page" />
  if (mine.isError) return <ErrorState onRetry={mine.refetch} />
  const a = mine.data.find(x => keyOf(x) === pick) ?? mine.data[0]
  return (
    <div className="flex flex-col gap-4" data-testid="syllabus-teacher">
      <PageHeader title={t('syl.title')} />
      {!a ? <EmptyState title={t('syl.no_assignment')} /> : <>
        <Select name="assignment" label={t('syl.batch_subject')} value={keyOf(a)} onChange={(e) => setPick(e.target.value)} className="sm:w-80"
          options={mine.data.map(x => ({ value: keyOf(x), label: `${x.batch} · ${x.subject}` }))} />
        <Subject a={a} />
        <Behind />
      </>}
    </div>
  )
}

function Subject({ a }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const cov = useQuery({ queryKey: ['syllabus', 'coverage', a.batch_id, a.subject_id], queryFn: () => api.get('/syllabus/coverage', { params: { batch_id: a.batch_id, subject_id: a.subject_id } }).then(r => r.data.data) })
  const units = useQuery({ queryKey: ['syllabus', 'units', a.program_id, a.subject_id], queryFn: () => api.get('/syllabus/units', { params: { program_id: a.program_id, subject_id: a.subject_id } }).then(r => r.data.data) })
  const toggle = async (n) => {
    setBusy(true)
    try { await (n.covered ? api.delete('/syllabus/coverage', { data: { batch_id: a.batch_id, unit_id: n.id } }) : api.post('/syllabus/coverage', { batch_id: a.batch_id, unit_id: n.id })) } catch { /* shown by the interceptor */ }
    finally { setBusy(false); qc.invalidateQueries({ queryKey: ['syllabus'] }) }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>{cov.isPending ? <Loader type="skeleton" rows={5} /> : cov.isError ? <ErrorState onRetry={cov.refetch} /> : <CoverageTree data={cov.data} onToggle={toggle} busy={busy} />}</Card>
      <Card className="flex flex-col gap-2"><h2 className="font-semibold">{t('syl.plans')}</h2>{units.data && <LessonPlans assignment={a} units={units.data} />}</Card>
    </div>
  )
}

export function Behind({ teacherNames }) {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['syllabus', 'behind'], queryFn: () => api.get('/syllabus/behind').then(r => r.data.data) })
  return (
    <Card className="flex flex-col gap-2" data-testid="behind">
      <h2 className="font-semibold">{t('syl.behind')}</h2>
      {q.isPending ? <Loader type="skeleton" rows={2} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.length ? <p className="text-sm text-content-muted">{t('syl.none_behind')}</p> : (
        <ul className="flex flex-col divide-y divide-line text-sm">
          {q.data.map(r => <li key={`${r.batch.id}:${r.unit.id}`} className="py-1"><Ltr>{r.planned_date}</Ltr> · <span dir="auto">{r.batch.name} · {r.unit.title}</span>
            {teacherNames?.[r.teacher_id] && <span className="text-content-muted" dir="auto"> · {teacherNames[r.teacher_id]}</span>}</li>)}
        </ul>
      )}
    </Card>
  )
}
