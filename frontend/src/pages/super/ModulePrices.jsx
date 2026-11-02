import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { Input } from '../../components/FormField'
import { EmptyState } from '../../components/StateViews'
import List from '../../ui/variants/List'

const KEY = ['super', 'module-prices']

// D187 SUB.3 /super-admin/module-prices: one monthly and one yearly price per paid module (D47). Saving adds a new price row; the
// prices start at 0 until the owner sets them.
export default function ModulePrices() {
  const { t } = useTranslation()
  const rows = useQuery({ queryKey: KEY, queryFn: () => api.get('/super/module-prices').then(r => r.data.data) })
  const cols = [
    { key: 'module_key', label: t('subscription.module'), primary: true, render: r => t(`subscription.module_names.${r.module_key}`, { defaultValue: r.module_key }) },
    { key: 'edit', label: `${t('subscription.monthly')} / ${t('subscription.yearly')}`, action: true, render: r => <PriceRow row={r} /> },
  ]
  return (
    <div className="flex flex-col gap-4" data-testid="module-prices">
      <PageHeader title={t('subscription.prices_title')} />
      <p className="text-sm text-content-muted">{t('subscription.prices_hint')}</p>
      <Card><List columns={cols} rows={(rows.data ?? []).map(r => ({ ...r, id: r.module_key }))} loading={rows.isPending} error={rows.isError} onRetry={rows.refetch} empty={<EmptyState />} /></Card>
    </div>
  )
}

function PriceRow({ row }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [m, setM] = useState(row.monthly_price)
  const [y, setY] = useState(row.yearly_price)
  const [busy, setBusy] = useState(false)
  const name = t(`subscription.module_names.${row.module_key}`, { defaultValue: row.module_key })
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post('/super/module-prices', { module_key: row.module_key, monthly_price: m, yearly_price: y })
      useUiStore.getState().addToast(t('common.saved'), 'success')
      qc.invalidateQueries({ queryKey: KEY })
    } catch (err) { useUiStore.getState().addToast(err.response?.data?.message ?? t('subscription.payment.failed'), 'error') } finally { setBusy(false) }
  }
  return (
    <form onSubmit={save} className="flex flex-wrap items-end gap-2" data-module={row.module_key}>
      <Input aria-label={`${name}: ${t('subscription.monthly')}`} ltr inputMode="decimal" className="w-28" name="monthly_price" value={m} onChange={e => setM(e.target.value)} />
      <Input aria-label={`${name}: ${t('subscription.yearly')}`} ltr inputMode="decimal" className="w-28" name="yearly_price" value={y} onChange={e => setY(e.target.value)} />
      <Button type="submit" variant="secondary" loading={busy}>{t('subscription.save')}</Button>
    </form>
  )
}
