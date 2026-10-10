import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import api from '../../../api/axios'
import { useLocale } from '../../../ui/I18nProvider'
import { fmtDate, fmtNumber, fmtTime } from '../../../i18n/format'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import Loader from '../../../components/Loader'
import StatusBadge from '../../../components/StatusBadge'
import { EmptyState, ErrorState } from '../../../components/StateViews'
import { Select } from '../../../components/FormField'
import Ltr from '../../../components/bidi/Ltr'
import Tabs from '../../../ui/variants/Tabs'
import StatCard from '../../../ui/variants/StatCard'

// Step 4.6 /admin/sms: balance and this month's use (GET /subscription/sms-credits), the SMS log (GET /sms-logs, cursor) and the
// credit ledger. Sending happens on its own (absence alerts, receipts); buying credit is Step 5.2 (blocked, D47).
export default function SmsCenter() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const [tab, setTab] = useState('log')
  const credits = useQuery({ queryKey: ['sms', 'credits'], queryFn: () => api.get('/subscription/sms-credits').then(r => r.data) })
  const n = (v) => (v == null ? t('sms.unlimited') : fmtNumber(v, locale))
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('sms.title')} />
      {credits.isPending ? <Loader type="cards" count={3} /> : credits.isError ? <ErrorState onRetry={credits.refetch} /> : (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3" data-testid="sms-usage">
          <StatCard label={t('sms.balance')} value={n(credits.data.data.balance)} />
          <StatCard label={t('sms.used_this_month')} value={n(credits.data.data.used_this_month)} />
          <StatCard label={t('sms.quota_left')} value={n(credits.data.data.quota_left)} />
        </div>
      )}
      <p className="text-sm text-content-muted">{t('sms.parts_hint')}</p>
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
            <span><Ltr>{r.quantity > 0 ? '+' : ''}{fmtNumber(r.quantity, locale)}</Ltr> <span className="text-xs text-content-muted">→ <Ltr>{fmtNumber(r.balance_after, locale)}</Ltr></span></span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
