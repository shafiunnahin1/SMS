import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import Ltr from '../../components/bidi/Ltr'
import McqImport from '../../features/exams/McqImport'

// Step 4.5 marks entry (admin: /admin/exams/:examId/entry/:subjectId, teacher: /teacher/marks/:examId/:subjectId). The sheet
// brings the limits and parts; the browser only bounds the inputs - the grade comes back from the server after saving (grading.md).
export default function MarksEntry() {
  const { examId, subjectId } = useParams()
  const { t } = useTranslation()
  const qc = useQueryClient()
  const sheet = useQuery({ queryKey: ['entry', examId, subjectId], queryFn: () => api.get(`/exams/${examId}/subjects/${subjectId}/entry`).then(r => r.data.data) })
  const [marks, setMarks] = useState({})
  const [saving, setSaving] = useState(false)
  const [rowErrors, setRowErrors] = useState({})

  const initial = useMemo(() => Object.fromEntries((sheet.data?.rows ?? []).map(r => [r.student_id, {
    marks: r.result?.marks_obtained != null ? String(Number(r.result.marks_obtained)) : '',
    parts: Object.fromEntries(Object.entries(r.result?.component_marks ?? {}).map(([k, v]) => [k, String(v)])),
    absent: Boolean(r.result?.is_absent),
  }])), [sheet.data])
  useEffect(() => { setMarks(initial) }, [initial])

  if (sheet.isPending) return <Loader type="page" />
  if (sheet.isError) return <ErrorState onRetry={sheet.refetch} />
  const { exam, subject, rows } = sheet.data
  const parts = subject.components ?? []
  const set = (sid, patch) => setMarks(m => ({ ...m, [sid]: { ...m[sid], ...patch } }))
  const filled = (m) => m.absent || (parts.length ? parts.every(p => m.parts[p.key] !== undefined && m.parts[p.key] !== '') : m.marks !== '')

  const save = async () => {
    const payload = rows.filter(r => marks[r.student_id] && filled(marks[r.student_id])).map(r => {
      const m = marks[r.student_id]
      if (m.absent) return { student_id: r.student_id, is_absent: true }
      return parts.length
        ? { student_id: r.student_id, components: Object.fromEntries(parts.map(p => [p.key, Number(m.parts[p.key])])) }
        : { student_id: r.student_id, marks_obtained: Number(m.marks) }
    })
    if (!payload.length) return
    setSaving(true); setRowErrors({})
    try {
      await api.post('/results/bulk', { exam_id: Number(examId), subject_id: Number(subjectId), rows: payload })
      useUiStore.getState().addToast(t('exams.marks_saved', { count: payload.length }))
      qc.invalidateQueries({ queryKey: ['entry', examId, subjectId] })
      qc.invalidateQueries({ queryKey: ['results'] })
    } catch (e) {
      const d = e.response?.data
      if (d?.errors) setRowErrors(d.errors)
      if (e.response?.status === 422 && d?.message) useUiStore.getState().addToast(d.message, 'error')
    } finally { setSaving(false) }
  }
  const numberInput = (value, max, onChange, label) => (
    <input type="number" inputMode="decimal" min="0" max={max} step="0.5" dir="ltr" value={value} onChange={e => onChange(e.target.value)} aria-label={label}
      className="h-10 w-full rounded-token px-2 bg-surface text-content [border:1px_solid_var(--line)] text-end" />
  )

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={<span dir="auto">{subject.name} — {exam.name}</span>} />
      <div className="flex flex-wrap gap-2 text-xs" data-testid="marks-summary">
        <span className="rounded-token bg-surface-muted px-2 py-1">{t('exams.full_marks')} <Ltr className="font-semibold">{Number(subject.full_marks)}</Ltr></span>
        <span className="rounded-token bg-surface-muted px-2 py-1">{t('exams.pass_marks')} <Ltr className="font-semibold">{Number(subject.pass_marks)}</Ltr></span>
        {parts.map(p => <span key={p.key} className="rounded-token bg-primary-soft px-2 py-1">{p.label} <Ltr className="font-semibold">{Number(p.full)}</Ltr></span>)}
      </div>
      {exam.status === 'published' && <Card><p className="text-sm">{t('exams.locked_hint')}</p></Card>}
      {exam.status !== 'published' && parts.some(p => p.key === 'mcq') && rows.length > 0 && (
        <McqImport examId={examId} subjectId={subjectId} exam={exam.name} subject={subject.name} rows={rows} full={Number(parts.find(p => p.key === 'mcq').full)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['entry', examId, subjectId] }); qc.invalidateQueries({ queryKey: ['results'] }) }} />
      )}
      {!rows.length ? <EmptyState title={t('exams.no_students')} /> : (
        <Card className="flex flex-col gap-3">
          <ul className="flex flex-col divide-y divide-line" data-testid="marks-entry">
            {rows.map((r, i) => {
              const m = marks[r.student_id] ?? { marks: '', parts: {}, absent: false }
              const err = rowErrors[`rows.${i}.marks_obtained`]?.[0]
              return (
                <li key={r.student_id} data-row={r.student_id} className="flex flex-col gap-2 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <bdi className="block truncate font-medium">{r.name}</bdi>
                      <span className="text-xs text-content-muted" data-testid="student-id">{/* D159 (3): the permanent ID beside the roll */}{r.roll_no != null && <>{t('mcq_import.roll')} <Ltr>{r.roll_no}</Ltr> · </>}{t('mcq_import.id')} <Ltr>{r.code}</Ltr>{r.batch ? ` · ${r.batch}` : ''}</span>
                    </div>
                    <span className={`shrink-0 rounded-token px-2 py-1 text-sm font-semibold ${r.result?.grade ? 'bg-primary-soft text-primary-fg' : ''}`} data-testid="grade">{r.result?.grade ?? ''}</span>
                  </div>
                  <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4">
                    {!m.absent && (parts.length
                      ? parts.map(p => <label key={p.key} className="flex min-w-0 flex-col gap-1 text-xs text-content-muted"><span className="truncate">{p.label} <Ltr>({Number(p.full)})</Ltr></span>
                          {numberInput(m.parts[p.key] ?? '', p.full, v => set(r.student_id, { parts: { ...m.parts, [p.key]: v } }), `${r.name} ${p.label}`)}</label>)
                      : <label className="flex min-w-0 flex-col gap-1 text-xs text-content-muted"><span>{t('exams.marks')} <Ltr>({Number(subject.full_marks)})</Ltr></span>
                          {numberInput(m.marks, subject.full_marks, v => set(r.student_id, { marks: v }), `${r.name} ${t('exams.marks')}`)}</label>)}
                    <label className="inline-flex h-10 items-center gap-2 rounded-token px-2 text-sm [border:1px_solid_var(--line)]">
                      <input type="checkbox" checked={m.absent} onChange={e => set(r.student_id, { absent: e.target.checked })} className="h-4 w-4 accent-[var(--color-primary)]" />
                      {t('status.absent')}
                    </label>
                  </div>
                  {err && <span className="text-xs text-red-600">{err}</span>}
                </li>
              )
            })}
          </ul>
          {exam.status !== 'published' && <div className="sticky bottom-0 -mx-4 flex justify-end bg-surface px-4 py-2 [border-top:1px_solid_var(--line)] sm:static sm:mx-0 sm:border-0 sm:p-0"><Button onClick={save} loading={saving} data-action="save">{t('common.save')}</Button></div>}
        </Card>
      )}
    </div>
  )
}
