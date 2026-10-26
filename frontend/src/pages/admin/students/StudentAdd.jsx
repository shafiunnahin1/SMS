import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../api/axios'
import { useTerms } from '../../../hooks/useTerms'
import { useUiStore } from '../../../store/uiStore'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import Loader from '../../../components/Loader'
import { ErrorState } from '../../../components/StateViews'
import { Input, Select } from '../../../components/FormField'
import FileUpload from '../../../components/FileUpload'
import Check from '../../../features/academic/Check'
import { toFormData, multipart } from '../../../features/students/formData'
import { useState } from 'react'

// POST /students: admission + first enrollment; the student ID is generated when left empty; the guardian phone makes the parent account.
// D169 STW.3 `staff`: no guardian-consent boxes (staff record no consent), back to the staff list, and the batch picker only when the
// staff batch list loads (it is limited to a teacher's own batches) - otherwise the head places the student later.
export default function StudentAdd({ staff = false }) {
  const { t } = useTranslation()
  const term = useTerms()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const back = staff ? '/staff/students' : '/admin/students'
  const batches = useQuery({ queryKey: ['batches', staff], queryFn: () => api.get('/batches').then(r => r.data.data), retry: staff ? false : undefined })
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: staff ? {} : { consent_data: true, consent_sms: true } })
  const [photo, setPhoto] = useState(null)

  const onSubmit = async (values) => {
    try {
      const { data } = await api.post('/students', toFormData({ ...values, photo }), multipart)
      useUiStore.getState().addToast(t('students.admitted', { id: data.data.student_id }))
      qc.invalidateQueries({ queryKey: ['students'] }); qc.invalidateQueries({ queryKey: ['staff-students'] })
      navigate(back)
    } catch (e) {
      Object.entries(e.response?.data?.errors ?? {}).forEach(([f, m]) => setError(f, { message: m[0] }))
    }
  }

  if (batches.isPending) return <><PageHeader title={t('students.add')} /><Card><Loader type="form" fields={5} /></Card></>
  if (batches.isError && !staff) return <ErrorState onRetry={batches.refetch} />
  const options = (batches.data ?? []).map(b => ({ value: b.id, label: b.program ? `${b.program.name} — ${b.name}` : b.name }))

  return (
    <div>
      <PageHeader title={t('students.add')} />
      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Input label={t('students.name')} error={errors.name?.message} {...register('name', { required: t('students.name') })} />
          <Input label={t('students.guardian_phone')} ltr inputMode="tel" placeholder="01XXXXXXXXX" error={errors.guardian_phone?.message} {...register('guardian_phone', { required: t('students.guardian_phone') })} />
          <Input label={t('students.father_name')} error={errors.father_name?.message} {...register('father_name')} />
          <Input label={t('students.mother_name')} error={errors.mother_name?.message} {...register('mother_name')} />
          {batches.isError ? <p className="text-sm text-content-muted sm:col-span-2" data-testid="staff-no-batch">{t('staff_context.batch_later', { unit: term('batch') })}</p>
            : <Select label={term('batch')} placeholder={t('students.select_unit')} options={options} error={errors.batch_id?.message} {...register('batch_id')} />}
          <Input label={t('students.roll')} ltr inputMode="numeric" error={errors.roll_no?.message} {...register('roll_no')} />
          <Input label={t('students.student_id')} ltr hint={t('students.auto_id')} error={errors.student_id?.message} {...register('student_id')} />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t('students.photo')}</span>
            <FileUpload accept="image/jpeg,image/png,image/webp" maxSize={2} preview onUpload={files => setPhoto(files[0])} />
            {errors.photo && <p className="text-xs text-red-600">{errors.photo.message}</p>}
          </div>
          {!staff && <fieldset className="sm:col-span-2 flex flex-col gap-1">
            <legend className="text-sm font-medium mb-1">{t('students.consent_title')}</legend>
            <Check label={t('students.consent_data')} {...register('consent_data')} />
            <Check label={t('students.consent_sms')} {...register('consent_sms')} />
          </fieldset>}
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => navigate(back)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
