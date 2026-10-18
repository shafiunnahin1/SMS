import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { Plus } from 'lucide-react'
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

const STATUSES = ['active', 'inactive', 'on_leave']

// Step 4.1 /admin/teachers. A new teacher gets a login without a known password: they set it with "Forgot password".
// Salary is payroll data (D33, Release 3) - not on this page.
export default function TeacherList() {
  const { t } = useTranslation()
  const { list, save, remove } = useCrud('teachers')
  const [editing, setEditing] = useState(null)
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm()
  const open = (row) => { reset(row?.id ? row : {}); setEditing(row ?? {}) }
  const onSubmit = async (v) => {
    const body = clean({ name: v.name, phone: v.phone, email: v.email, employee_id: v.employee_id, designation: v.designation,
      department: v.department, joining_date: v.joining_date, qualification: v.qualification, ...(editing?.id ? { status: v.status } : {}) })
    if (await save(body, editing?.id, setError)) setEditing(null)
  }
  const columns = [
    { key: 'name', label: t('teachers.name'), primary: true, render: r => <span dir="auto">{r.name}</span> },
    { key: 'employee_id', label: t('teachers.employee_id'), render: r => <Ltr>{r.employee_id}</Ltr> },
    { key: 'phone', label: t('teachers.phone'), render: r => <Ltr>{r.phone}</Ltr> },
    { key: 'designation', label: t('teachers.designation'), render: r => <span dir="auto">{r.designation}</span> },
    { key: 'status', label: t('teachers.status'), render: r => <StatusBadge status={r.status} /> },
    { key: 'actions', label: t('common.actions'), action: true, render: r => <RowActions name={r.name} onEdit={() => open(r)} onDelete={() => remove(r)} /> },
  ]
  return (
    <div>
      <PageHeader title={t('teachers.title')} actions={<Button onClick={() => open()}><Plus aria-hidden="true" className="h-4 w-4" />{t('teachers.add')}</Button>} />
      <Card><List columns={columns} rows={list.data ?? []} loading={list.isPending} error={list.isError} onRetry={list.refetch} /></Card>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? t('teachers.edit') : t('teachers.add')}>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2" noValidate>
          <Input label={t('teachers.name')} error={errors.name?.message} {...register('name', { required: t('teachers.name') })} />
          <Input label={t('teachers.phone')} ltr inputMode="tel" placeholder="01XXXXXXXXX" error={errors.phone?.message} {...register('phone')} />
          <Input label={t('teachers.email')} ltr type="email" error={errors.email?.message} {...register('email')} />
          <Input label={t('teachers.employee_id')} ltr hint={t('teachers.auto_id')} error={errors.employee_id?.message} {...register('employee_id')} />
          <Input label={t('teachers.designation')} error={errors.designation?.message} {...register('designation')} />
          <Input label={t('teachers.department')} error={errors.department?.message} {...register('department')} />
          <Input label={t('teachers.joining_date')} type="date" ltr error={errors.joining_date?.message} {...register('joining_date')} />
          <Input label={t('teachers.qualification')} error={errors.qualification?.message} {...register('qualification')} />
          {editing?.id && <Select label={t('teachers.status')} options={STATUSES.map(s => ({ value: s, label: t(`teachers.statuses.${s}`) }))} {...register('status')} />}
          {!editing?.id && <p className="sm:col-span-2 text-xs text-content-muted">{t('teachers.login_hint')}</p>}
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
