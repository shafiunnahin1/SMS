import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../../api/axios'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate, fmtNumber } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { Select } from '../../components/FormField'
import { EmptyState } from '../../components/StateViews'
import List from '../../ui/variants/List'

const STATES = ['trial', 'active', 'grace', 'read_only']

// D187 SUB.3 /super-admin/subscriptions: per institution, how many modules are in trial, paid, grace or read-only, and the next end
export default function SubscriptionStatus() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const [state, setState] = useState('')
  const [page, setPage] = useState(1)
  const q = useQuery({ queryKey: ['super', 'subscriptions', state, page],
    queryFn: () => api.get('/super/subscriptions', { params: { page, ...(state ? { state } : {}) } }).then(r => r.data) })
  const cols = [
    { key: 'name', label: t('subscription.institution'), primary: true, render: r => <Link to={`/super-admin/institutions/${r.id}`} dir="auto">{r.name}</Link> },
    { key: 'type', label: t('subscription.types'), render: r => t(`dashboard.types.${r.institution_type}`, { defaultValue: r.institution_type }) },
    ...STATES.map(s => ({ key: s, label: t(`status.${s}`), render: r => fmtNumber(r.counts[s], locale) })),
    { key: 'next_end', label: t('subscription.next_end'), render: r => (r.next_end ? fmtDate(r.next_end, locale) : '—') },
  ]
  const meta = q.data?.meta
  return (
    <div className="flex flex-col gap-4" data-testid="subscription-status">
      <PageHeader title={t('subscription.status_title')} />
      <Card className="flex flex-col gap-3">
        <Select label={t('subscription.filter')} className="w-48" value={state} data-testid="state-filter" onChange={e => { setState(e.target.value); setPage(1) }}
          options={[{ value: '', label: t('subscription.all') }, ...STATES.map(s => ({ value: s, label: t(`status.${s}`) }))]} />
        <List columns={cols} rows={q.data?.data ?? []} loading={q.isPending} error={q.isError} onRetry={q.refetch} empty={<EmptyState title={t('subscription.no_rows')} />} />
        {meta && meta.last_page > 1 && (
          <div className="flex gap-2">
            <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('common.previous')}</Button>
            <Button variant="ghost" disabled={page >= meta.last_page} onClick={() => setPage(p => p + 1)}>{t('common.next')}</Button>
          </div>
        )}
      </Card>
    </div>
  )
}
