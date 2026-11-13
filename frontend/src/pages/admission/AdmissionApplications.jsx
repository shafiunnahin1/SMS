import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtMoney } from '../../i18n/format'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import StatusBadge from '../../components/StatusBadge'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'

// D209 ACY.2: one cycle's applications, oldest first, with paid / unpaid. While the cycle is open the admin or the accountant
// takes the fee in cash (the server sets the amount, an APP- receipt); the admin can reverse a payment (a new negative row).
export default function AdmissionApplications({ cycleId, isAdmin }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admission', 'applications', cycleId], queryFn: () => api.get(`/admission/cycles/${cycleId}/applications`).then(r => r.data) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admission', 'applications', cycleId] })
  if (q.isPending) return <Loader type="skeleton" rows={4} />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  const { data: rows, meta } = q.data
  const canTake = meta.status === 'open' && Number(meta.application_fee) > 0 && meta.methods.includes('cash')

  const collect = (l) => useUiStore.getState().openConfirm({ title: t('admission.collect'), description: t('admission.collect_confirm', { amount: fmtMoney(meta.application_fee, locale), name: l.name }),
    onConfirm: async () => {
      try {
        const r = await api.post(`/admission/leads/${l.id}/payments`)
        useUiStore.getState().addToast(t('admission.receipt', { no: r.data.data.receipt_no }))
      } catch { /* the interceptor shows the error */ } finally { refresh() }
    } })
  const reverse = async (l) => {
    const reason = window.prompt(t('admission.reverse_reason'))
    if (!reason) return
    try {
      const pays = (await api.get(`/admission/leads/${l.id}/payments`)).data.data
      const last = [...pays].reverse().find(p => Number(p.amount) > 0)
      if (last) await api.post(`/admission/lead-payments/${last.id}/reverse`, { reason })
    } catch { /* the interceptor shows the error */ } finally { refresh() }
  }

  if (!rows.length) return <EmptyState title={t('admission.no_applications')} />
  return (
    <ul className="flex flex-col divide-y divide-line" data-testid="applications">
      {rows.map(l => (
        <li key={l.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-col">
            <span className="font-medium">{l.name} <span className="text-xs text-content-muted"><Ltr>{l.application_no}</Ltr></span></span>
            <span className="text-xs text-content-muted"><Ltr>{l.phone}</Ltr>{l.test_roll ? ` · ${t('admission.roll')} ${l.test_roll}` : ''}</span>
          </span>
          <span className="inline-flex items-center gap-2">
            {Number(meta.application_fee) > 0 && <StatusBadge status={l.paid ? 'paid' : 'due'} />}
            {canTake && !l.paid && <Button onClick={() => collect(l)} data-action="collect">{t('admission.collect')}</Button>}
            {isAdmin && meta.status === 'open' && Number(l.paid_amount) > 0 && <Button variant="secondary" onClick={() => reverse(l)} data-action="reverse">{t('admission.reverse')}</Button>}
          </span>
        </li>
      ))}
    </ul>
  )
}
