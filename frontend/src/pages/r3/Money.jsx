import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtMoney } from '../../i18n/format'
import ResourcePage from '../../features/r3/ResourcePage'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import StatusBadge from '../../components/StatusBadge'
import { Input } from '../../components/FormField'
import { ErrorState } from '../../components/StateViews'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { useAuthStore } from '../../store/authStore'

// R3.1-R3.3 / R3.9 pages: expenses, the cash book, fee refunds and the store (docs/modules/expenses-and-cashbook, fee-refund, inventory)
const METHODS = ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'other']

export function Expenses() {
  return <ResourcePage title="r3.money.expenses" endpoint="expenses"
    columns={[{ key: 'expense_date', label: 'r3.date', kind: 'date' }, { key: 'title', label: 'r3.title' }, { key: 'category', label: 'r3.category' },
      { key: 'amount', label: 'r3.amount', kind: 'money' }, { key: 'payment_method', label: 'r3.method', kind: 'enum' }, { key: 'source', label: 'r3.acc.source', kind: 'enum' }]}
    create={{ label: 'r3.money.new_expense', defaults: { payment_method: 'cash' }, fields: [{ name: 'title', label: 'r3.title', required: true },
      { name: 'category', label: 'r3.category', required: true }, { name: 'amount', label: 'r3.amount', kind: 'money', required: true },
      { name: 'expense_date', label: 'r3.date', kind: 'date', required: true }, { name: 'payment_method', label: 'r3.method', kind: 'select', options: METHODS },
      { name: 'note', label: 'r3.note', kind: 'textarea', wide: true }] }}
    actions={[{ key: 'cancel', label: 'r3.money.cancel_expense', danger: true, method: 'delete', when: r => r.source === 'manual' && !r.is_reversed && !r.reversal_of_id, path: r => `/expenses/${r.id}` }]} />
}

export function Refunds() {
  return <ResourcePage title="r3.money.refunds" endpoint="fee-refunds" intro="r3.money.refunds_hint"
    columns={[{ key: 'original_receipt_no', label: 'r3.receipt_no' }, { key: 'amount', label: 'r3.amount', kind: 'money' }, { key: 'method', label: 'r3.method', kind: 'enum' },
      { key: 'reason', label: 'r3.reason' }, { key: 'status', label: 'r3.status', kind: 'status' }]}
    actions={[{ key: 'approve', label: 'r3.approve', when: r => r.status === 'requested', path: r => `/fee-refunds/${r.id}/approve` },
      { key: 'reject', label: 'r3.reject', danger: true, when: r => r.status === 'requested', path: r => `/fee-refunds/${r.id}/reject` },
      { key: 'process', label: 'r3.money.process', when: r => r.status === 'approved', path: r => `/fee-refunds/${r.id}/process` }]} />
}

export function Inventory() {
  const qty = [{ name: 'qty', label: 'r3.inv.qty', kind: 'money', required: true }]
  return <ResourcePage title="r3.inv.title" endpoint="inventory/items"
    columns={[{ key: 'code', label: 'r3.code' }, { key: 'name', label: 'r3.name' }, { key: 'stock', label: 'r3.inv.stock' }, { key: 'sale_price', label: 'r3.inv.price', kind: 'money' },
      { key: 'avg_cost', label: 'r3.inv.avg_cost', kind: 'money' }, { key: 'is_low', label: 'r3.inv.low', kind: 'bool' }]}
    create={{ label: 'r3.inv.new_item', fields: [{ name: 'code', label: 'r3.code', required: true }, { name: 'name', label: 'r3.name', required: true },
      { name: 'unit', label: 'r3.inv.unit' }, { name: 'sale_price', label: 'r3.inv.price', kind: 'money' }, { name: 'reorder_level', label: 'r3.inv.reorder' },
      { name: 'is_sellable', label: 'r3.inv.sellable', kind: 'checkbox' }] }}
    edit={{ fields: [{ name: 'name', label: 'r3.name', required: true }, { name: 'sale_price', label: 'r3.inv.price', kind: 'money' }, { name: 'reorder_level', label: 'r3.inv.reorder' }] }}
    actions={[{ key: 'receive', label: 'r3.inv.receive', path: () => '/inventory/receive', body: r => ({ item_id: r.id }), fields: [...qty, { name: 'unit_amount', label: 'r3.inv.unit_cost', kind: 'money', required: true }] },
      { key: 'sale', label: 'r3.inv.sell', when: r => r.is_sellable, path: () => '/inventory/sale', body: r => ({ item_id: r.id }), fields: [...qty, { name: 'payment_method', label: 'r3.method', kind: 'select', options: METHODS }] },
      { key: 'issue', label: 'r3.inv.issue', path: () => '/inventory/issue', body: r => ({ item_id: r.id }), fields: [...qty, { name: 'issued_to_type', label: 'r3.inv.issued_to', kind: 'select', options: ['student', 'teacher', 'staff', 'department'], required: true }, { name: 'note', label: 'r3.note', wide: true }] }]} />
}

// The cash book of one day: figures from GET /cashbook, close with the counted cash, reopen (admin) with a reason
export function CashBook() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const toast = useUiStore.getState().addToast
  const role = useAuthStore(s => s.user?.role)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm()
  const q = useQuery({ queryKey: ['cashbook', date], queryFn: () => api.get('/cashbook', { params: { date } }).then(r => r.data.data), retry: false })
  const post = async (action, body) => {
    try { await api.post(`/cashbook/${date}/${action}`, body); toast(t('common.saved')); qc.invalidateQueries({ queryKey: ['cashbook'] }); return true }
    catch (e) { Object.entries(e.response?.data?.errors ?? {}).forEach(([f, m]) => setError(f, { message: m[0] })); return false }
  }
  const d = q.data
  const figure = (k) => <div key={k}><dt className="text-sm text-content-muted">{t(`r3.cash.${k}`)}</dt><dd className="text-lg font-medium"><Ltr>{d?.[k] == null ? '—' : fmtMoney(d[k], locale)}</Ltr></dd></div>
  return (
    <div>
      <PageHeader title={t('r3.cash.title')} actions={<Input label={t('r3.date')} type="date" ltr value={date} onChange={e => setDate(e.target.value)} />} />
      {q.isPending ? <Loader type="page" /> : q.isError ? <ErrorState onRetry={q.refetch} /> : (
        <>
          <Card>
            <div className="mb-3 flex items-center gap-2"><StatusBadge status={d.status} /></div>
            <dl className="grid gap-3 sm:grid-cols-3">{['opening_cash', 'cash_in', 'cash_out', 'expected_closing', 'counted_cash', 'difference'].map(figure)}</dl>
          </Card>
          {d.status !== 'closed' ? (
            <Card><form className="grid gap-3 sm:grid-cols-3" noValidate onSubmit={handleSubmit(v => post('close', v))}>
              <Input label={t('r3.cash.counted_cash')} ltr inputMode="decimal" error={errors.counted_cash?.message} {...register('counted_cash', { required: t('r3.cash.counted_cash') })} />
              <Input label={t('r3.cash.opening_cash')} hint={t('r3.cash.opening_hint')} ltr inputMode="decimal" error={errors.opening_cash?.message} {...register('opening_cash')} />
              <div className="flex items-end"><Button type="submit" loading={isSubmitting}>{t('r3.cash.close')}</Button></div>
            </form></Card>
          ) : role === 'admin' && (
            <Card><form className="grid gap-3 sm:grid-cols-3" noValidate onSubmit={handleSubmit(v => post('reopen', { reason: v.reason }))}>
              <Input label={t('r3.reason')} error={errors.reason?.message} {...register('reason', { required: t('r3.reason') })} />
              <div className="flex items-end"><Button type="submit" variant="secondary" loading={isSubmitting}>{t('r3.cash.reopen')}</Button></div>
            </form></Card>
          )}
        </>
      )}
    </div>
  )
}
