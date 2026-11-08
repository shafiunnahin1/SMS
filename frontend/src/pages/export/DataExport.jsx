import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import api from '../../api/axios'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate } from '../../i18n/format'
import { usePrint } from '../../hooks/usePrint'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import List from '../../ui/variants/List'
import { Input } from '../../components/FormField'
import Ltr from '../../components/bidi/Ltr'
import { useUiStore } from '../../store/uiStore'

// D193 EXP.1 (D38) /admin/settings/exports: the institution's own data file - the password again, a passphrase of the admin's own
// (the platform never keeps it; without it the file cannot be opened), salary data only when ticked; one a day; it downloads once.
export default function DataExport() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const { download, loading } = usePrint()
  const list = useQuery({ queryKey: ['exports'], queryFn: () => api.get('/admin/exports').then(r => r.data.data) })
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm()
  const onSubmit = async (v) => {
    try {
      await api.post('/admin/exports', { password: v.password, passphrase: v.passphrase, passphrase_confirmation: v.passphrase_confirmation, include_payroll: Boolean(v.include_payroll) })
      useUiStore.getState().addToast(t('exports.ready'))
      reset({})
      qc.invalidateQueries({ queryKey: ['exports'] })
    } catch (e) {
      const errs = e.response?.data?.errors
      if (errs) Object.entries(errs).forEach(([f, m]) => setError(f, { message: m[0] }))
      else if ([422, 429].includes(e.response?.status)) useUiStore.getState().addToast(e.response.data.message, 'error')
    }
  }
  const get = async (r) => { await download(`/admin/exports/${r.id}/download`, `export-${r.id}.edux`); qc.invalidateQueries({ queryKey: ['exports'] }) }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('exports.title')} />
      <Card>
        <p className="mb-3 text-sm text-content-muted">{t('exports.intro')}</p>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2" noValidate>
          <Input type="password" autoComplete="current-password" label={t('exports.password')} error={errors.password?.message} {...register('password', { required: t('exports.password') })} />
          <span />
          <Input type="password" autoComplete="new-password" label={t('exports.passphrase')} hint={t('exports.passphrase_hint')} error={errors.passphrase?.message} {...register('passphrase', { required: t('exports.passphrase'), minLength: { value: 12, message: t('exports.passphrase_hint') } })} />
          <Input type="password" autoComplete="new-password" label={t('exports.passphrase_again')} error={errors.passphrase_confirmation?.message} {...register('passphrase_confirmation', { required: t('exports.passphrase_again') })} />
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" {...register('include_payroll')} />{t('exports.include_payroll')}</label>
          <div className="sm:col-span-2 flex justify-end"><Button type="submit" loading={isSubmitting}>{t('exports.create')}</Button></div>
        </form>
      </Card>
      <Card>
        <List columns={[
          { key: 'id', label: '#', render: r => <Ltr>{r.id}</Ltr> },
          { key: 'status', label: t('exports.status'), primary: true, render: r => t(`exports.statuses.${r.status}`) },
          { key: 'rows', label: t('exports.rows'), render: r => <Ltr>{r.rows_count}</Ltr> },
          { key: 'expires_at', label: t('exports.expires'), render: r => r.expires_at ? fmtDate(r.expires_at, locale) : '—' },
          { key: 'actions', label: t('common.actions'), action: true, render: r => r.status === 'ready'
            ? <Button variant="ghost" loading={loading} onClick={() => get(r)}><Download aria-hidden="true" className="h-4 w-4" />{t('exports.download_once')}</Button> : null },
        ]} rows={list.data ?? []} loading={list.isPending} error={list.isError} onRetry={list.refetch} />
      </Card>
    </div>
  )
}
