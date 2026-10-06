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

// POST /students: admission + first enrollment; the student ID is generated when left empty; the guardian phone makes the parent account
export default function StudentAdd() {
  const { t } = useTranslation()
  const term = useTerms()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const batches = useQuery({ queryKey: ['batches'], queryFn: () => api.get('/batches').then(r => r.data.data) })
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm()

  const onSubmit = async (values) => {
    const body = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ''))
    try {
      const { data } = await api.post('/students', body)
      useUiStore.getState().addToast(t('students.admitted', { id: data.data.student_id }))
      qc.invalidateQueries({ queryKey: ['students'] })
      navigate('/admin/students')
    } catch (e) {
      Object.entries(e.response?.data?.errors ?? {}).forEach(([f, m]) => setError(f, { message: m[0] }))
    }
  }

  if (batches.isPending) return <><PageHeader title={t('students.add')} /><Card><Loader type="form" fields={5} /></Card></>
  if (batches.isError) return <ErrorState onRetry={batches.refetch} />
  const options = batches.data.map(b => ({ value: b.id, label: b.program ? `${b.program.name} — ${b.name}` : b.name }))

  return (
    <div>
      <PageHeader title={t('students.add')} />
      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2" noValidate>
          <Input label={t('students.name')} error={errors.name?.message} {...register('name', { required: t('students.name') })} />
          <Input label={t('students.guardian_phone')} ltr inputMode="tel" placeholder="01XXXXXXXXX" error={errors.guardian_phone?.message} {...register('guardian_phone', { required: t('students.guardian_phone') })} />
          <Input label={t('students.father_name')} error={errors.father_name?.message} {...register('father_name')} />
          <Input label={t('students.mother_name')} error={errors.mother_name?.message} {...register('mother_name')} />
          <Select label={term('batch')} placeholder={t('students.select_unit')} options={options} error={errors.batch_id?.message} {...register('batch_id')} />
          <Input label={t('students.roll')} ltr inputMode="numeric" error={errors.roll_no?.message} {...register('roll_no')} />
          <Input label={t('students.student_id')} ltr hint={t('students.auto_id')} error={errors.student_id?.message} {...register('student_id')} />
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => navigate('/admin/students')}>{t('common.cancel')}</Button>
            <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
          </div>
        </form>
      </Card>
    </div>
  )
}
