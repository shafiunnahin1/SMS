import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import api from '../../../api/axios'
import { useTerms } from '../../../hooks/useTerms'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import StatusBadge from '../../../components/StatusBadge'
import List from '../../../ui/variants/List'
import Modal from '../../../ui/variants/Modal'
import { Input, Select } from '../../../components/FormField'
import Ltr from '../../../components/bidi/Ltr'
import RowActions from '../../../features/academic/RowActions'
import { useCrud, clean } from '../../../features/academic/useCrud'

export const EXAM_TYPES = ['term', 'class_test', 'weekly', 'model_test', 'admission']

// Step 4.5 /admin/exams: exams of a class/course (or one batch). Creating one copies every subject of the program; a row opens it.
export default function ExamList() {
  const { t } = useTranslation()
  const term = useTerms()
  const navigate = useNavigate()
  const { list, save, remove } = useCrud('exams')
  const programs = useCrud('programs')
  const [adding, setAdding] = useState(false)
  const { register, handleSubmit, reset, watch, setError, formState: { errors, isSubmitting } } = useForm()
  const programId = watch('program_id')
  const batches = useQuery({ queryKey: ['batches', { program_id: programId }], enabled: Boolean(programId) && adding,
    queryFn: () => api.get('/batches', { params: { program_id: programId } }).then(r => r.data.data) })
  const open = () => { reset({ exam_type: 'term', academic_year: new Date().getFullYear(), program_id: '', batch_id: '' }); setAdding(true) }
  const onSubmit = async (v) => {
    const exam = await save(clean({ ...v, academic_year: Number(v.academic_year) }), null, setError)
    if (exam) { setAdding(false); navigate(`/admin/exams/${exam.id}`) }
  }
  const columns = [
    { key: 'name', label: t('exams.name'), primary: true, render: r => <span dir="auto">{r.name}</span> },
    { key: 'program', label: term('program'), render: r => <span dir="auto">{r.program?.name}{r.batch ? ` — ${r.batch.name}` : ''}</span> },
    { key: 'exam_type', label: t('exams.type'), render: r => t(`exams.types.${r.exam_type}`) },
    { key: 'academic_year', label: t('exams.year'), render: r => <Ltr>{r.academic_year}</Ltr> },
    { key: 'status', label: t('academic.status'), render: r => <StatusBadge status={r.status} /> },
    { key: 'actions', label: t('common.actions'), action: true, render: r => <RowActions name={r.name} onDelete={r.has_results ? null : () => remove(r)} /> },
  ]
  return (
    <div>
      <PageHeader title={t('exams.title')} actions={<Button onClick={open}><Plus aria-hidden="true" className="h-4 w-4" />{t('exams.add')}</Button>} />
      <Card><List columns={columns} rows={list.data ?? []} loading={list.isPending} error={list.isError} onRetry={list.refetch} onRowClick={r => navigate(`/admin/exams/${r.id}`)} /></Card>
      <Modal open={adding} onClose={() => setAdding(false)} title={t('exams.add')}>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2" noValidate>
          <Input label={t('exams.name')} error={errors.name?.message} {...register('name', { required: t('exams.name') })} />
          <Select label={t('exams.type')} options={EXAM_TYPES.map(x => ({ value: x, label: t(`exams.types.${x}`) }))} {...register('exam_type')} />
          <Select label={term('program')} placeholder="—" error={errors.program_id?.message}
            options={(programs.list.data ?? []).map(p => ({ value: p.id, label: p.name }))} {...register('program_id', { required: term('program') })} />
          <Select label={`${term('batch')} (${t('exams.optional')})`} placeholder={t('exams.whole_program', { unit: term('batches') })} error={errors.batch_id?.message}
            options={(batches.data ?? []).map(b => ({ value: b.id, label: b.name }))} {...register('batch_id')} />
          <Input label={t('exams.year')} ltr inputMode="numeric" error={errors.academic_year?.message} {...register('academic_year', { required: t('exams.year') })} />
          <div />
          <Input label={t('exams.start_date')} type="date" ltr error={errors.start_date?.message} {...register('start_date')} />
          <Input label={t('exams.end_date')} type="date" ltr error={errors.end_date?.message} {...register('end_date')} />
          <p className="sm:col-span-2 text-sm text-content-muted">{t('exams.subjects_hint', { unit: term('program') })}</p>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdding(false)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
