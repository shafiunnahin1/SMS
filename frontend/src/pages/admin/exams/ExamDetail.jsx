import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileDown, Send } from 'lucide-react'
import api from '../../../api/axios'
import { useUiStore } from '../../../store/uiStore'
import { usePrint } from '../../../hooks/usePrint'
import { useTerms } from '../../../hooks/useTerms'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import StatusBadge from '../../../components/StatusBadge'
import Loader from '../../../components/Loader'
import DataTable from '../../../components/DataTable'
import { EmptyState, ErrorState } from '../../../components/StateViews'
import Ltr from '../../../components/bidi/Ltr'
import Tabs from '../../../ui/variants/Tabs'
import SubjectsEditor from '../../../features/exams/SubjectsEditor'
import PaperPicker from '../../../features/exams/PaperPicker'

// Step 4.5 /admin/exams/:id: the subjects (schedule, full/pass marks, parts), the marks (per subject: open the entry sheet;
// per student: the marksheet PDF) and publishing (then parents see it; bulk entry and the scale close).
export default function ExamDetail() {
  const { id } = useParams()
  const { t } = useTranslation()
  const term = useTerms()
  const qc = useQueryClient()
  const [tab, setTab] = useState('subjects')
  const exam = useQuery({ queryKey: ['exams', 'one', id], queryFn: () => api.get(`/exams/${id}`).then(r => r.data.data) })
  const subjects = useQuery({ queryKey: ['exams', 'subjects', id], queryFn: () => api.get(`/exams/${id}/subjects`).then(r => r.data.data) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['exams'] })

  if (exam.isPending) return <Loader type="page" />
  if (exam.isError) return <ErrorState onRetry={exam.refetch} />
  const e = exam.data
  const locked = e.status === 'published'
  const publish = () => useUiStore.getState().openConfirm({
    title: t('exams.publish_confirm', { name: e.name }), description: t('exams.publish_hint'), confirmLabel: t('exams.publish'),
    onConfirm: async () => {
      try {
        await api.post(`/exams/${id}/publish`)
        useUiStore.getState().addToast(t('exams.published'))
        refresh()
      } catch (err) {
        if (err.response?.status === 422) useUiStore.getState().addToast(err.response.data.message, 'error')
      }
    },
  })
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={<span className="inline-flex items-center gap-2"><span dir="auto">{e.name}</span> <StatusBadge status={e.status} /></span>}
        actions={!locked && <Button onClick={publish}><Send aria-hidden="true" className="h-4 w-4" />{t('exams.publish')}</Button>} />
      <p className="text-sm text-content-muted" dir="auto">{e.program?.name}{e.batch ? ` — ${e.batch.name}` : ''} · {t(`exams.types.${e.exam_type}`)} · <Ltr>{e.academic_year}</Ltr></p>
      <Tabs items={[{ key: 'subjects', label: t('exams.subjects') }, { key: 'papers', label: t('exam_paper.tab') }, { key: 'marks', label: t('exams.marks') }]} value={tab} onChange={setTab} label={e.name} />
      {tab === 'subjects' && (subjects.isPending ? <Card><Loader type="form" fields={4} /></Card> : subjects.isError ? <ErrorState onRetry={subjects.refetch} />
        : !subjects.data.length ? <EmptyState title={t('exams.no_subjects', { unit: term('program') })} />
        : <Card><SubjectsEditor examId={id} subjects={subjects.data} locked={locked} onSaved={refresh} /></Card>)}
      {tab === 'papers' && <PaperLinks examId={id} subjects={subjects.data ?? []} locked={locked} onChanged={() => qc.invalidateQueries({ queryKey: ['exams', 'subjects', id] })} />}
      {tab === 'marks' && <MarksOverview examId={id} subjects={subjects.data ?? []} locked={locked} />}
    </div>
  )
}

function MarksOverview({ examId, subjects, locked }) {
  const { t } = useTranslation()
  const { preview, loading } = usePrint()
  const grid = useQuery({ queryKey: ['results', examId], queryFn: () => api.get('/results', { params: { exam_id: examId } }).then(r => r.data.data) })
  const columns = [
    { key: 'name', label: t('students.name'), render: r => <span dir="auto">{r.name}</span> },
    ...subjects.map(s => ({ key: `s${s.subject_id}`, label: s.name, numeric: true, render: r => {
      const m = r.marks[s.subject_id]
      return m ? (m.is_absent ? t('status.absent') : <Ltr>{Number(m.marks_obtained)} · {m.grade}</Ltr>) : '—'
    } })),
    { key: 'pdf', label: t('exams.marksheet'), action: true, render: r => (
      <Button variant="ghost" loading={loading} onClick={() => preview(`/results/marksheet/${r.student_id}`, { exam_id: examId })} aria-label={`${t('exams.marksheet')} ${r.name}`}>
        <FileDown aria-hidden="true" className="h-4 w-4" />
      </Button>) },
  ]
  return (
    <>
      {!locked && <Card className="flex flex-wrap gap-2" data-testid="entry-links">
        {subjects.map(s => (
          <Link key={s.subject_id} to={`/admin/exams/${examId}/entry/${s.subject_id}`}
            className="h-9 px-3 inline-flex items-center rounded-token text-sm [border:1px_solid_var(--line)] hover:bg-primary-soft">
            <span dir="auto">{t('exams.enter_marks', { subject: s.name })}</span>
          </Link>
        ))}
      </Card>}
      <Card data-testid="marks-grid">
        <DataTable columns={columns} data={grid.data?.rows ?? []} rowKey="student_id" loading={grid.isPending} error={grid.isError} onRetry={grid.refetch}
          empty={<EmptyState title={t('exams.no_marks')} />} />
      </Card>
    </>
  )
}

// D158 (3)(4) / D159 (1)(2): each subject's question papers - several per subject (e.g. MCQ paper + CQ/SQ paper), a multi-subject
// paper by one subject's part; "Link a question" opens the paper picker; the subject's mark fields follow the papers' kinds of question.
// Changing them is refused once marks exist or the exam is published.
function PaperLinks({ examId, subjects, locked, onChanged }) {
  const { t } = useTranslation()
  const [picking, setPicking] = useState(null)
  const fail = (err) => useUiStore.getState().addToast(err.response?.data?.message ?? t('common.error'), 'error')
  const link = (subjectId, paper, block) => api.put(`/exams/${examId}/subjects/${subjectId}/paper`, { qb_paper_id: paper.id, ...(block ? { qb_subject_id: block } : {}) })
    .then(() => { useUiStore.getState().addToast(t('exam_paper.linked')); onChanged() }).catch(fail)
  const unlink = (subjectId, linkId) => api.delete(`/exams/${examId}/subjects/${subjectId}/paper`, { params: { link_id: linkId } }).then(onChanged).catch(fail)
  if (!subjects.length) return <EmptyState title={t('exam_paper.no_subjects')} />
  return (
    <Card>
      <ul className="flex flex-col divide-y divide-line" data-testid="paper-links">
        {subjects.map(s => (
          <li key={s.subject_id} className="flex flex-wrap items-start gap-3 py-3" data-subject={s.subject_id}>
            <span className="min-w-40 flex-1 font-semibold" dir="auto">{s.name}</span>
            <div className="flex min-w-48 flex-[2] flex-col gap-1 text-sm">
              {(s.papers ?? []).length === 0 && <span className="text-content-muted">{t('exam_paper.none')}</span>}
              {(s.papers ?? []).map(l => (
                <span key={l.id} className="flex flex-wrap items-center gap-2" data-link={l.id}>
                  <span dir="auto">{l.title}{l.block ? ` — ${l.block}` : ''}</span>
                  {!locked && <Button variant="ghost" onClick={() => unlink(s.subject_id, l.id)} data-action="unlink-paper">{t('exam_paper.unlink')}</Button>}
                </span>
              ))}
              {(s.components ?? []).length > 0 && (s.papers ?? []).length > 0 && <span className="text-xs text-content-muted">{s.components.map(c => `${c.label} ${c.full}`).join(' · ')}</span>}
            </div>
            {!locked && <Button variant="secondary" onClick={() => setPicking(s.subject_id)} data-action="link-paper">{(s.papers ?? []).length ? t('exam_paper.add') : t('exam_paper.link')}</Button>}
          </li>
        ))}
      </ul>
      <PaperPicker open={picking !== null} onClose={() => setPicking(null)} onPick={(paper, block) => link(picking, paper, block)} />
    </Card>
  )
}
