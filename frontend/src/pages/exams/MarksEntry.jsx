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
      className="h-10 w-20 rounded-token px-2 bg-surface text-content [border:1px_solid_var(--line)] text-end" />
  )

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={<span dir="auto">{subject.name} — {exam.name}</span>} />
      <p className="text-sm text-content-muted">
        {t('exams.full_marks')}: <Ltr>{Number(subject.full_marks)}</Ltr> · {t('exams.pass_marks')}: <Ltr>{Number(subject.pass_marks)}</Ltr>
        {parts.length > 0 && <> · {parts.map(p => `${p.label} ${p.full}/${p.pass}`).join(' · ')}</>}
      </p>
      {exam.status === 'published' && <Card><p className="text-sm">{t('exams.locked_hint')}</p></Card>}
      {!rows.length ? <EmptyState title={t('exams.no_students')} /> : (
        <Card className="flex flex-col gap-3">
          <ul className="flex flex-col divide-y divide-line" data-testid="marks-entry">
            {rows.map((r, i) => {
              const m = marks[r.student_id] ?? { marks: '', parts: {}, absent: false }
              const err = rowErrors[`rows.${i}.marks_obtained`]?.[0]
              return (
                <li key={r.student_id} data-row={r.student_id} className="py-2 flex flex-wrap items-center gap-3">
                  <span className="flex-1 min-w-40"><bdi>{r.name}</bdi> <span className="text-xs text-content-muted"><Ltr>{r.roll_no ?? r.code}</Ltr>{r.batch ? ` · ${r.batch}` : ''}</span></span>
                  {!m.absent && (parts.length
                    ? parts.map(p => <label key={p.key} className="inline-flex items-center gap-1 text-sm">{p.label}
                        {numberInput(m.parts[p.key] ?? '', p.full, v => set(r.student_id, { parts: { ...m.parts, [p.key]: v } }), `${r.name} ${p.label}`)}</label>)
                    : numberInput(m.marks, subject.full_marks, v => set(r.student_id, { marks: v }), `${r.name} ${t('exams.marks')}`))}
                  <label className="inline-flex items-center gap-1 text-sm">
                    <input type="checkbox" checked={m.absent} onChange={e => set(r.student_id, { absent: e.target.checked })} className="h-4 w-4 accent-[var(--color-primary)]" />
                    {t('status.absent')}
                  </label>
                  <span className="w-16 text-sm font-semibold" data-testid="grade">{r.result?.grade ?? ''}</span>
                  {err && <span className="w-full text-xs text-red-600">{err}</span>}
                </li>
              )
            })}
          </ul>
          {exam.status !== 'published' && <div className="flex justify-end"><Button onClick={save} loading={saving} data-action="save">{t('common.save')}</Button></div>}
        </Card>
      )}
    </div>
  )
}
