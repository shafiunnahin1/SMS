import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
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

// D218 WAL.3 /student/wallet: the student's own wallet - balance and ledger, a bKash top-up (comes back here with ?recharge=) and a
// manual top-up with the receipt that the platform checks.
export default function StudentWallet() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const q = useQuery({ queryKey: ['student', 'wallet'], queryFn: () => api.get('/student/wallet').then(r => r.data.data) })
  const [f, setF] = useState(blank)
  const [file, setFile] = useState(null)
  const [bkashAmount, setBkashAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState({})
  const back = params.get('recharge')
  const said = useRef(null)
  useEffect(() => {
    if (!back || said.current === back) return
    said.current = back
    useUiStore.getState().addToast(t(`sms.recharge.${back}`, { defaultValue: t('sms.recharge.failed') }), back === 'success' ? 'success' : 'error')
    setParams({}, { replace: true })
  }, [back, setParams, t])
  if (q.isPending) return <Loader type="page" />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  const d = q.data
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const fieldErrors = (err) => setErrors(Object.fromEntries(Object.entries(err.response?.data?.errors ?? {}).map(([k, m]) => [k, m[0]])))
  const payBkash = async () => {
    setBusy(true); setErrors({})
    try { window.location.assign((await api.post('/student/wallet/bkash', { amount: bkashAmount })).data.data.bkash_url) } catch (err) { fieldErrors(err); setBusy(false) }
  }
  const send = async (e) => {
    e.preventDefault()
    setBusy(true); setErrors({})
    const fd = new FormData()
    Object.entries(f).forEach(([k, v]) => { if (v !== '') fd.append(k, v) })
    if (file) fd.append('receipt', file)
    try {
      await api.post('/student/wallet/recharge-requests', fd)
      useUiStore.getState().addToast(t('wallet.requested'))
      setF(blank); setFile(null); e.target.reset()
    } catch (err) { fieldErrors(err) } finally { setBusy(false); qc.invalidateQueries({ queryKey: ['student', 'wallet'] }) }
  }
  return (
    <div className="flex flex-col gap-4" data-testid="student-wallet">
      <PageHeader title={t('wallet.title')} />
      <Card><p className="text-sm text-content-muted">{t('wallet.balance')}</p><p className="text-2xl font-semibold" data-testid="wallet-balance"><Ltr>{fmtMoney(d.balance, locale)}</Ltr></p>
        <p className="text-sm text-content-muted mt-1">{t('wallet.student_pays_for')}</p></Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          {d.bkash && (
            <div className="flex flex-col gap-2" data-testid="bkash-topup">
              <h2 className="font-semibold">{t('wallet.bkash_title')}</h2>
              <div className="flex flex-wrap items-end gap-2">
                <Input name="bkash_amount" label={t('wallet.amount')} hint={t('wallet.min', { min: d.min })} inputMode="decimal" ltr value={bkashAmount} onChange={(e) => setBkashAmount(e.target.value)} error={errors.amount} />
                <Button onClick={payBkash} disabled={busy || !bkashAmount} data-action="bkash">{t('sms.recharge.pay')}</Button>
              </div>
            </div>
          )}
          <h2 className="font-semibold">{t('wallet.where_to_send')}</h2>
          {d.instructions ? <p className="text-sm whitespace-pre-line" dir="auto">{d.instructions}</p> : <p className="text-sm text-content-muted">{t('wallet.no_instructions')}</p>}
          <form className="flex flex-col gap-3" onSubmit={send} data-testid="recharge-form">
            <h3 className="font-semibold">{t('wallet.manual_title')}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input name="amount" label={t('wallet.amount')} hint={t('wallet.min', { min: d.min })} inputMode="decimal" ltr value={f.amount} onChange={set('amount')} error={errors.amount} required />
              <Select name="method" label={t('wallet.method')} value={f.method} onChange={set('method')} options={d.methods.map(m => ({ value: m, label: t(`wallet.methods.${m}`) }))} />
            </div>
            <Input name="trx_reference" label={t('wallet.trx_reference')} hint={t('wallet.trx_hint')} ltr value={f.trx_reference} onChange={set('trx_reference')} error={errors.trx_reference} required maxLength={100} />
            <div className="flex flex-col gap-1 text-sm">
              <label htmlFor="student-receipt">{t('wallet.receipt')}</label>
              <input id="student-receipt" name="receipt" type="file" accept="image/jpeg,image/png,application/pdf" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {errors.receipt && <span className="text-xs text-red-600">{errors.receipt}</span>}
            </div>
            <div><Button type="submit" disabled={busy} data-action="send">{t('wallet.send')}</Button></div>
          </form>
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">{t('wallet.history')}</h2>
          {!d.transactions.length && !d.requests.length ? <EmptyState title={t('wallet.no_history')} /> : (
            <>
              <ul className="flex flex-col divide-y divide-line text-sm" data-testid="ledger">
                {d.transactions.map(x => (
                  <li key={x.id} className="py-1 flex items-center justify-between gap-2">
                    <span>{t(`wallet.types.${x.type}`)} <span className="text-xs text-content-muted">{x.created_at && fmtDate(x.created_at, locale)}</span></span>
                    <Ltr>{Number(x.amount) > 0 ? '+' : '-'}{fmtMoney(Math.abs(Number(x.amount)).toFixed(2), locale)}</Ltr>
                  </li>
                ))}
              </ul>
              {d.requests.filter(r => r.status !== 'approved').map(r => (
                <p key={r.id} className="text-sm text-content-muted"><Ltr>{fmtMoney(r.amount, locale)}</Ltr> · {t(`wallet.statuses.${r.status}`)}{r.decision_note ? ` · ${r.decision_note}` : ''}</p>
              ))}
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
