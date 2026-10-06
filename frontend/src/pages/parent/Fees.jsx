import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate, fmtMoney } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import Ltr from '../../components/bidi/Ltr'

// The parent's own children only (GET /parent/children); dues and receipts of the chosen child (walking-skeleton S6)
export default function ParentFees() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const children = useQuery({ queryKey: ['parent', 'children'], queryFn: () => api.get('/parent/children').then(r => r.data.data) })
  const [chosen, setChosen] = useState(null)
  const child = chosen ?? children.data?.[0]?.id
  const dues = useQuery({ queryKey: ['parent', 'dues', child], enabled: Boolean(child),
    queryFn: () => api.get('/parent/fees', { params: { student_id: child } }).then(r => r.data.data) })
  const receipts = useQuery({ queryKey: ['parent', 'receipts', child], enabled: Boolean(child),
    queryFn: () => api.get(`/fees/payments/student/${child}`).then(r => r.data.data) })

  if (children.isPending) return <><PageHeader title={t('parent.title')} /><Loader type="page" count={2} rows={3} /></>
  if (children.isError) return <ErrorState onRetry={children.refetch} />
  if (!children.data.length) return <EmptyState />

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('parent.title')} />
      {children.data.length > 1 && (
        <div role="tablist" aria-label={t('fees.pick_child')} className="flex flex-wrap gap-2">
          {children.data.map(c => (
            <button key={c.id} role="tab" aria-selected={c.id === child} type="button" onClick={() => setChosen(c.id)}
              className={`h-9 px-3 rounded-token text-sm ${c.id === child ? 'bg-primary text-on-primary' : 'bg-surface [border:1px_solid_var(--line)]'}`}>
              <span dir="auto">{c.name}</span>
            </button>
          ))}
        </div>
      )}
      <Card>
        <h2 className="font-semibold mb-2">{t('fees.dues')}</h2>
        {dues.isPending ? <Loader type="skeleton" rows={3} /> : dues.isError ? <ErrorState onRetry={dues.refetch} /> : !dues.data.lines.length ? <EmptyState title={t('fees.no_dues')} /> : (
          <ul className="flex flex-col divide-y divide-line" data-testid="parent-dues">
            {dues.data.lines.map(l => (
              <li key={l.key} className="flex items-center justify-between h-row"><span dir="auto">{l.category} · <Ltr>{l.period}</Ltr></span><Ltr>{fmtMoney(l.amount, locale)}</Ltr></li>
            ))}
            <li className="flex items-center justify-between h-row font-semibold"><span>{t('common.total')}</span><Ltr>{fmtMoney(dues.data.total, locale)}</Ltr></li>
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="font-semibold mb-2">{t('fees.receipts')}</h2>
        {receipts.isPending ? <Loader type="cards" count={2} /> : receipts.isError ? <ErrorState onRetry={receipts.refetch} /> : !receipts.data.length ? <EmptyState /> : (
          <ul className="flex flex-col divide-y divide-line" data-testid="parent-receipts">
            {receipts.data.map(r => (
              <li key={r.receipt_no} className="flex items-center justify-between py-2">
                <span><Ltr>{r.receipt_no}</Ltr><span className="block text-xs text-content-muted">{r.paid_at && fmtDate(r.paid_at, locale)}</span></span>
                <Ltr>{fmtMoney(r.total, locale)}</Ltr>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
