import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import StatusBadge from '../../components/StatusBadge'
import Ltr from '../../components/bidi/Ltr'
import List from '../../ui/variants/List'
import Modal from '../../ui/variants/Modal'
import { Input } from '../../components/FormField'
import { EmptyState } from '../../components/StateViews'

const KEY = ['super', 'qb-withdrawals']
const day = (v) => (v ? v.slice(0, 16).replace('T', ' ') : '—')

// QB.10b /super-admin/qb/withdrawals (D66, question-bank.md §৪.৫): the writers' share of every sale and the minimum withdrawal; the
// queue of requests. The platform never sends money itself: the Super Admin sends it by bank / bKash and records the transaction
// id (then the amount leaves the writer's balance, once) - or rejects with a reason (the hold is released).
export default function QbWithdrawals() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const settings = useQuery({ queryKey: [...KEY, 'settings'], queryFn: () => api.get('/super/qb/writer-settings').then(r => r.data.data) })
  const rows = useQuery({ queryKey: [...KEY, 'list'], queryFn: () => api.get('/super/qb/withdrawals').then(r => r.data.data) })
  const [act, setAct] = useState(null)
  const cols = [
    { key: 'writer', label: t('qbe.writer'), primary: true, render: w => <span dir="auto">{w.writer}</span> },
    { key: 'amount', label: t('qbe.amount'), render: w => <Ltr>৳{w.amount}</Ltr> },
    { key: 'payout', label: t('qbe.payout'), render: w => <>{t(`qbe.methods.${w.payout_method}`)} · <Ltr>{w.payout_account}</Ltr></> },
    { key: 'wallet', label: t('qbe.balance'), render: w => <Ltr>৳{w.balance} ({t('qbe.held')} ৳{w.held})</Ltr> },
    { key: 'status', label: t('qb.state'), render: w => <StatusBadge status={w.status} /> },
    { key: 'requested_at', label: t('qbe.when'), render: w => <Ltr>{day(w.requested_at)}</Ltr> },
    { key: 'actions', label: t('common.actions'), action: true, render: w => w.status === 'pending' ? (
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setAct({ kind: 'pay', w })} data-action="pay">{t('qbe.mark_paid')}</Button>
        <Button variant="secondary" onClick={() => setAct({ kind: 'reject', w })} data-action="reject">{t('qbe.reject')}</Button>
      </div>) : (w.bank_transaction_id ? <Ltr>{w.bank_transaction_id}</Ltr> : <span dir="auto">{w.note ?? '—'}</span>) },
  ]
  return (
    <div className="flex flex-col gap-4" data-testid="qb-withdrawals">
      <PageHeader title={t('qbe.admin_title')} />
      {settings.data && <Settings data={settings.data} onSaved={() => qc.invalidateQueries({ queryKey: KEY })} />}
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">{t('qbe.requests')}</h2>
        <div data-testid="withdrawal-queue"><List columns={cols} rows={rows.data ?? []} loading={rows.isPending} error={rows.isError} onRetry={rows.refetch} empty={<EmptyState title={t('qbe.no_requests')} />} /></div>
      </Card>
      {act && <Process act={act} onClose={() => setAct(null)} onDone={() => { setAct(null); qc.invalidateQueries({ queryKey: KEY }) }} />}
    </div>
  )
}

function Settings({ data, onSaved }) {
  const { t } = useTranslation()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: data })
  const submit = async (v) => {
    try { await api.put('/super/qb/writer-settings', { share_percent: v.share_percent, min_withdrawal: v.min_withdrawal }); useUiStore.getState().addToast(t('common.saved')); onSaved() }
    catch (e) { Object.entries(e.response?.data?.errors ?? {}).forEach(([k, m]) => setError(k, { message: m[0] })) }
  }
  return (
    <Card>
      <form onSubmit={handleSubmit(submit)} className="grid gap-3 sm:grid-cols-3 sm:items-end" noValidate data-testid="writer-settings">
        <Input label={t('qbe.share_percent')} ltr inputMode="decimal" hint={t('qbe.share_percent_hint')} error={errors.share_percent?.message} {...register('share_percent', { required: t('super.required') })} />
        <Input label={t('qbe.min_withdrawal')} ltr inputMode="decimal" error={errors.min_withdrawal?.message} {...register('min_withdrawal', { required: t('super.required') })} />
        <div><Button type="submit" loading={isSubmitting}>{t('common.save')}</Button></div>
      </form>
    </Card>
  )
}

function Process({ act, onClose, onDone }) {
  const { t } = useTranslation()
  const pay = act.kind === 'pay'
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: { bank_transaction_id: '', note: '' } })
  const submit = async (v) => {
    try {
      await api.post(`/super/qb/withdrawals/${act.w.id}/${act.kind}`, pay ? { bank_transaction_id: v.bank_transaction_id, note: v.note || null } : { note: v.note })
      useUiStore.getState().addToast(t('common.saved'))
      onDone()
    } catch (e) {
      const errs = e.response?.data?.errors
      if (errs) Object.entries(errs).forEach(([k, m]) => setError(k, { message: m[0] }))
      else setError(pay ? 'bank_transaction_id' : 'note', { message: e.response?.data?.message ?? t('common.error') })
    }
  }
  return (
    <Modal open onClose={onClose} title={t(pay ? 'qbe.mark_paid' : 'qbe.reject')}>
      <form onSubmit={handleSubmit(submit)} className="grid gap-3" noValidate data-testid="process-form">
        <p className="text-sm">{t(pay ? 'qbe.pay_hint' : 'qbe.reject_hint', { amount: act.w.amount, writer: act.w.writer })}</p>
        {pay && <Input label={t('qbe.bank_transaction_id')} ltr error={errors.bank_transaction_id?.message} {...register('bank_transaction_id', { required: t('super.required') })} />}
        <Input label={t('qbe.note')} error={errors.note?.message} {...register('note', pay ? {} : { required: t('super.required') })} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" loading={isSubmitting}>{t(pay ? 'qbe.mark_paid' : 'qbe.reject')}</Button>
        </div>
      </form>
    </Modal>
  )
}
