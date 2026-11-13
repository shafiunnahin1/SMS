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
import StatusBadge from '../../components/StatusBadge'
import Tabs from '../../ui/variants/Tabs'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'

// D211 /admin|accountant/fees/installments: (1) find a student, split one of their dues into monthly installments, pay an
// installment (a normal receipt) or move an unpaid one's date; (2) the overdue installments.
export default function Installments() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('plans')
  return (
    <div className="flex flex-col gap-4" data-testid="installments">
      <PageHeader title={t('inst.title')} />
      <Tabs items={[{ key: 'plans', label: t('inst.plans') }, { key: 'overdue', label: t('inst.overdue') }]} value={tab} onChange={setTab} label={t('inst.title')} />
      {tab === 'plans' ? <Plans /> : <Overdue />}
    </div>
  )
}

function usePay() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  return (it) => useUiStore.getState().openConfirm({ title: t('inst.pay'), description: t('inst.pay_confirm', { no: it.installment_no, amount: it.amount }),
    onConfirm: async () => {
      try {
        const r = await api.post(`/fees/installments/${it.id}/pay`, { payment_method: 'cash' })
        useUiStore.getState().addToast(t('inst.paid', { no: r.data.data.receipt_no }))
      } catch { /* the interceptor shows the error */ } finally { qc.invalidateQueries({ queryKey: ['installments'] }); qc.invalidateQueries({ queryKey: ['dues'] }) }
    } })
}

function Items({ items }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const pay = usePay()
  const move = async (it) => {
    const d = window.prompt(t('inst.new_date'), it.due_date)
    if (!d) return
    try { await api.put(`/fees/installments/${it.id}`, { due_date: d }) } catch { /* the interceptor shows the error */ } finally { qc.invalidateQueries({ queryKey: ['installments'] }) }
  }
  return (
    <ul className="flex flex-col divide-y divide-line">
      {items.map(it => (
        <li key={it.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>{t('inst.no', { no: it.installment_no })} · {fmtMoney(it.amount, locale)} · {fmtDate(it.due_date, locale)}</span>
          <span className="inline-flex items-center gap-2">
            <StatusBadge status={it.status === 'pending' ? 'due' : it.status === 'overdue' ? 'late' : 'paid'} />
            {it.status !== 'paid' && <Button onClick={() => pay(it)} data-action="pay">{t('inst.pay')}</Button>}
            {it.status !== 'paid' && <Button variant="ghost" onClick={() => move(it)} data-action="move">{t('inst.move')}</Button>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Plans() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [student, setStudent] = useState(null)
  const [f, setF] = useState({ due_key: '', installments: '3', first_due_date: '' })
  const [busy, setBusy] = useState(false)
  const found = useQuery({ queryKey: ['students', 'search', q], enabled: q.trim().length >= 2 && !student, queryFn: () => api.get('/students', { params: { q: q.trim(), per_page: 10 } }).then(r => r.data.data) })
  const dues = useQuery({ queryKey: ['dues', student?.id], enabled: !!student, queryFn: () => api.get('/fees/dues', { params: { student_id: student.id } }).then(r => r.data.data) })
  const plans = useQuery({ queryKey: ['installments', student?.id], enabled: !!student, queryFn: () => api.get('/fees/installments', { params: { student_id: student.id } }).then(r => r.data.data) })
  const inPlan = new Set((plans.data ?? []).filter(p => p.items.some(i => i.status !== 'paid')).map(p => p.due_key))
  const create = async () => {
    setBusy(true)
    try {
      await api.post('/fees/installments/plan', { student_id: student.id, due_key: f.due_key, installments: Number(f.installments), first_due_date: f.first_due_date })
      useUiStore.getState().addToast(t('common.saved'))
      setF({ due_key: '', installments: '3', first_due_date: '' }); qc.invalidateQueries({ queryKey: ['installments'] })
    } catch { /* the interceptor shows the error */ } finally { setBusy(false) }
  }
  if (!student) return (
    <Card className="flex flex-col gap-3" data-testid="inst-find">
      <Input label={t('ptc.find')} value={q} onChange={e => setQ(e.target.value)} name="q" />
      {(found.data ?? []).map(s => <Button key={s.id} variant="secondary" onClick={() => setStudent(s)} data-action="pick">{s.name} · <Ltr>{s.student_id}</Ltr></Button>)}
    </Card>
  )
  const lines = (dues.data?.lines ?? [])
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3" data-testid="inst-form">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">{student.name} <span className="text-content-muted"><Ltr>{student.student_id}</Ltr></span></p>
          <Button variant="ghost" onClick={() => { setStudent(null); setQ('') }}>{t('inst.other_student')}</Button>
        </div>
        {dues.isPending ? <Loader type="skeleton" rows={2} /> : !lines.length ? <EmptyState title={t('inst.no_dues')} /> : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Select label={t('inst.due')} placeholder="—" value={f.due_key} onChange={e => setF(v => ({ ...v, due_key: e.target.value }))} name="due_key"
              options={lines.map(l => ({ value: l.key, label: `${l.category} · ${l.period} · ${fmtMoney(l.amount, locale)}${inPlan.has(l.key) ? ` · ${t('inst.in_plan')}` : ''}` }))} />
            <Input label={t('inst.count')} ltr inputMode="numeric" value={f.installments} onChange={e => setF(v => ({ ...v, installments: e.target.value.replace(/\D/g, '') }))} name="installments" />
            <Input label={t('inst.first_date')} type="date" ltr value={f.first_due_date} onChange={e => setF(v => ({ ...v, first_due_date: e.target.value }))} name="first_due_date" />
          </div>
        )}
        <div><Button onClick={create} loading={busy} disabled={!f.due_key || !f.first_due_date || Number(f.installments) < 2 || inPlan.has(f.due_key)} data-action="create">{t('inst.create')}</Button></div>
      </Card>
      {plans.isPending ? <Loader type="skeleton" rows={3} /> : plans.isError ? <ErrorState onRetry={plans.refetch} /> : (plans.data ?? []).map(p => (
        <Card key={p.id} className="flex flex-col gap-2" data-plan={p.id}>
          <p className="font-medium">{p.category} · {fmtMoney(p.total_amount, locale)} · {t('inst.count_n', { n: p.installments })}</p>
          <Items items={p.items} />
        </Card>
      ))}
    </div>
  )
}

function Overdue() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const pay = usePay()
  const q = useQuery({ queryKey: ['installments', 'overdue'], queryFn: () => api.get('/fees/installments/overdue').then(r => r.data.data) })
  if (q.isPending) return <Loader type="skeleton" rows={4} />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  if (!q.data.length) return <EmptyState title={t('inst.none_overdue')} />
  return (
    <Card>
      <ul className="flex flex-col divide-y divide-line" data-testid="overdue-list">
        {q.data.map(it => (
          <li key={it.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{it.student?.name} <span className="text-content-muted"><Ltr>{it.student?.student_id}</Ltr></span> · {it.category} · {t('inst.no', { no: it.installment_no })} · {fmtMoney(it.amount, locale)} · {fmtDate(it.due_date, locale)}</span>
            <Button onClick={() => pay(it)} data-action="pay">{t('inst.pay')}</Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
