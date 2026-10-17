import { useTranslation } from 'react-i18next'
import { useForm, useFieldArray } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import api from '../../api/axios'
import { useTerms } from '../../hooks/useTerms'
import { useInstitutionStore } from '../../store/institutionStore'
import Button from '../../components/Button'
import { Input, Select } from '../../components/FormField'
import { useCrud, clean } from './useCrud'

const STATUSES = ['upcoming', 'running', 'completed', 'archived']
const SHIFTS = ['morning', 'day', 'evening']

// POST/PUT /batches. The program field exists only where the institution uses programs (a private batch gets its default one);
// teacher fields only where the institution type has teachers. Subject teachers: one row per (subject, teacher); "all subjects" = 0.
export default function BatchForm({ batch, onDone, onCancel }) {
  const { t } = useTranslation()
  const term = useTerms()
  const usePrograms = useInstitutionStore(s => s.settings?.use_programs) !== false
  const hasTeachers = (useInstitutionStore(s => s.roles) ?? []).includes('teacher')
  const { save } = useCrud('batches')
  const programs = useCrud('programs', { enabled: usePrograms })
  const teachers = useCrud('teachers', { enabled: hasTeachers })
  const { register, handleSubmit, control, watch, setError, formState: { errors, isSubmitting } } = useForm({
    defaultValues: batch?.id
      ? { ...batch, teacher_id: batch.teacher_id ?? '', shift: batch.shift ?? '', subject_teachers: (batch.subject_teachers ?? []).map(r => ({ subject_id: String(r.subject_id), teacher_id: String(r.teacher_id) })) }
      : { status: 'running', max_capacity: 40, subject_teachers: [] },
  })
  const rows = useFieldArray({ control, name: 'subject_teachers' })
  const programId = watch('program_id')
  const subjects = useQuery({ queryKey: ['subjects', { program_id: programId }], queryFn: () => api.get('/subjects', { params: { program_id: programId } }).then(r => r.data.data), enabled: hasTeachers && Boolean(programId) })

  const onSubmit = async (v) => {
    const body = clean({
      ...(usePrograms ? { program_id: v.program_id } : {}), name: v.name, shift: v.shift, room: v.room, max_capacity: v.max_capacity,
      monthly_fee: v.monthly_fee, start_date: v.start_date, end_date: v.end_date, status: v.status,
      ...(hasTeachers ? { teacher_id: v.teacher_id, subject_teachers: v.subject_teachers.filter(r => r.teacher_id !== '').map(r => ({ subject_id: Number(r.subject_id || 0), teacher_id: Number(r.teacher_id) })) } : {}),
    })
    const saved = await save(body, batch?.id, setError)
    if (saved) onDone(saved)
  }
  const teacherOptions = (teachers.list.data ?? []).filter(x => x.status !== 'inactive').map(x => ({ value: x.id, label: x.name }))
  const subjectOptions = [{ value: '0', label: t('academic.all_subjects') }, ...(subjects.data ?? []).map(s => ({ value: String(s.id), label: s.name }))]

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2" noValidate>
      {usePrograms && <Select label={term('program')} placeholder={t('academic.pick')} options={(programs.list.data ?? []).map(p => ({ value: p.id, label: p.name }))}
        error={errors.program_id?.message} {...register('program_id', { required: term('program') })} />}
      <Input label={t('academic.name')} error={errors.name?.message} {...register('name', { required: t('academic.name') })} />
      {hasTeachers && <Select label={t('academic.class_teacher')} placeholder={t('academic.no_teacher')} options={teacherOptions} error={errors.teacher_id?.message} {...register('teacher_id')} />}
      <Select label={t('academic.shift')} placeholder={t('common.none')} options={SHIFTS.map(s => ({ value: s, label: t(`academic.shifts.${s}`) }))} {...register('shift')} />
      <Input label={t('academic.room')} error={errors.room?.message} {...register('room')} />
      <Input label={t('academic.capacity')} ltr inputMode="numeric" error={errors.max_capacity?.message} {...register('max_capacity')} />
      <Input label={t('academic.monthly_fee')} ltr inputMode="decimal" error={errors.monthly_fee?.message} {...register('monthly_fee')} />
      <Select label={t('academic.status')} options={STATUSES.map(s => ({ value: s, label: t(`academic.statuses.${s}`) }))} {...register('status')} />
      <Input label={t('academic.start_date')} type="date" ltr error={errors.start_date?.message} {...register('start_date')} />
      <Input label={t('academic.end_date')} type="date" ltr error={errors.end_date?.message} {...register('end_date')} />

      {hasTeachers && (
        <fieldset className="sm:col-span-2 flex flex-col gap-2" data-testid="subject-teachers">
          <legend className="text-sm font-medium mb-1">{t('academic.subject_teachers')}</legend>
          {rows.fields.map((f, i) => (
            <div key={f.id} className="flex flex-wrap items-end gap-2">
              <Select label={t('academic.subject')} options={subjectOptions} className="flex-1 min-w-40" error={errors[`subject_teachers.${i}.subject_id`]?.message} {...register(`subject_teachers.${i}.subject_id`)} />
              <Select label={t('academic.teacher')} placeholder={t('academic.pick')} options={teacherOptions} className="flex-1 min-w-40" {...register(`subject_teachers.${i}.teacher_id`)} />
              <button type="button" onClick={() => rows.remove(i)} aria-label={t('academic.remove_row')} className="h-10 w-10 inline-flex items-center justify-center rounded-token hover:bg-primary-soft">
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          ))}
          <div><Button variant="ghost" onClick={() => rows.append({ subject_id: '0', teacher_id: '' })}><Plus aria-hidden="true" className="h-4 w-4" />{t('academic.add_row')}</Button></div>
        </fieldset>
      )}
      <div className="sm:col-span-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
      </div>
    </form>
  )
}
