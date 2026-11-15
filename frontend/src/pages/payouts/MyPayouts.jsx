import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate, fmtMoney, fmtNumber } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'

// D223 TPO.2 /teacher/payouts: the signed-in teacher's own approved and paid payouts, read-only
export default function MyPayouts() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const q = useQuery({ queryKey: ['teacher', 'payouts'], queryFn: () => api.get('/teacher/payouts').then(r => r.data.data) })
  return (
    <div className="flex flex-col gap-4" data-testid="my-payouts">
      <PageHeader title={t('payouts.mine')} />
      {q.isPending ? <Loader type="page" /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.length ? <EmptyState title={t('payouts.none')} /> : (
        <Card>
          <ul className="flex flex-col divide-y divide-line">
            {q.data.map(p => (
              <li key={p.id} className="py-2 flex flex-wrap items-center gap-2" data-testid="my-payout">
                <span className="font-medium"><Ltr>{p.month}</Ltr></span>
                {p.batch && <span className="text-sm text-content-muted" dir="auto">{p.batch.name}</span>}
                {p.classes_taken > 0 && <span className="text-xs text-content-muted">{t('payouts.classes', { n: fmtNumber(p.classes_taken, locale) })}</span>}
                <span className="rounded-full px-2 py-0.5 text-xs bg-surface-muted font-medium">{t(`payouts.statuses.${p.status}`)}{p.paid_at ? ` · ${fmtDate(p.paid_at, locale)}` : ''}</span>
                <span className="ms-auto font-semibold"><Ltr>{fmtMoney(p.amount, locale)}</Ltr></span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
