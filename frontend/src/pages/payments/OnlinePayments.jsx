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
import { Select } from '../../components/FormField'

const STATUSES = ['', 'review', 'success', 'initiated', 'failed', 'cancelled', 'refunded']

// D217 OPAY.3: online fee payments. mode 'institution' = /admin|accountant/payments (read only); mode 'super' =
// /super-admin/online-payments - every institution, with the review actions (accept a late payment, mark refunded, ask again).
export default function OnlinePayments({ mode = 'institution' }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const sup = mode === 'super'
  const [status, setStatus] = useState(sup ? 'review' : '')
  const q = useQuery({ queryKey: ['online-payments', mode, status], queryFn: () => api.get(sup ? '/super/online-payments' : '/admin/payments', { params: status ? { status } : {} }).then(r => r.data.data) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['online-payments'] })
  const resolve = (p, action) => useUiStore.getState().openConfirm({ title: t(`opay.${action}`), description: t(`opay.${action}_confirm`),
    onConfirm: async () => { try { await api.post(`/super/online-payments/${p.id}/resolve`, { action }) } catch { /* the interceptor shows the error */ } finally { refresh() } } })
  const verify = async (p) => { try { await api.post(`/super/online-payments/${p.id}/verify`) } catch { /* the interceptor shows the error */ } finally { refresh() } }
  return (
    <div className="flex flex-col gap-4" data-testid="online-payments">
      <PageHeader title={t('opay.title')} />
      <p className="text-sm text-content-muted">{t('opay.test_only')}</p>
      <Card className="flex flex-col gap-3">
        <Select name="status" label={t('opay.status')} value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-56"
          options={STATUSES.map(s => ({ value: s, label: s ? t(`opay.statuses.${s}`) : t('opay.all') }))} />
        {q.isLoading ? <Loader /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.length ? <EmptyState title={t('opay.none')} /> : (
          <ul className="flex flex-col divide-y divide-line text-sm" data-testid="payment-list">
            {q.data.map(p => (
              <li key={p.id} className="py-2 flex flex-col gap-1" data-status={p.status}>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium"><Ltr>{fmtMoney(p.amount, locale)}</Ltr></span>
                  <span className="rounded-full px-2 py-0.5 text-xs bg-surface-muted font-medium">{t(`opay.statuses.${p.status}`)}</span>
                  {p.status === 'review' && p.failure_reason && <span>{t(`opay.reasons.${p.failure_reason}`, { defaultValue: p.failure_reason })}</span>}
                  {sup ? <span>{p.institution?.name}</span> : p.student && <span>{p.student.name} <Ltr>({p.student.student_id})</Ltr></span>}
                </span>
                <span className="text-content-muted">
                  {p.initiated_at && fmtDate(p.initiated_at, locale)} · {p.gateway}{p.channel ? ` / ${p.channel}` : ''} · {t('opay.ref')} <Ltr>{p.ref}</Ltr>
                  {p.receipt_no ? <> · {t('opay.receipt')} <Ltr>{p.receipt_no}</Ltr></> : null}{p.trx_id ? <> · <Ltr>{p.trx_id}</Ltr></> : null}
                </span>
                {sup && p.status === 'review' && (
                  <span className="flex flex-wrap gap-2">
                    {p.failure_reason === 'late_payment' && <Button onClick={() => resolve(p, 'accept_as_paid')} data-action="accept">{t('opay.accept_as_paid')}</Button>}
                    <Button variant="ghost" onClick={() => resolve(p, 'mark_refunded')} data-action="refund">{t('opay.mark_refunded')}</Button>
                    <Button variant="ghost" onClick={() => verify(p)} data-action="verify">{t('opay.verify')}</Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
