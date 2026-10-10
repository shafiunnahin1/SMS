import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { Plus, Pencil } from 'lucide-react'
import { useLocale } from '../../../ui/I18nProvider'
import { fmtMoney } from '../../../i18n/format'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import List from '../../../ui/variants/List'
import Modal from '../../../ui/variants/Modal'
import { Input, Select } from '../../../components/FormField'
import Ltr from '../../../components/bidi/Ltr'
import { useCrud, clean } from '../../../features/academic/useCrud'

const FREQUENCIES = ['monthly', 'yearly', 'once']

// Step 4.4 /admin/fees/categories: the institution's fee heads. No delete in R1 (money points at them, D32); once money was
// collected the frequency is fixed (the API answers 422 in_use) - the field is disabled for such a head.
export default function FeeCategories() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const { list, save } = useCrud('fees/categories')
  const [editing, setEditing] = useState(null)
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm()
  const open = (row) => { reset(row?.id ? row : { frequency: 'monthly', applicable_to: 'all' }); setEditing(row ?? {}) }
  const onSubmit = async (v) => {
    if (await save(clean({ name: v.name, amount: v.amount, frequency: v.frequency ?? editing.frequency, applicable_to: v.applicable_to }), editing?.id, setError)) setEditing(null)
  }
  const columns = [
    { key: 'name', label: t('fees.category'), primary: true, render: r => <span dir="auto">{r.name}</span> },
    { key: 'amount', label: t('fees.amount'), numeric: true, render: r => <Ltr>{fmtMoney(r.amount, locale)}</Ltr> },
    { key: 'frequency', label: t('fees.frequency'), render: r => t(`fees.frequencies.${r.frequency}`) },
    { key: 'applicable_to', label: t('fees.applies_to'), render: r => t(`fees.applies.${r.applicable_to}`) },
    { key: 'actions', label: t('common.actions'), action: true, render: r => (
      <Button variant="ghost" onClick={() => open(r)} aria-label={`${t('common.edit')} ${r.name}`}><Pencil aria-hidden="true" className="h-4 w-4" /></Button>
    ) },
  ]
  return (
    <div>
      <PageHeader title={t('fees.categories_title')} actions={<Button onClick={() => open()}><Plus aria-hidden="true" className="h-4 w-4" />{t('fees.add_category')}</Button>} />
      <Card><List columns={columns} rows={list.data ?? []} loading={list.isPending} error={list.isError} onRetry={list.refetch} /></Card>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={t(editing?.id ? 'fees.edit_category' : 'fees.add_category')}>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2" noValidate>
          <Input label={t('fees.category')} error={errors.name?.message} {...register('name', { required: t('fees.category') })} />
          <Input label={t('fees.amount')} ltr inputMode="decimal" error={errors.amount?.message} {...register('amount', { required: t('fees.amount') })} />
          <Select label={t('fees.frequency')} disabled={Boolean(editing?.in_use)}
            error={errors.frequency?.message} options={FREQUENCIES.map(f => ({ value: f, label: t(`fees.frequencies.${f}`) }))} {...register('frequency')} />
          <Select label={t('fees.applies_to')} error={errors.applicable_to?.message}
            options={['all', 'program_specific'].map(a => ({ value: a, label: t(`fees.applies.${a}`) }))} {...register('applicable_to')} />
          {editing?.in_use && <p className="sm:col-span-2 text-sm text-content-muted">{t('fees.frequency_locked')}</p>}
          <p className="sm:col-span-2 text-sm text-content-muted">{t('fees.amount_hint')}</p>
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
