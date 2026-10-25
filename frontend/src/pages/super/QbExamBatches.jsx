import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Ltr from '../../components/bidi/Ltr'
import { Input, Select } from '../../components/FormField'
import { EmptyState } from '../../components/StateViews'
import List from '../../ui/variants/List'

const KEY = ['super', 'qb-exam-batches']

// D165 (3) ST.2 /super-admin/qb/exam-batches: SSC / HSC exam batches - the classes each covers and its exam end date. A student
// of a covered class who picks the batch keeps what they buy until that day; moving the date moves every such purchase.
export default function QbExamBatches() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [edit, setEdit] = useState(null)        // null | {} (new) | row
  const rows = useQuery({ queryKey: KEY, queryFn: () => api.get('/super/qb/exam-batches').then(r => r.data.data) })
  const classes = useQuery({ queryKey: ['learner-class-levels'], queryFn: () => api.get('/public/learners/class-levels').then(r => r.data.data) })
  const className = (id) => { const c = (classes.data ?? []).find(x => x.id === id); return c ? (i18n.language === 'en' ? c.name_en : c.name_bn) : `#${id}` }
  const cols = [
    { key: 'name', label: t('exam_batch.name'), primary: true, render: b => <span dir="auto">{b.name}</span> },
    { key: 'kind', label: t('exam_batch.kind'), render: b => b.kind.toUpperCase() },
    { key: 'classes', label: t('exam_batch.classes'), render: b => b.class_level_ids.map(className).join(', ') },
    { key: 'exam_ends_on', label: t('exam_batch.ends'), render: b => <Ltr>{String(b.exam_ends_on).slice(0, 10)}</Ltr> },
    { key: 'is_active', label: t('exam_batch.active'), render: b => (b.is_active ? t('exam_batch.active') : '—') },
    { key: 'actions', label: t('common.actions'), action: true, render: b => <Button variant="secondary" onClick={() => setEdit(b)} data-action="edit">{t('common.edit')}</Button> },
  ]
  return (
    <div className="flex flex-col gap-4" data-testid="qb-exam-batches">
      <PageHeader title={t('exam_batch.title')} actions={<Button onClick={() => setEdit({})} data-action="new">{t('exam_batch.new')}</Button>} />
      <p className="text-sm text-content-muted">{t('exam_batch.hint')}</p>
      {edit && <BatchForm row={edit} classes={classes.data ?? []} className={className} onDone={() => { setEdit(null); qc.invalidateQueries({ queryKey: KEY }) }} onCancel={() => setEdit(null)} />}
      <Card><List columns={cols} rows={rows.data ?? []} loading={rows.isPending} error={rows.isError} onRetry={rows.refetch} empty={<EmptyState title={t('exam_batch.empty')} />} /></Card>
    </div>
  )
}

function BatchForm({ row, classes, className, onDone, onCancel }) {
  const { t } = useTranslation()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: {
    name: row.name ?? '', kind: row.kind ?? 'ssc', exam_ends_on: row.exam_ends_on ? String(row.exam_ends_on).slice(0, 10) : '',
    class_level_ids: (row.class_level_ids ?? []).map(String), is_active: row.is_active ?? true } })
  const submit = async (v) => {
    const body = { name: v.name, kind: v.kind, exam_ends_on: v.exam_ends_on, class_level_ids: (v.class_level_ids || []).map(Number), is_active: Boolean(v.is_active) }
    try {
      const { data } = row.id ? await api.put(`/super/qb/exam-batches/${row.id}`, body) : await api.post('/super/qb/exam-batches', body)
      useUiStore.getState().addToast(data.data?.purchases_moved ? t('exam_batch.moved', { n: data.data.purchases_moved }) : t('common.saved'))
      onDone()
    } catch (e) { Object.entries(e.response?.data?.errors ?? {}).forEach(([k, m]) => setError(k.split('.')[0], { message: m[0] })) }
  }
  return (
    <Card>
      <form onSubmit={handleSubmit(submit)} className="grid gap-3 sm:grid-cols-2" noValidate data-testid="exam-batch-form">
        <Input label={t('exam_batch.name')} placeholder="SSC 2027" error={errors.name?.message} {...register('name', { required: t('super.required') })} />
        <Select label={t('exam_batch.kind')} options={[{ value: 'ssc', label: 'SSC' }, { value: 'hsc', label: 'HSC' }]} {...register('kind')} />
        <Input label={t('exam_batch.ends')} type="date" ltr error={errors.exam_ends_on?.message} {...register('exam_ends_on', { required: t('super.required') })} />
        <fieldset className="flex flex-col gap-1">
          <legend className="text-sm">{t('exam_batch.classes')}</legend>
          <div className="flex flex-wrap gap-3">
            {classes.map(c => <label key={c.id} className="flex items-center gap-1 text-sm"><input type="checkbox" value={String(c.id)} {...register('class_level_ids')} />{className(c.id)}</label>)}
          </div>
          {errors.class_level_ids && <p className="text-xs text-red-600">{errors.class_level_ids.message}</p>}
        </fieldset>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register('is_active')} />{t('exam_batch.active')}</label>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
          <Button type="button" variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
        </div>
      </form>
    </Card>
  )
}
