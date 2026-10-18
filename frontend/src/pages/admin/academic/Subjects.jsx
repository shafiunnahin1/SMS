import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { Plus } from 'lucide-react'
import { useTerms } from '../../../hooks/useTerms'
import { useInstitutionStore } from '../../../store/institutionStore'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import List from '../../../ui/variants/List'
import Modal from '../../../ui/variants/Modal'
import { Input, Select } from '../../../components/FormField'
import Ltr from '../../../components/bidi/Ltr'
import Check from '../../../features/academic/Check'
import RowActions from '../../../features/academic/RowActions'
import { useCrud, clean } from '../../../features/academic/useCrud'

// Step 4.1 /admin/academic/subjects: each subject belongs to one program; its teacher is optional
export default function Subjects() {
  const { t } = useTranslation()
  const term = useTerms()
  const hasTeachers = (useInstitutionStore(s => s.roles) ?? []).includes('teacher')
  const [programId, setProgramId] = useState('')
  const programs = useCrud('programs')
  const teachers = useCrud('teachers', { enabled: hasTeachers })
  const { list, save, remove } = useCrud('subjects', { params: programId ? { program_id: programId } : undefined })
  const [editing, setEditing] = useState(null)
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm()
  const open = (row) => { reset(row?.id ? { ...row, teacher_id: row.teacher_id ?? '' } : { program_id: programId, full_marks: 100, pass_marks: 33 }); setEditing(row ?? {}) }
  const onSubmit = async (v) => {
    const body = clean({ program_id: v.program_id, name: v.name, code: v.code, full_marks: v.full_marks, pass_marks: v.pass_marks,
      is_optional: Boolean(v.is_optional), ...(hasTeachers ? { teacher_id: v.teacher_id } : {}) })
    if (await save(body, editing?.id, setError)) setEditing(null)
  }
  const programOptions = (programs.list.data ?? []).map(p => ({ value: p.id, label: p.name }))
  const columns = [
    { key: 'name', label: t('academic.name'), primary: true, render: r => <span dir="auto">{r.name}</span> },
    { key: 'program', label: term('program'), render: r => <span dir="auto">{r.program?.name}</span> },
    { key: 'code', label: t('academic.code'), render: r => <Ltr>{r.code}</Ltr> },
    { key: 'marks', label: `${t('academic.full_marks')} / ${t('academic.pass_marks')}`, render: r => <Ltr>{r.full_marks} / {r.pass_marks}</Ltr> },
    ...(hasTeachers ? [{ key: 'teacher', label: t('academic.teacher'), render: r => <span dir="auto">{r.teacher?.name ?? t('academic.no_teacher')}</span> }] : []),
    { key: 'actions', label: t('common.actions'), action: true, render: r => <RowActions name={r.name} onEdit={() => open(r)} onDelete={() => remove(r)} /> },
  ]
  return (
    <div>
      <PageHeader title={t('academic.subjects_title')} actions={<Button onClick={() => open()}><Plus aria-hidden="true" className="h-4 w-4" />{t('common.add')}</Button>} />
      <Card className="flex flex-col gap-3">
        <Select label={term('program')} placeholder={t('common.all')} options={programOptions} value={programId} onChange={e => setProgramId(e.target.value)} className="sm:w-64" />
        <List columns={columns} rows={list.data ?? []} loading={list.isPending} error={list.isError} onRetry={list.refetch} />
      </Card>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? t('common.edit') : t('common.add')}>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2" noValidate>
          <Select label={term('program')} placeholder={t('academic.pick')} options={programOptions} error={errors.program_id?.message} {...register('program_id', { required: term('program') })} />
          <Input label={t('academic.name')} error={errors.name?.message} {...register('name', { required: t('academic.name') })} />
          <Input label={t('academic.code')} ltr error={errors.code?.message} {...register('code')} />
          {hasTeachers && <Select label={t('academic.teacher')} placeholder={t('academic.no_teacher')} options={(teachers.list.data ?? []).map(x => ({ value: x.id, label: x.name }))} error={errors.teacher_id?.message} {...register('teacher_id')} />}
          <Input label={t('academic.full_marks')} ltr inputMode="numeric" error={errors.full_marks?.message} {...register('full_marks')} />
          <Input label={t('academic.pass_marks')} ltr inputMode="numeric" error={errors.pass_marks?.message} {...register('pass_marks')} />
          <Check label={t('academic.optional')} {...register('is_optional')} />
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
