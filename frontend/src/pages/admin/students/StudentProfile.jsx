import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import api from '../../../api/axios'
import { useTerms } from '../../../hooks/useTerms'
import { useUiStore } from '../../../store/uiStore'
import { fmtDate } from '../../../i18n/format'
import { useLocale } from '../../../ui/I18nProvider'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import Loader from '../../../components/Loader'
import StatusBadge from '../../../components/StatusBadge'
import FileUpload from '../../../components/FileUpload'
import { ErrorState } from '../../../components/StateViews'
import { Input, Select } from '../../../components/FormField'
import Ltr from '../../../components/bidi/Ltr'
import Tabs from '../../../ui/variants/Tabs'
import List from '../../../ui/variants/List'
import Modal from '../../../ui/variants/Modal'
import { toFormData, multipart } from '../../../features/students/formData'
import { usePrint } from '../../../hooks/usePrint'

const GENDERS = ['male', 'female', 'other']
const PROFILE_FIELDS = ['name', 'student_id', 'guardian_phone', 'father_name', 'mother_name', 'gender', 'date_of_birth', 'blood_group', 'religion', 'address', 'studying_at', 'admission_date']

// Step 4.2 /admin/students/:id - profile (edit, photo), enrollments (history, another batch, move, end), consents (paper)
export default function StudentProfile() {
  const { id } = useParams()
  const { t } = useTranslation()
  const term = useTerms()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [tab, setTab] = useState('profile')
  const student = useQuery({ queryKey: ['students', 'one', id], queryFn: () => api.get(`/students/${id}`).then(r => r.data.data) })

  if (student.isPending) return <Loader type="page" />
  if (student.isError) return <ErrorState onRetry={student.refetch} />
  const s = student.data
  const refresh = () => qc.invalidateQueries({ queryKey: ['students'] })
  const remove = () => useUiStore.getState().openConfirm({
    title: t('common.delete_confirm', { name: s.name }), description: t('students.delete_hint', { unit: term('batch') }), type: 'danger', confirmLabel: t('common.delete'),
    onConfirm: async () => { await api.delete(`/students/${id}`); useUiStore.getState().addToast(t('common.deleted')); refresh(); navigate('/admin/students') },
  })
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={<span className="inline-flex items-center gap-3">
        {s.photo_url && <img src={s.photo_url} alt="" className="h-10 w-10 rounded-full object-cover" />}
        <span dir="auto">{s.name}</span> <span className="text-sm text-content-muted"><Ltr>{s.student_id}</Ltr></span></span>}
        actions={<Button variant="secondary" onClick={remove}><Trash2 aria-hidden="true" className="h-4 w-4" />{t('common.delete')}</Button>} />
      <Tabs items={[{ key: 'profile', label: t('students.profile') }, { key: 'enrollments', label: t('students.enrollments') }, { key: 'consents', label: t('students.consents') }]}
        value={tab} onChange={setTab} label={s.name} />
      {tab === 'profile' && <ProfileForm student={s} onSaved={refresh} />}
      {tab === 'enrollments' && <Enrollments studentId={id} onChanged={refresh} />}
      {tab === 'consents' && <Consents studentId={id} />}
    </div>
  )
}

function ProfileForm({ student, onSaved }) {
  const { t } = useTranslation()
  const [photo, setPhoto] = useState(null)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    defaultValues: Object.fromEntries(PROFILE_FIELDS.map(f => [f, student[f] ?? ''])),
  })
  const onSubmit = async (v) => {
    try {
      await api.post(`/students/${student.id}`, toFormData({ ...v, photo }, 'put'), multipart)
      useUiStore.getState().addToast(t('common.saved'))
      onSaved()
    } catch (e) {
      Object.entries(e.response?.data?.errors ?? {}).forEach(([f, m]) => setError(f, { message: m[0] }))
    }
  }
  const text = (f, extra = {}) => <Input key={f} label={t(`students.${f === 'student_id' ? 'student_id' : f}`)} error={errors[f]?.message} {...extra} {...register(f)} />
  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2" noValidate>
        {text('name')}
        {text('student_id', { ltr: true })}
        {text('guardian_phone', { ltr: true, inputMode: 'tel' })}
        {text('father_name')}
        {text('mother_name')}
        <Select label={t('students.gender')} placeholder={t('academic.pick')} options={GENDERS.map(g => ({ value: g, label: t(`students.genders.${g}`) }))} {...register('gender')} />
        {text('date_of_birth', { type: 'date', ltr: true })}
        {text('blood_group', { ltr: true })}
        {text('religion')}
        {text('studying_at')}
        {text('admission_date', { type: 'date', ltr: true })}
        {text('address')}
        <div className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium">{t('students.photo')}</span>
          <FileUpload accept="image/jpeg,image/png,image/webp" maxSize={2} preview onUpload={files => setPhoto(files[0])} />
          {errors.photo && <p className="text-xs text-red-600">{errors.photo.message}</p>}
        </div>
        <div className="sm:col-span-2 flex justify-end"><Button type="submit" loading={isSubmitting}>{t('common.save')}</Button></div>
      </form>
    </Card>
  )
}

function Enrollments({ studentId, onChanged }) {
  const { t } = useTranslation()
  const term = useTerms()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['students', 'enrollments', studentId], queryFn: () => api.get(`/students/${studentId}/enrollments`).then(r => r.data.data) })
  const batches = useQuery({ queryKey: ['batches', {}], queryFn: () => api.get('/batches').then(r => r.data.data) })
  const [action, setAction] = useState(null)        // { kind: 'add' | 'transfer' | 'end', row? }
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm()
  const open = (kind, row) => { reset(kind === 'end' ? { status: 'dropped' } : {}); setAction({ kind, row }) }
  const done = () => { setAction(null); qc.invalidateQueries({ queryKey: ['students', 'enrollments', studentId] }); onChanged() }
  const submit = async (v) => {
    try {
      if (action.kind === 'add') await api.post('/enrollments', { student_id: Number(studentId), batch_id: v.batch_id, roll_no: v.roll_no || null })
      if (action.kind === 'transfer') await api.post(`/enrollments/${action.row.id}/transfer`, { batch_id: v.batch_id, roll_no: v.roll_no || null })
      if (action.kind === 'end') await api.post(`/enrollments/${action.row.id}/end`, { status: v.status })
      useUiStore.getState().addToast(t('common.saved'))
      done()
    } catch (e) {
      Object.entries(e.response?.data?.errors ?? {}).forEach(([f, m]) => setError(f, { message: m[0] }))
      if (e.response?.status === 422 && !e.response.data.errors) useUiStore.getState().addToast(e.response.data.message, 'error')
    }
  }
  const batchOptions = (batches.data ?? []).map(b => ({ value: b.id, label: b.program ? `${b.program.name} — ${b.name}` : b.name }))
  const columns = [
    { key: 'batch', label: term('batch'), primary: true, render: r => <span dir="auto">{r.program?.name} — {r.batch?.name}</span> },
    { key: 'roll_no', label: t('academic.roll'), numeric: true },
    { key: 'status', label: t('academic.status'), render: r => <span className="inline-flex gap-1"><StatusBadge status={r.status === 'active' ? 'active' : r.status} />{r.is_primary && <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary-soft text-primary-fg">{t('students.primary')}</span>}</span> },
    { key: 'since', label: t('students.since'), render: r => r.enrolled_at ? <Ltr>{fmtDate(r.enrolled_at, locale)}</Ltr> : '—' },
    { key: 'actions', label: t('common.actions'), action: true, render: r => r.status === 'active' && (
      <span className="inline-flex gap-1" onClick={e => e.stopPropagation()}>
        <Button variant="ghost" onClick={() => open('transfer', r)}>{t('students.transfer')}</Button>
        <Button variant="ghost" onClick={() => open('end', r)}>{t('students.end')}</Button>
      </span>) },
  ]
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex justify-end"><Button variant="secondary" onClick={() => open('add')}>{t('students.enroll_more', { unit: term('batch') })}</Button></div>
      <List columns={columns} rows={list.data ?? []} loading={list.isPending} error={list.isError} onRetry={list.refetch} />
      <Modal open={action !== null} onClose={() => setAction(null)} title={action?.kind === 'end' ? t('students.end') : action?.kind === 'transfer' ? t('students.transfer') : t('students.enroll_more', { unit: term('batch') })}>
        <form onSubmit={handleSubmit(submit)} className="grid gap-3" noValidate>
          {action?.kind === 'end'
            ? <Select label={t('academic.status')} options={[{ value: 'dropped', label: t('students.end_dropped') }, { value: 'completed', label: t('students.end_completed') }]} {...register('status')} />
            : <>
                <Select label={term('batch')} placeholder={t('academic.pick')} options={batchOptions} error={errors.batch_id?.message ?? errors.student_id?.message} {...register('batch_id', { required: term('batch') })} />
                <Input label={t('academic.roll')} ltr inputMode="numeric" error={errors.roll_no?.message} {...register('roll_no')} />
              </>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAction(null)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </Card>
  )
}

function Consents({ studentId }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const { preview, loading } = usePrint()
  const list = useQuery({ queryKey: ['students', 'consents', studentId], queryFn: () => api.get(`/students/${studentId}/consents`).then(r => r.data.data) })
  const set = async (type, status) => {
    await api.post(`/students/${studentId}/consents`, { type, status })
    useUiStore.getState().addToast(t('common.saved'))
    qc.invalidateQueries({ queryKey: ['students', 'consents', studentId] })
  }
  if (list.isPending) return <Card><Loader type="skeleton" rows={4} /></Card>
  if (list.isError) return <ErrorState onRetry={list.refetch} />
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <p className="text-sm text-content-muted">{t('students.consent_paper')}</p>
        <Button variant="secondary" loading={loading} onClick={() => preview(`/students/${studentId}/consent-form.pdf`)}>{t('students.consent_form_pdf')}</Button>
      </div>
      <ul className="flex flex-col divide-y divide-line">
        {list.data.map(c => (
          <li key={c.type} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <span>
              <span className="font-medium">{t(`consent.${c.type}.title`)}</span>
              <span className="block text-xs text-content-muted">
                {c.status ? `${t(c.status === 'granted' ? 'students.grant' : 'students.revoke')} · ${t('students.via', { method: t(`students.methods.${c.method}`) })}${(c.granted_at ?? c.revoked_at) ? ` · ${fmtDate(c.granted_at ?? c.revoked_at, locale)}` : ''}` : t('students.not_recorded')}
              </span>
            </span>
            <span className="inline-flex gap-1" role="group" aria-label={t(`consent.${c.type}.title`)}>
              <Button variant={c.status === 'granted' ? 'primary' : 'secondary'} onClick={() => set(c.type, 'granted')} aria-pressed={c.status === 'granted'}>{t('students.grant')}</Button>
              <Button variant={c.status === 'revoked' ? 'primary' : 'secondary'} onClick={() => set(c.type, 'revoked')} aria-pressed={c.status === 'revoked'}>{t('students.revoke')}</Button>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
