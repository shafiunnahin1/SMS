import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { usePrint } from '../../hooks/usePrint'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate, fmtMoney } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'

// D218 WAL.1 /super-admin/wallet-recharges: where institutions send money (the instructions they see), and the queue of manual
// top-ups of every institution - open the receipt, approve (credits the wallet once) or reject with a reason.
export default function WalletRecharges() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4" data-testid="super-wallet">
      <PageHeader title={t('wallet.super_title')} />
      <Instructions />
      <Queue />
    </div>
  )
}

function Instructions() {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['super', 'wallet', 'instructions'], queryFn: () => api.get('/super/wallet/instructions').then(r => r.data.data) })
  const [text, setText] = useState(null)
  const [busy, setBusy] = useState(false)
  if (q.isPending) return <Loader />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  const cur = text ?? q.data.instructions
  const save = async () => {
    setBusy(true)
    try { await api.put('/super/wallet/instructions', { instructions: cur }); useUiStore.getState().addToast(t('wallet.saved')) } catch { /* the interceptor shows the error */ } finally { setBusy(false) }
  }
  return (
    <Card className="flex flex-col gap-2" data-testid="instructions-form">
      <Textarea name="instructions" label={t('wallet.instructions_label')} hint={t('wallet.instructions_hint')} rows={4} value={cur} onChange={(e) => setText(e.target.value)} maxLength={3000} />
      <div><Button onClick={save} disabled={busy} data-action="save-instructions">{t('wallet.save')}</Button></div>
    </Card>
  )
}

function Queue() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const { preview, loading } = usePrint()
  const [status, setStatus] = useState('pending')
  const [reasons, setReasons] = useState({})
  const q = useQuery({ queryKey: ['super', 'wallet', 'requests', status], queryFn: () => api.get('/super/wallet/recharge-requests', { params: status ? { status } : {} }).then(r => r.data.data) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['super', 'wallet', 'requests'] })
  const approve = (r) => useUiStore.getState().openConfirm({ title: t('wallet.approve'), description: t('wallet.approve_confirm', { amount: r.amount, name: r.student ? `${r.student.name} (${r.institution?.name})` : r.institution?.name }),
    onConfirm: async () => { try { await api.post(`/super/wallet/recharge-requests/${r.id}/approve`) } catch { /* the interceptor shows the error */ } finally { refresh() } } })
  const reject = async (r) => {
    try { await api.post(`/super/wallet/recharge-requests/${r.id}/reject`, { reason: reasons[r.id] ?? '' }) } catch { /* the interceptor shows the error */ } finally { refresh() }
  }
  return (
    <Card className="flex flex-col gap-3">
      <Select name="status" label={t('wallet.status')} value={status} onChange={(e) => setStatus(e.target.value)} className="sm:w-56"
        options={[{ value: 'pending', label: t('wallet.statuses.pending') }, { value: 'approved', label: t('wallet.statuses.approved') }, { value: 'rejected', label: t('wallet.statuses.rejected') }, { value: '', label: t('wallet.all') }]} />
      {q.isLoading ? <Loader /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.length ? <EmptyState title={t('wallet.no_requests')} /> : (
        <ul className="flex flex-col divide-y divide-line text-sm" data-testid="queue">
          {q.data.map(r => (
            <li key={r.id} className="py-2 flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2"><span className="font-medium"><Ltr>{fmtMoney(r.amount, locale)}</Ltr></span><span>{r.institution?.name}</span>
                {r.student && <span data-testid="student-wallet">· {t('wallet.student_of', { name: r.student.name })} (<Ltr>{r.student.username}</Ltr>)</span>}
                <span className="rounded-full px-2 py-0.5 text-xs bg-surface-muted font-medium">{t(`wallet.statuses.${r.status}`)}</span></span>
              <span className="text-content-muted">{r.created_at && fmtDate(r.created_at, locale)} · {t(`wallet.methods.${r.method}`)} · <Ltr>{r.trx_reference}</Ltr>{r.note ? ` · ${r.note}` : ''}</span>
              <span className="flex flex-wrap items-end gap-2">
                {r.has_receipt && <Button variant="ghost" disabled={loading} onClick={() => preview(`/super/wallet/recharge-requests/${r.id}/receipt`)} data-action="receipt">{t('wallet.open_receipt')}</Button>}
                {r.status === 'pending' && (
                  <>
                    <Button onClick={() => approve(r)} data-action="approve">{t('wallet.approve')}</Button>
                    <Input name={`reason-${r.id}`} aria-label={t('wallet.reason')} placeholder={t('wallet.reason')} value={reasons[r.id] ?? ''} onChange={(e) => setReasons({ ...reasons, [r.id]: e.target.value })} maxLength={255} />
                    <Button variant="ghost" disabled={!(reasons[r.id] ?? '').trim()} onClick={() => reject(r)} data-action="reject">{t('wallet.reject')}</Button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
