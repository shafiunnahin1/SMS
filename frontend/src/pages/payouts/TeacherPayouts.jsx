import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtMoney, fmtNumber } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'

const METHODS = ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'other']
const lastMonth = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

// D223 TPO.2 /admin|accountant/teacher-payouts: a month's payouts per teacher and batch, computed by the server. Draft: change the
// amount (with why), approve. Approved: pay (how, when) - a paid payout is final (D32). Pay data: admin and accountant only (D33).
export default function TeacherPayouts() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const [month, setMonth] = useState(lastMonth())
  const q = useQuery({ queryKey: ['teacher-payouts', month], queryFn: () => api.get('/teacher-payouts', { params: { month } }).then(r => r.data) })
  const [busy, setBusy] = useState(false)
  const generate = async () => {
    setBusy(true)
    try { qc.setQueryData(['teacher-payouts', month], (await api.post('/teacher-payouts/generate', { month })).data) } catch { /* the interceptor shows it */ } finally { setBusy(false) }
  }
  const refresh = () => qc.invalidateQueries({ queryKey: ['teacher-payouts', month] })
  return (
    <div className="flex flex-col gap-4" data-testid="teacher-payouts">
      <PageHeader title={t('payouts.title')} />
      <Card className="flex flex-wrap items-end gap-3">
        <Input type="month" name="month" label={t('payouts.month')} ltr value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        <Button onClick={generate} loading={busy} data-action="generate">{t('payouts.generate')}</Button>
        <p className="text-sm text-content-muted basis-full">{t('payouts.generate_hint')}</p>
      </Card>
      {q.isPending ? <Loader type="page" /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.data.length ? <EmptyState title={t('payouts.none')} /> : (
        <Card className="flex flex-col gap-2">
          <p className="text-sm font-semibold" data-testid="payouts-total">{t('payouts.total')}: <Ltr>{fmtMoney(q.data.meta.total, locale)}</Ltr></p>
          <ul className="flex flex-col divide-y divide-line" data-testid="payout-list">
            {q.data.data.map(p => <Row key={p.id} p={p} onChanged={refresh} />)}
          </ul>
        </Card>
      )}
    </div>
  )
}

function Row({ p, onChanged }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const [amount, setAmount] = useState(p.amount)
  const [note, setNote] = useState(p.note ?? '')
  const [method, setMethod] = useState('cash')
  const [date, setDate] = useState(today())
  const [errors, setErrors] = useState({})
  const act = async (fn) => {
    setErrors({})
    try { await fn(); onChanged() } catch (e) { setErrors(Object.fromEntries(Object.entries(e.response?.data?.errors ?? {}).map(([k, m]) => [k, m[0]]))) }
  }
  const pay = () => useUiStore.getState().openConfirm({ title: t('payouts.pay'), description: t('payouts.pay_confirm'), confirmLabel: t('payouts.pay'),
    onConfirm: () => act(() => api.post(`/teacher-payouts/${p.id}/pay`, { method, date })) })
  return (
    <li className="py-3 flex flex-col gap-2" data-testid="payout" data-status={p.status}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium" dir="auto">{p.teacher.name}</span>
        {p.batch && <span className="text-sm text-content-muted" dir="auto">· {p.batch.name}</span>}
        <span className="rounded-full px-2 py-0.5 text-xs bg-surface-muted font-medium">{t(`payouts.statuses.${p.status}`)}</span>
        <span className="ms-auto font-semibold"><Ltr>{fmtMoney(p.amount, locale)}</Ltr></span>
      </div>
      <p className="text-xs text-content-muted">
        {p.classes_taken > 0 && <>{t('payouts.classes', { n: fmtNumber(p.classes_taken, locale) })} · </>}
        {Number(p.collection_base) > 0 && <>{t('payouts.base')}: <Ltr>{fmtMoney(p.collection_base, locale)}</Ltr> · </>}
        {p.note && <span dir="auto">{p.note}</span>}
      </p>
      {p.status === 'draft' && (
        <div className="flex flex-wrap items-end gap-2">
          <Input name={`amount-${p.id}`} label={t('payouts.amount')} inputMode="decimal" ltr className="w-32" value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amount} />
          <Input name={`note-${p.id}`} label={t('payouts.note')} className="flex-1 min-w-40" value={note} onChange={(e) => setNote(e.target.value)} error={errors.note} maxLength={255} />
          <Button variant="secondary" onClick={() => act(() => api.put(`/teacher-payouts/${p.id}`, { amount, note: note || null }))} data-action="save">{t('common.save')}</Button>
          <Button onClick={() => act(() => api.post(`/teacher-payouts/${p.id}/approve`))} data-action="approve">{t('payouts.approve')}</Button>
        </div>
      )}
      {p.status === 'approved' && (
        <div className="flex flex-wrap items-end gap-2">
          <Select name={`method-${p.id}`} label={t('payouts.method')} value={method} onChange={(e) => setMethod(e.target.value)} options={METHODS.map(m => ({ value: m, label: t(`payouts.methods.${m}`) }))} />
          <Input type="date" name={`date-${p.id}`} label={t('payouts.date')} ltr value={date} onChange={(e) => setDate(e.target.value)} error={errors.date} />
          <Button onClick={pay} data-action="pay">{t('payouts.pay')}</Button>
        </div>
      )}
    </li>
  )
}
