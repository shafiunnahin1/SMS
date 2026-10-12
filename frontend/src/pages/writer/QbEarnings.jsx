import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Wallet } from 'lucide-react'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import StatusBadge from '../../components/StatusBadge'
import Ltr from '../../components/bidi/Ltr'
import List from '../../ui/variants/List'
import Modal from '../../ui/variants/Modal'
import { Input, Select } from '../../components/FormField'
import { EmptyState, ErrorState } from '../../components/StateViews'

const KEY = ['writer', 'earnings']
const day = (v) => (v ? v.slice(0, 16).replace('T', ' ') : '—')

// QB.10b /writer/earnings (D66, question-bank.md §৪.৫): the writer's balance, the part held by pending withdrawal requests, how often
// each item sold, the ledger, and the requests. A new request holds its amount until the Super Admin pays it (with the bank
// transaction id) or rejects it (the hold is released). The payout account is shown only here and to the Super Admin.
export default function QbEarnings() {
  const { t } = useTranslation()
  const summary = useQuery({ queryKey: [...KEY, 'summary'], queryFn: () => api.get('/writer/earnings').then(r => r.data.data) })
  const requests = useQuery({ queryKey: [...KEY, 'withdrawals'], queryFn: () => api.get('/writer/withdrawals').then(r => r.data.data) })
  const [open, setOpen] = useState(false)
  if (summary.isPending) return <Loader type="page" />
  if (summary.isError) return <ErrorState onRetry={summary.refetch} />
  const s = summary.data
  const salesCols = [
    { key: 'item', label: t('qbe.item'), primary: true, render: r => <>{t(`qbe.items.${r.item_type}`)} <Ltr>#{r.item_id}</Ltr></> },
    { key: 'sales', label: t('qbe.sales'), render: r => <Ltr>{r.sales}</Ltr> },
    { key: 'earned', label: t('qbe.earned'), render: r => <Ltr>৳{r.earned}</Ltr> },
  ]
  const ledgerCols = [
    { key: 'type', label: t('qbe.type'), primary: true, render: r => t(`qbe.types.${r.type}`) },
    { key: 'amount', label: t('qbe.amount'), render: r => <Ltr>৳{r.amount}</Ltr> },
    { key: 'balance_after', label: t('qbe.balance_after'), render: r => <Ltr>৳{r.balance_after}</Ltr> },
    { key: 'created_at', label: t('qbe.when'), render: r => <Ltr>{day(r.created_at)}</Ltr> },
  ]
  const reqCols = [
    { key: 'amount', label: t('qbe.amount'), primary: true, render: r => <Ltr>৳{r.amount}</Ltr> },
    { key: 'payout', label: t('qbe.payout'), render: r => <>{t(`qbe.methods.${r.payout_method}`)} · <Ltr>{r.payout_account}</Ltr></> },
    { key: 'status', label: t('qb.state'), render: r => <StatusBadge status={r.status} /> },
    { key: 'ref', label: t('qbe.reference'), render: r => r.bank_transaction_id ? <Ltr>{r.bank_transaction_id}</Ltr> : (r.note ?? '—') },
    { key: 'requested_at', label: t('qbe.when'), render: r => <Ltr>{day(r.requested_at)}</Ltr> },
  ]
  return (
    <div className="flex flex-col gap-4" data-testid="qb-earnings">
      <PageHeader title={t('qbe.title')} />
      <Card className="grid gap-3 sm:grid-cols-4" data-testid="earnings-summary">
        {[['balance', s.balance], ['held', s.held], ['available', s.available], ['total_earned', s.total_earned]].map(([k, v]) => (
          <div key={k} className="flex flex-col"><span className="text-xs text-content-muted">{t(`qbe.${k}`)}</span><Ltr><strong data-testid={`earnings-${k}`}>৳{v}</strong></Ltr></div>
        ))}
        <p className="sm:col-span-3 text-xs text-content-muted">{t('qbe.share_hint', { percent: s.share_percent, min: s.min_withdrawal })}</p>
        <div><Button onClick={() => setOpen(true)} disabled={Number(s.available) <= 0} data-action="withdraw"><Wallet aria-hidden="true" className="h-4 w-4" />{t('qbe.withdraw')}</Button></div>
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">{t('qbe.requests')}</h2>
        <div data-testid="withdrawal-list"><List columns={reqCols} rows={requests.data ?? []} loading={requests.isPending} error={requests.isError} onRetry={requests.refetch} empty={<EmptyState title={t('qbe.no_requests')} />} /></div>
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">{t('qbe.sales_title')}</h2>
        <List columns={salesCols} rows={s.sales} empty={<EmptyState title={t('qbe.no_sales')} />} />
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">{t('qbe.ledger')}</h2>
        <List columns={ledgerCols} rows={s.ledger} empty={<EmptyState title={t('qbe.no_ledger')} />} />
      </Card>
      {open && <Withdraw available={s.available} onClose={() => setOpen(false)} />}
    </div>
  )
}

function Withdraw({ available, onClose }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: { amount: available, payout_method: 'bkash', payout_account: '' } })
  const submit = async (v) => {
    try {
      await api.post('/writer/withdrawals', v)
      useUiStore.getState().addToast(t('qbe.requested'))
      qc.invalidateQueries({ queryKey: KEY })
      onClose()
    } catch (e) {
      const errs = e.response?.data?.errors
      if (errs) Object.entries(errs).forEach(([k, m]) => setError(k, { message: m[0] }))
      else setError('amount', { message: e.response?.data?.message ?? t('common.error') })
    }
  }
  return (
    <Modal open onClose={onClose} title={t('qbe.withdraw')}>
      <form onSubmit={handleSubmit(submit)} className="grid gap-3" noValidate data-testid="withdraw-form">
        <Input label={t('qbe.amount')} ltr inputMode="decimal" hint={t('qbe.available_hint', { available })} error={errors.amount?.message} {...register('amount', { required: t('super.required') })} />
        <Select label={t('qbe.method')} options={['bkash', 'bank'].map(m => ({ value: m, label: t(`qbe.methods.${m}`) }))} {...register('payout_method')} />
        <Input label={t('qbe.account')} ltr hint={t('qbe.account_hint')} error={errors.payout_account?.message} {...register('payout_account', { required: t('super.required') })} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" loading={isSubmitting}>{t('qbe.send_request')}</Button>
        </div>
      </form>
    </Modal>
  )
}
