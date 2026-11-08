import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate, fmtMoney } from '../../i18n/format'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'
import { useUiStore } from '../../store/uiStore'

const SCOPES = ['admit_card', 'result', 'all']

// D197 AAD.1: a student's dues block (admit card / result) and exemptions - admin and accountant; the server decides everything
export default function DueBlockCard({ studentId }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['due-block', studentId], queryFn: () => api.get(`/students/${studentId}/due-block`).then(r => r.data.data) })
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: { scope: 'all' } })
  const done = () => { qc.invalidateQueries({ queryKey: ['due-block', studentId] }); useUiStore.getState().addToast(t('common.saved')) }
  const grant = async (v) => {
    try { await api.post(`/students/${studentId}/due-block-exemptions`, { scope: v.scope, reason: v.reason, expires_at: v.expires_at || null }); reset({ scope: 'all' }); done() }
    catch (e) { Object.entries(e.response?.data?.errors ?? {}).forEach(([f, m]) => setError(f, { message: m[0] })) }
  }
  const revoke = async () => { await api.delete(`/students/${studentId}/due-block-exemptions`); done() }
  if (q.isPending) return <Loader type="skeleton" rows={3} />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  const d = q.data
  return (
    <Card className="flex flex-col gap-3" data-testid="due-block">
      <p className="text-sm">
        {t('due_block.admit_card')}: <strong>{t(d.blocked.admit_card ? 'due_block.held' : 'due_block.free')}</strong> ·{' '}
        {t('due_block.result')}: <strong>{t(d.blocked.result ? 'due_block.held' : 'due_block.free')}</strong>
        {d.due_amount && <> · {t('due_block.due')}: {fmtMoney(d.due_amount, locale)}</>}
      </p>
      {d.reason && <p className="text-sm text-content-muted" dir="auto">{d.reason}</p>}
      {d.exemptions.length > 0 && (
        <ul className="text-sm">
          {d.exemptions.map(e => <li key={e.id} dir="auto">{t(`due_block.scopes.${e.scope}`)} · {e.reason}{e.expires_at ? ` · ${t('due_block.until', { date: fmtDate(e.expires_at, locale) })}` : ''}</li>)}
          <li><Button variant="ghost" onClick={revoke}>{t('due_block.remove')}</Button></li>
        </ul>
      )}
      <form onSubmit={handleSubmit(grant)} className="grid gap-3 sm:grid-cols-3" noValidate>
        <Select label={t('due_block.scope')} options={SCOPES.map(s => ({ value: s, label: t(`due_block.scopes.${s}`) }))} {...register('scope')} />
        <Input label={t('due_block.reason')} error={errors.reason?.message} {...register('reason', { required: t('due_block.reason') })} />
        <Input type="date" ltr label={t('due_block.expires')} error={errors.expires_at?.message} {...register('expires_at')} />
        <div className="sm:col-span-3 flex justify-end"><Button type="submit" variant="secondary" loading={isSubmitting}>{t('due_block.grant')}</Button></div>
      </form>
    </Card>
  )
}
