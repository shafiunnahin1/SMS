import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate, fmtMoney } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'

const blank = { amount: '', method: 'bkash', trx_reference: '', note: '' }

// D218 WAL.1 /admin/wallet: the central wallet's balance, where to send money (written by the Super Admin), a manual top-up with
// the transaction's receipt (JPG / PNG / PDF) and the requests with their state. The bKash top-up stays on the SMS page.
export default function WalletRecharge() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['wallet', 'recharge'], queryFn: () => api.get('/wallet/recharge-requests').then(r => r.data.data) })
  const [f, setF] = useState(blank)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})
  if (q.isPending) return <Loader type="page" />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  const d = q.data
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const send = async (e) => {
    e.preventDefault()
    setBusy(true); setErrors({})
    const fd = new FormData()
    Object.entries(f).forEach(([k, v]) => { if (v !== '') fd.append(k, v) })
    if (file) fd.append('receipt', file)
    try {
      await api.post('/wallet/recharge-requests', fd)
      useUiStore.getState().addToast(t('wallet.requested'))
      setF(blank); setFile(null); e.target.reset()
    } catch (err) {
      setErrors(Object.fromEntries(Object.entries(err.response?.data?.errors ?? {}).map(([k, m]) => [k, m[0]])))
    } finally { setBusy(false); qc.invalidateQueries({ queryKey: ['wallet'] }) }
  }
  return (
    <div className="flex flex-col gap-4" data-testid="wallet-recharge">
      <PageHeader title={t('wallet.title')} />
      <Card><p className="text-sm text-content-muted">{t('wallet.balance')}</p><p className="text-2xl font-semibold" data-testid="wallet-balance"><Ltr>{fmtMoney(d.balance, locale)}</Ltr></p>
        <p className="text-sm text-content-muted mt-1">{t('wallet.pays_for')}</p></Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">{t('wallet.where_to_send')}</h2>
          {d.instructions ? <p className="text-sm whitespace-pre-line" dir="auto" data-testid="instructions">{d.instructions}</p> : <p className="text-sm text-content-muted">{t('wallet.no_instructions')}</p>}
          <form className="flex flex-col gap-3" onSubmit={send} data-testid="recharge-form">
            <h3 className="font-semibold">{t('wallet.manual_title')}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input name="amount" label={t('wallet.amount')} hint={t('wallet.min', { min: d.min })} inputMode="decimal" ltr value={f.amount} onChange={set('amount')} error={errors.amount} required />
              <Select name="method" label={t('wallet.method')} value={f.method} onChange={set('method')} error={errors.method} options={d.methods.map(m => ({ value: m, label: t(`wallet.methods.${m}`) }))} />
            </div>
            <Input name="trx_reference" label={t('wallet.trx_reference')} hint={t('wallet.trx_hint')} ltr value={f.trx_reference} onChange={set('trx_reference')} error={errors.trx_reference} required maxLength={100} />
            <div className="flex flex-col gap-1 text-sm">
              <label htmlFor="wallet-receipt">{t('wallet.receipt')}</label>
              <input id="wallet-receipt" name="receipt" type="file" accept="image/jpeg,image/png,application/pdf" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <span className="text-xs text-content-muted">{t('wallet.receipt_hint')}</span>
              {errors.receipt && <span className="text-xs text-red-600">{errors.receipt}</span>}
            </div>
            <Input name="note" label={t('wallet.note')} value={f.note} onChange={set('note')} maxLength={255} />
            <div><Button type="submit" disabled={busy} data-action="send">{t('wallet.send')}</Button></div>
          </form>
        </Card>
        <Card>
          <h2 className="font-semibold mb-2">{t('wallet.requests')}</h2>
          {!d.requests.length ? <EmptyState title={t('wallet.no_requests')} /> : (
            <ul className="flex flex-col divide-y divide-line text-sm" data-testid="requests">
              {d.requests.map(r => (
                <li key={r.id} className="py-2 flex flex-col gap-1" data-status={r.status}>
                  <span className="flex flex-wrap items-center gap-2"><span className="font-medium"><Ltr>{fmtMoney(r.amount, locale)}</Ltr></span>
                    <span className="rounded-full px-2 py-0.5 text-xs bg-surface-muted font-medium">{t(`wallet.statuses.${r.status}`)}</span></span>
                  <span className="text-content-muted">{r.created_at && fmtDate(r.created_at, locale)} · {t(`wallet.methods.${r.method}`)} · <Ltr>{r.trx_reference}</Ltr></span>
                  {r.status === 'rejected' && r.decision_note && <span>{t('wallet.reason')}: {r.decision_note}</span>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
