import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useUiStore } from '../../../store/uiStore'
import Modal from '../../../ui/variants/Modal'
import api from '../../../api/axios'
import { useLocale } from '../../../ui/I18nProvider'
import { fmtDate, fmtMoney, fmtNumber, fmtTime } from '../../../i18n/format'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import Loader from '../../../components/Loader'
import StatusBadge from '../../../components/StatusBadge'
import { EmptyState, ErrorState } from '../../../components/StateViews'
import { Input, Select } from '../../../components/FormField'
import Ltr from '../../../components/bidi/Ltr'
import Tabs from '../../../ui/variants/Tabs'
import StatCard from '../../../ui/variants/StatCard'

// Step 4.6 /admin/sms: balance and this month's use (GET /subscription/sms-credits), the SMS log (GET /sms-logs, cursor) and the
// credit ledger. Sending happens on its own (absence alerts, receipts). Step 5.3 (D58): recharge the wallet with bKash - the
// browser goes to bKash and comes back here with ?recharge=success|failed|cancelled.
export default function SmsCenter() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const [tab, setTab] = useState('log')
  const credits = useQuery({ queryKey: ['sms', 'credits'], queryFn: () => api.get('/subscription/sms-credits').then(r => r.data) })
  const d = credits.data?.data
  const [params, setParams] = useSearchParams()
  const [recharging, setRecharging] = useState(false)
  const back = params.get('recharge')
  const announced = useRef(null)                                  // StrictMode runs effects twice; announce once
  useEffect(() => {
    if (!back || announced.current === back) return
    announced.current = back
    useUiStore.getState().addToast(t(`sms.recharge.${back}`, { defaultValue: t('sms.recharge.failed') }), back === 'success' ? 'success' : 'error')
    setParams({}, { replace: true })
  }, [back, setParams, t])
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('sms.title')} actions={<Button onClick={() => setRecharging(true)} data-action="recharge">{t('sms.recharge.button')}</Button>} />
      <Recharge open={recharging} onClose={() => setRecharging(false)} />
      {credits.isPending ? <Loader type="cards" count={3} /> : credits.isError ? <ErrorState onRetry={credits.refetch} /> : (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4" data-testid="sms-usage">
          <StatCard label={t('sms.balance')} value={fmtMoney(d.balance, locale)} />
          <StatCard label={t('sms.spent_this_month')} value={fmtMoney(d.spent_this_month, locale)} />
          <StatCard label={t('sms.log')} value={fmtNumber(d.sent_this_month, locale)} />
          <StatCard label={t('sms.rate')} value={fmtMoney(d.rate, locale)} />
        </div>
      )}
      <p className="text-sm text-content-muted">{t('sms.parts_hint', { rate: d ? fmtMoney(d.rate, locale) : '' })}</p>
      <Tabs items={[{ key: 'log', label: t('sms.log') }, { key: 'ledger', label: t('sms.ledger') }]} value={tab} onChange={setTab} label={t('sms.title')} />
      {tab === 'log' ? <SmsLog /> : <Ledger rows={credits.data?.data.transactions ?? []} loading={credits.isPending} />}
    </div>
  )

}

function SmsLog() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const [status, setStatus] = useState('')
  const log = useInfiniteQuery({
    queryKey: ['sms', 'logs', status], initialPageParam: null,
    queryFn: ({ pageParam }) => api.get('/sms-logs', { params: { per_page: 30, status: status || undefined, cursor: pageParam ?? undefined } }).then(r => r.data),
    getNextPageParam: (last) => last.meta.next_cursor ?? undefined,
  })
  const rows = log.data?.pages.flatMap(p => p.data) ?? []
  return (
    <Card className="flex flex-col gap-3">
      <Select label={t('academic.status')} placeholder={t('common.all')} value={status} onChange={e => setStatus(e.target.value)} className="sm:w-56"
        options={['sent', 'failed'].map(s => ({ value: s, label: t(`sms.statuses.${s}`) }))} />
      {log.isPending ? <Loader type="skeleton" rows={5} /> : log.isError ? <ErrorState onRetry={log.refetch} /> : !rows.length ? <EmptyState title={t('sms.no_log')} /> : (
        <ul className="flex flex-col divide-y divide-line" data-testid="sms-log">
          {rows.map(l => (
            <li key={l.id} className="py-2 flex flex-col gap-1">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span><Ltr>{l.to_phone}</Ltr> · <span className="text-content-muted">{l.sent_at && `${fmtDate(l.sent_at, locale)} ${fmtTime(l.sent_at, locale)}`}</span></span>
                <span className="inline-flex items-center gap-2">
                  <span className="text-xs text-content-muted">{t('sms.parts', { count: l.segments })}{l.fallback_used ? ` · ${t('sms.fallback')}` : ''}</span>
                  <StatusBadge status={l.status} />
                </span>
              </div>
              <p className="text-sm" dir="auto">{l.message}</p>
            </li>
          ))}
        </ul>
      )}
      {log.hasNextPage && <div><Button variant="secondary" onClick={() => log.fetchNextPage()} loading={log.isFetchingNextPage}>{t('common.more')}</Button></div>}
    </Card>
  )
}

function Ledger({ rows, loading }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  if (loading) return <Loader type="skeleton" rows={4} />
  if (!rows.length) return <EmptyState title={t('sms.no_ledger')} />
  return (
    <Card>
      <ul className="flex flex-col divide-y divide-line" data-testid="sms-ledger">
        {rows.map(r => (
          <li key={r.id} className="flex items-center justify-between h-row gap-2">
            <span>{t(`sms.types.${r.type}`)} <span className="text-xs text-content-muted">{r.created_at && fmtDate(r.created_at, locale)}</span></span>
            <span><Ltr>{Number(r.amount) > 0 ? '+' : ''}{fmtMoney(r.amount, locale)}</Ltr>{r.quantity ? <span className="text-xs text-content-muted"> ({t('sms.parts', { count: Math.abs(r.quantity) })})</span> : null} <span className="text-xs text-content-muted">→ <Ltr>{fmtMoney(r.balance_after, locale)}</Ltr></span></span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Recharge({ open, onClose }) {
  const { t } = useTranslation()
  const [amount, setAmount] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true); setError(null)
    try {
      const { data } = await api.post('/subscription/sms-credits', { amount })
      window.location.assign(data.data.bkash_url)                 // bKash's own page; it brings the browser back to /admin/sms
    } catch (e) {
      const r = e.response?.data
      setError(r?.errors?.amount?.[0] ?? r?.message ?? t('sms.recharge.failed'))
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={t('sms.recharge.title')}>
      <div className="flex flex-col gap-3" data-testid="recharge">
        <p className="text-sm text-content-muted">{t('sms.recharge.hint')}</p>
        <Input label={t('sms.recharge.amount')} ltr inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} error={error} name="amount" />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={go} loading={busy} disabled={!amount} data-action="pay">{t('sms.recharge.pay')}</Button>
        </div>
      </div>
    </Modal>
  )
}
