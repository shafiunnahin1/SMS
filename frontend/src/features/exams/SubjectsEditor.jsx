import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import Button from '../../components/Button'
import { Input } from '../../components/FormField'

const emptyPart = (i) => ({ key: `part${i + 1}`, label: '', full: '', pass: '' })

// The exam's subjects: schedule, full/pass marks and optional parts (e.g. written 70 + MCQ 30; the parts must add up to the full
// marks - the API checks). Saving a new scale re-grades marks already entered (server side).
export default function SubjectsEditor({ examId, subjects, locked, onSaved }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState(subjects)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState({})
  useEffect(() => { setRows(subjects) }, [subjects])
  const set = (i, k, v) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const setPart = (i, p, k, v) => set(i, 'components', rows[i].components.map((c, j) => (j === p ? { ...c, [k]: v } : c)))

  const save = async () => {
    setSaving(true); setErrors({})
    try {
      const body = rows.map((r, i) => ({ subject_id: r.subject_id, full_marks: r.full_marks, pass_marks: r.pass_marks, exam_date: r.exam_date || null,
        start_time: r.start_time || null, end_time: r.end_time || null, room: r.room || null, sort_order: i,
        components: r.components?.length ? r.components : null }))
      await api.put(`/exams/${examId}/subjects`, { subjects: body })
      useUiStore.getState().addToast(t('common.saved'))
      onSaved()
    } catch (e) {
      const d = e.response?.data
      if (d?.errors) setErrors(d.errors)
      else if (e.response?.status === 422 && d?.message) useUiStore.getState().addToast(d.message, 'error')   // e.g. parts do not add up
    } finally { setSaving(false) }
  }
  const err = (i, k) => errors[`subjects.${i}.${k}`]?.[0]

  return (
    <div className="flex flex-col gap-3" data-testid="exam-subjects">
      {rows.map((r, i) => (
        <fieldset key={r.subject_id} disabled={locked} className="rounded-token [border:1px_solid_var(--line)] p-density grid gap-3 sm:grid-cols-6">
          <legend className="px-1 font-semibold" dir="auto">{r.name}</legend>
          <Input label={t('exams.full_marks')} ltr inputMode="decimal" value={r.full_marks ?? ''} error={err(i, 'full_marks')} onChange={e => set(i, 'full_marks', e.target.value)} />
          <Input label={t('exams.pass_marks')} ltr inputMode="decimal" value={r.pass_marks ?? ''} error={err(i, 'pass_marks')} onChange={e => set(i, 'pass_marks', e.target.value)} />
          <Input label={t('exams.date')} type="date" ltr value={r.exam_date ?? ''} onChange={e => set(i, 'exam_date', e.target.value)} />
          <Input label={t('exams.start_time')} type="time" ltr value={r.start_time ?? ''} onChange={e => set(i, 'start_time', e.target.value)} />
          <Input label={t('exams.end_time')} type="time" ltr value={r.end_time ?? ''} error={err(i, 'end_time')} onChange={e => set(i, 'end_time', e.target.value)} />
          <Input label={t('exams.room')} value={r.room ?? ''} onChange={e => set(i, 'room', e.target.value)} />
          <div className="sm:col-span-6 flex flex-col gap-2">
            {(r.components ?? []).map((c, p) => (
              <div key={p} className="grid gap-2 grid-cols-[1fr_5rem_5rem_auto] items-end">
                <Input label={t('exams.part_label')} value={c.label} onChange={e => setPart(i, p, 'label', e.target.value)} />
                <Input label={t('exams.full_marks')} ltr inputMode="decimal" value={c.full} onChange={e => setPart(i, p, 'full', e.target.value)} />
                <Input label={t('exams.pass_marks')} ltr inputMode="decimal" value={c.pass} onChange={e => setPart(i, p, 'pass', e.target.value)} />
                <Button variant="ghost" aria-label={`${t('common.delete')} ${c.label}`} onClick={() => set(i, 'components', r.components.filter((_, j) => j !== p))}>
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <div><Button variant="ghost" onClick={() => set(i, 'components', [...(r.components ?? []), emptyPart((r.components ?? []).length)])}>
              <Plus aria-hidden="true" className="h-4 w-4" />{t('exams.add_part')}
            </Button></div>
          </div>
        </fieldset>
      ))}
      {!locked && <div className="flex justify-end"><Button onClick={save} loading={saving}>{t('common.save')}</Button></div>}
    </div>
  )
}
