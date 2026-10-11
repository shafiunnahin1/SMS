import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useTerms } from '../../../hooks/useTerms'
import { useModules } from '../../../hooks/useModules'
import { useLocale } from '../../../ui/I18nProvider'
import api from '../../../api/axios'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import StatusBadge from '../../../components/StatusBadge'
import List from '../../../ui/variants/List'
import Modal from '../../../ui/variants/Modal'
import { Input, Select } from '../../../components/FormField'
import Check from '../../../features/academic/Check'
import RowActions from '../../../features/academic/RowActions'
import { useCrud, clean } from '../../../features/academic/useCrud'

// Step 4.1 /admin/academic/programs: a school's classes, a coaching's courses - the word is the institution's term (D5).
// QB.1 (D65): with the question bank on, a program may name its platform class (students see that class's content first).
export default function Programs() {
  const { t } = useTranslation()
  const term = useTerms()
  const { list, save, remove } = useCrud('programs')
  const { has } = useModules()
  const { locale } = useLocale()
  const qbOn = has('question_bank')
  const qbClasses = useQuery({ queryKey: ['qb-class-levels'], queryFn: () => api.get('/qb/class-levels').then(r => r.data.data), enabled: qbOn })
  const [editing, setEditing] = useState(null)          // null = closed, {} = new, row = edit
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm()
  const open = (row) => { reset(row?.id ? { ...row, qb_class_level_id: row.qb_class_level_id ?? '' } : { is_active: true, qb_class_level_id: '' }); setEditing(row ?? {}) }
  const onSubmit = async (v) => {
    const body = clean({ name: v.name, numeric_name: v.numeric_name, code: v.code, course_fee: v.course_fee, is_active: Boolean(v.is_active),
      ...(qbOn ? { qb_class_level_id: v.qb_class_level_id === '' ? null : Number(v.qb_class_level_id) } : {}) })
    if (await save(body, editing?.id, setError)) setEditing(null)
  }
  const columns = [
    { key: 'name', label: t('academic.name'), primary: true, render: r => <span dir="auto">{r.name}</span> },
    { key: 'numeric_name', label: t('academic.numeric_name'), numeric: true },
    { key: 'batches_count', label: term('batches'), numeric: true },
    { key: 'is_active', label: t('academic.status'), render: r => <StatusBadge status={r.is_active ? 'active' : 'inactive'} /> },
    { key: 'actions', label: t('common.actions'), action: true, render: r => <RowActions name={r.name} onEdit={() => open(r)} onDelete={r.is_default ? null : () => remove(r)} /> },
  ]
  return (
    <div>
      <PageHeader title={term('programs')} actions={<Button onClick={() => open()}><Plus aria-hidden="true" className="h-4 w-4" />{t('academic.add_unit', { unit: term('program') })}</Button>} />
      <Card><List columns={columns} rows={list.data ?? []} loading={list.isPending} error={list.isError} onRetry={list.refetch} /></Card>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={t(editing?.id ? 'academic.edit_unit' : 'academic.add_unit', { unit: term('program') })}>
        <form id="program-form" onSubmit={handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2" noValidate>
          <Input label={t('academic.name')} error={errors.name?.message} {...register('name', { required: t('academic.name') })} />
          <Input label={t('academic.numeric_name')} ltr inputMode="numeric" error={errors.numeric_name?.message} {...register('numeric_name')} />
          <Input label={t('academic.code')} ltr error={errors.code?.message} {...register('code')} />
          <Input label={t('academic.course_fee')} ltr inputMode="decimal" error={errors.course_fee?.message} {...register('course_fee')} />
          {qbOn && <Select label={t('qb.platform_class')} placeholder={t('qb.none')} error={errors.qb_class_level_id?.message}
            options={(qbClasses.data ?? []).map(c => ({ value: String(c.id), label: locale === 'bn' ? c.name_bn : c.name_en }))} {...register('qb_class_level_id')} />}
          <Check label={t('academic.active')} {...register('is_active')} />
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
