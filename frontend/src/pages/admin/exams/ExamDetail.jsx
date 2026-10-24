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
    // D162 (4): unsubmitted subjects are a warning, never a block
    title: t('exams.publish_confirm', { name: e.name }), confirmLabel: t('exams.publish'),
    description: [t('exams.publish_hint'), ...(() => { const open = (subjects.data ?? []).filter(s => s.submission?.status !== 'submitted').map(s => s.name)
      return open.length ? [t('exams.unsubmitted_warn', { list: open.join(', ') })] : [] })()].join(' '),
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
      {locked && <ResultSms examId={id} />}
      <p className="text-sm text-content-muted" dir="auto">{e.program?.name}{e.batch ? ` — ${e.batch.name}` : ''} · {t(`exams.types.${e.exam_type}`)} · <Ltr>{e.academic_year}</Ltr></p>
      <Tabs items={[{ key: 'subjects', label: t('exams.subjects') }, { key: 'papers', label: t('exam_paper.tab') }, { key: 'marks', label: t('exams.marks') }, { key: 'merit', label: t('merit.tab') }]} value={tab} onChange={setTab} label={e.name} />
      {tab === 'subjects' && (subjects.isPending ? <Card><Loader type="form" fields={4} /></Card> : subjects.isError ? <ErrorState onRetry={subjects.refetch} />
        : !subjects.data.length ? <EmptyState title={t('exams.no_subjects', { unit: term('program') })} />
        : <Card><SubjectsEditor examId={id} subjects={subjects.data} locked={locked} onSaved={refresh} /></Card>)}
      {tab === 'papers' && <PaperLinks examId={id} subjects={subjects.data ?? []} locked={locked} onChanged={() => qc.invalidateQueries({ queryKey: ['exams', 'subjects', id] })} />}
      {tab === 'merit' && <MeritList examId={id} programId={e.program_id ?? e.program?.id} fixedBatch={e.batch_id ?? e.batch?.id} />}
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
            {s.submission && <span className={`ms-2 rounded-token px-1 text-xs ${s.submission.status === 'unlock_requested' ? 'bg-primary-soft font-semibold text-primary-fg' : 'bg-surface-muted'}`} data-status={s.submission.status}>{t(`marks_flow.status.${s.submission.status}`)}</span>}
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

// D158 (2) / coaching-private-batch.md "Merit List": rank, student, total and percentage over all the exam's full marks; a tie shares
// the rank; a whole-class exam can be narrowed to one batch
function MeritList({ examId, programId, fixedBatch }) {
  const { t } = useTranslation()
  const term = useTerms()
  const [batch, setBatch] = useState('')
  const { preview, loading } = usePrint()                              // D161 (1): the same list as a PDF
  const batches = useQuery({ queryKey: ['batches', { program_id: programId }], enabled: Boolean(programId) && !fixedBatch,
    queryFn: () => api.get('/batches', { params: { program_id: programId } }).then(r => r.data.data) })
  const merit = useQuery({ queryKey: ['merit', examId, batch], queryFn: () => api.get(`/exams/${examId}/merit-list`, { params: batch ? { batch_id: batch } : {} }).then(r => r.data.data) })
  const columns = [
    { key: 'rank', label: t('merit.rank'), numeric: true, render: r => (r.rank ? <Ltr>{r.rank}</Ltr> : '—') },
    { key: 'name', label: t('students.name'), render: r => <span><bdi>{r.name}</bdi> <span className="text-xs text-content-muted"><Ltr>{r.code}</Ltr></span></span> },
    { key: 'roll', label: t('mcq_import.roll'), numeric: true, render: r => <Ltr>{r.roll_no ?? ''}</Ltr> },
    { key: 'batch', label: term('batch'), render: r => <span dir="auto">{r.batch ?? ''}</span> },
    { key: 'total', label: t('merit.total'), numeric: true, render: r => (r.total == null ? '—' : <Ltr>{Number(r.total)}</Ltr>) },
    { key: 'pct', label: t('merit.percentage'), numeric: true, render: r => (r.percentage == null ? '—' : <Ltr>{Number(r.percentage)}%</Ltr>) },
  ]
  return (
    <Card className="flex flex-col gap-3" data-testid="merit-list">
      <div className="flex flex-wrap items-end justify-between gap-2">
        {!fixedBatch && <label className="flex flex-col gap-1 text-sm"><span>{term('batch')}</span>
          <select className="rounded-token border px-2 py-1" value={batch} onChange={e => setBatch(e.target.value)} name="merit_batch">
            <option value="">{t('merit.all')}</option>{(batches.data ?? []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
        <span className="flex items-center gap-3">
          {merit.data && <span className="text-sm text-content-muted">{t('exams.full_marks')}: <Ltr>{Number(merit.data.full_marks)}</Ltr></span>}
          <Button variant="secondary" loading={loading} onClick={() => preview(`/exams/${examId}/merit-list`, { format: 'pdf', ...(batch ? { batch_id: batch } : {}) })} data-action="merit-pdf">
            <FileDown aria-hidden="true" className="h-4 w-4" />PDF</Button>
        </span>
      </div>
      <DataTable columns={columns} data={merit.data?.rows ?? []} rowKey="student_id" loading={merit.isPending} error={merit.isError} onRetry={merit.refetch}
        empty={<EmptyState title={t('exams.no_marks')} />} />
    </Card>
  )
}

// D161 (2): after publishing, the head of the institution sends the result SMS; the report shows sent / total with what waits (pending:
// the wallet ran out - press again after a recharge), failed and skipped (no guardian opt-in); corrections are counted apart
function ResultSms({ examId }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const report = useQuery({ queryKey: ['result-sms', examId], queryFn: () => api.get(`/exams/${examId}/result-sms`).then(r => r.data.data), refetchInterval: 5000 })
  const send = async () => {
    setBusy(true)
    try { await api.post(`/exams/${examId}/result-sms`); useUiStore.getState().addToast(t('result_sms.queued')); report.refetch() }
    catch (err) { useUiStore.getState().addToast(err.response?.data?.message ?? t('common.error'), 'error') }
    finally { setBusy(false) }
  }
  const r = report.data?.result
  const c = report.data?.correction
  return (
    <Card className="flex flex-wrap items-center gap-3" data-testid="result-sms">
      <Button onClick={send} loading={busy} data-action="send-result-sms">{r?.total ? t('result_sms.resend') : t('result_sms.send')}</Button>
      {r && r.total > 0 && <span className="text-sm" data-testid="result-sms-report">
        <strong><Ltr>{r.sent}/{r.total}</Ltr></strong> {t('result_sms.sent')}
        {r.pending > 0 && <> · <Ltr>{r.pending}</Ltr> {t('result_sms.pending')}</>}
        {r.failed > 0 && <> · <Ltr>{r.failed}</Ltr> {t('result_sms.failed')}</>}
        {r.skipped > 0 && <> · <Ltr>{r.skipped}</Ltr> {t('result_sms.skipped')}</>}
      </span>}
      {c && c.total > 0 && <span className="text-sm text-content-muted">{t('result_sms.corrections')}: <Ltr>{c.sent}/{c.total}</Ltr>{c.pending > 0 && <> · <Ltr>{c.pending}</Ltr> {t('result_sms.pending')}</>}</span>}
    </Card>
  )
}
