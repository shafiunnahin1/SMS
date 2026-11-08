import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../api/axios'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import Loader from '../../../components/Loader'
import { ErrorState } from '../../../components/StateViews'
import { Input, Select } from '../../../components/FormField'
import { useUiStore } from '../../../store/uiStore'

// /admin/settings/general (GET|PUT /admin/settings/general): fee proration, GPA, student portal, programs; D197 AAD.1 the dues block
export default function GeneralSettings() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['settings', 'general'], queryFn: () => api.get('/admin/settings/general').then(r => r.data.data) })
  const { register, handleSubmit, reset, watch, setError, formState: { errors, isSubmitting } } = useForm()
  useEffect(() => {
    if (q.data) reset({ ...q.data, fee_proration: q.data.fee_proration, mode: q.data.fees.block_threshold.mode, value: q.data.fees.block_threshold.value ?? '',
      block_admit_card: q.data.fees.block_admit_card, block_result: q.data.fees.block_result, block_message: q.data.fees.block_message ?? '' })
  }, [q.data, reset])
  const mode = watch('mode')
  const onSubmit = async (v) => {
    try {
      await api.put('/admin/settings/general', { fee_proration: v.fee_proration, use_gpa: Boolean(v.use_gpa), student_portal: Boolean(v.student_portal), use_programs: Boolean(v.use_programs),
        fees: { block_admit_card: Boolean(v.block_admit_card), block_result: Boolean(v.block_result), block_threshold: { mode: v.mode, value: v.mode === 'any' ? null : String(v.value) }, block_message: v.block_message || null } })
      useUiStore.getState().addToast(t('common.saved'))
      qc.invalidateQueries({ queryKey: ['settings', 'general'] })
    } catch (e) { Object.entries(e.response?.data?.errors ?? {}).forEach(([f, m]) => setError(f.replace('fees.block_threshold.', ''), { message: m[0] })) }
  }
  if (q.isPending) return <Loader type="page" />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  const box = (name, label) => <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" {...register(name)} />{label}</label>
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <PageHeader title={t('general_settings.title')} />
      <Card className="grid gap-3 sm:grid-cols-2">
        <Select label={t('general_settings.fee_proration')} options={['none', 'half_after_15'].map(x => ({ value: x, label: t(`general_settings.proration.${x}`) }))} {...register('fee_proration')} />
        <div className="grid gap-2">{box('use_gpa', t('general_settings.use_gpa'))}{box('student_portal', t('general_settings.student_portal'))}{box('use_programs', t('general_settings.use_programs'))}</div>
      </Card>
      <Card className="grid gap-3 sm:grid-cols-2" data-testid="due-block-settings">
        <h2 className="font-semibold sm:col-span-2">{t('due_block.settings_title')}</h2>
        <p className="text-sm text-content-muted sm:col-span-2">{t('due_block.settings_hint')}</p>
        {box('block_admit_card', t('due_block.block_admit_card'))}
        {box('block_result', t('due_block.block_result'))}
        <Select label={t('due_block.mode')} options={['amount', 'months', 'any'].map(x => ({ value: x, label: t(`due_block.modes.${x}`) }))} {...register('mode')} />
        {mode !== 'any' && <Input ltr inputMode="decimal" label={t(mode === 'months' ? 'due_block.months_value' : 'due_block.amount_value')} error={errors.value?.message} {...register('value')} />}
        <Input className="sm:col-span-2" label={t('due_block.message')} hint={t('due_block.message_hint')} {...register('block_message')} />
      </Card>
      <div className="flex justify-end"><Button type="submit" loading={isSubmitting}>{t('common.save')}</Button></div>
    </form>
  )
}
