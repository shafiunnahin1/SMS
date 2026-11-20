import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useTerms } from '../../hooks/useTerms'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'
import { useStaffCan } from '../../features/staff/StaffDepartment'

const fieldErrors = (e) => Object.fromEntries(Object.entries(e.response?.data?.errors ?? {}).map(([k, m]) => [k, m[0]]))
export const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
const FIELDS = ['height_cm', 'weight_kg', 'blood_group', 'vision_left', 'vision_right', 'medical_conditions', 'emergency_contact', 'emergency_phone', 'doctor_name', 'doctor_phone', 'last_checkup_date', 'notes']

// D235 HLT.2 /admin/health and /staff/health: classes with how many records exist, a class's summary (blood groups, conditions,
// missing) and its students; one student's record to read or (admin, staff.health.manage) edit. A child's sensitive data: nothing is
// cached beyond the page, and the summary lists names and blood groups only.
export default function Health() {
  const { t } = useTranslation()
  const term = useTerms()
  const [program, setProgram] = useState(null)
  const [batch, setBatch] = useState('')
  const [student, setStudent] = useState(null)
  const overview = useQuery({ queryKey: ['health', 'overview'], queryFn: () => api.get('/health/reports').then(r => r.data.data) })
  const report = useQuery({ queryKey: ['health', 'report', program, batch], enabled: !!program, queryFn: () => api.get(`/health/reports/${program}`, { params: { batch_id: batch || undefined } }).then(r => r.data.data) })
  const current = overview.data?.find(p => p.id === program)
  return (
    <div className="flex flex-col gap-4" data-testid="health">
      <PageHeader title={t('hlt.title')} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col gap-2">
          <h2 className="font-semibold">{term('programs')}</h2>
          {overview.isPending ? <Loader type="skeleton" rows={4} /> : overview.isError ? <ErrorState onRetry={overview.refetch} /> : !overview.data.length ? <EmptyState title={t('hlt.no_classes')} /> : (
            <ul className="flex flex-col divide-y divide-line">
              {overview.data.map(p => (
                <li key={p.id}><button type="button" className={`w-full py-2 flex justify-between gap-2 text-start ${p.id === program ? 'font-semibold text-primary-fg' : ''}`} onClick={() => { setProgram(p.id); setBatch(''); setStudent(null) }} data-action="class">
                  <span dir="auto">{p.name}</span><span className="text-sm text-content-muted">{t('hlt.records_of', { records: p.records, students: p.students })}</span>
                </button></li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="lg:col-span-2 flex flex-col gap-3">
          {!program ? <EmptyState title={t('hlt.pick_class')} /> : report.isPending ? <Loader type="skeleton" rows={4} /> : report.isError ? <ErrorState onRetry={report.refetch} /> : <>
            {current?.batches.length > 1 && <Select name="batch" label={term('batch')} placeholder={t('hlt.all')} value={batch} onChange={(e) => { setBatch(e.target.value); setStudent(null) }} className="sm:w-56"
              options={current.batches.map(b => ({ value: String(b.id), label: b.name }))} />}
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm" data-testid="health-summary">
              <div><dt className="text-content-muted">{t('hlt.students')}</dt><dd className="text-lg font-semibold">{report.data.students}</dd></div>
              <div><dt className="text-content-muted">{t('hlt.missing')}</dt><dd className="text-lg font-semibold">{report.data.missing}</dd></div>
              <div><dt className="text-content-muted">{t('hlt.with_conditions')}</dt><dd className="text-lg font-semibold">{report.data.with_conditions}</dd></div>
              <div><dt className="text-content-muted">{t('hlt.no_blood_group')}</dt><dd className="text-lg font-semibold">{report.data.no_blood_group}</dd></div>
            </dl>
            {Object.keys(report.data.blood_groups ?? {}).length > 0 && <p className="text-sm flex flex-wrap gap-2">{Object.entries(report.data.blood_groups).map(([g, n]) => <span key={g} className="rounded-full px-2 py-0.5 bg-surface-muted"><Ltr>{g}</Ltr>: {n}</span>)}</p>}
            <ul className="flex flex-col divide-y divide-line" data-testid="health-students">
              {report.data.rows.map(s => (
                <li key={s.id}><button type="button" className={`w-full py-2 flex flex-wrap items-center gap-2 text-start ${s.id === student ? 'font-semibold' : ''}`} onClick={() => setStudent(s.id)} data-testid="health-student">
                  <span dir="auto">{s.name}</span><Ltr className="text-sm text-content-muted">{s.student_id}</Ltr>
                  <span className="ms-auto text-sm">{s.has_record ? (s.blood_group ? <Ltr>{s.blood_group}</Ltr> : t('hlt.recorded')) : <span className="text-content-muted">{t('hlt.no_record')}</span>}</span>
                </button></li>
              ))}
            </ul>
          </>}
        </Card>
      </div>
      {student && <HealthForm key={student} studentId={student} />}
    </div>
  )
}

function HealthForm({ studentId }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const canManage = useStaffCan('staff.health.manage')
  const q = useQuery({ queryKey: ['health', 'student', studentId], queryFn: () => api.get(`/students/${studentId}/health`).then(r => r.data.data) })
  const [f, setF] = useState(null)
  const [errors, setErrors] = useState({})
  if (q.isPending) return <Loader type="skeleton" rows={4} />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  const v = f ?? Object.fromEntries(FIELDS.map(k => [k, q.data.record[k] ?? '']))
  const set = (k) => (e) => setF({ ...v, [k]: e.target.value })
  const save = async (e) => {
    e.preventDefault(); setErrors({})
    try { await api.put(`/students/${studentId}/health`, Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === '' ? null : x]))); setF(null); qc.invalidateQueries({ queryKey: ['health'] }); useUiStore.getState().addToast(t('hlt.saved')) }
    catch (err) { setErrors(fieldErrors(err)) }
  }
  const input = (k, extra = {}) => <Input key={k} name={k} label={t(`hlt.f.${k}`)} value={v[k]} onChange={set(k)} error={errors[k]} disabled={!canManage} {...extra} />
  return (
    <Card>
      <form className="flex flex-col gap-3" onSubmit={save} data-testid="health-form">
        <div className="flex flex-wrap items-baseline gap-2"><h2 className="font-semibold" dir="auto">{q.data.student.name}</h2><Ltr className="text-sm text-content-muted">{q.data.student.student_id}</Ltr>
          {q.data.updated_at && <span className="text-xs text-content-muted">{t('hlt.updated', { at: q.data.updated_at })}</span>}</div>
        <div className="grid gap-3 sm:grid-cols-3">
          {input('height_cm', { inputMode: 'decimal', ltr: true })}
          {input('weight_kg', { inputMode: 'decimal', ltr: true })}
          <Select name="blood_group" label={t('hlt.f.blood_group')} placeholder={t('hlt.unknown')} value={v.blood_group} onChange={set('blood_group')} error={errors.blood_group} disabled={!canManage} options={BLOOD.map(b => ({ value: b, label: b }))} />
          {input('vision_left', { ltr: true })}
          {input('vision_right', { ltr: true })}
          {input('last_checkup_date', { type: 'date', ltr: true })}
          {input('emergency_contact')}
          {input('emergency_phone', { ltr: true, inputMode: 'tel' })}
          {input('doctor_name')}
          {input('doctor_phone', { ltr: true, inputMode: 'tel' })}
        </div>
        <Textarea name="medical_conditions" label={t('hlt.f.medical_conditions')} rows={2} value={v.medical_conditions} onChange={set('medical_conditions')} error={errors.medical_conditions} disabled={!canManage} />
        <Textarea name="notes" label={t('hlt.f.notes')} rows={2} value={v.notes} onChange={set('notes')} error={errors.notes} disabled={!canManage} />
        <p className="text-xs text-content-muted">{t('hlt.privacy_hint')}</p>
        {canManage && <div><Button type="submit" data-action="save-health">{t('common.save')}</Button></div>}
      </form>
    </Card>
  )
}
