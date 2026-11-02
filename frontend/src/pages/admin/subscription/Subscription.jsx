import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import api from '../../../api/axios'
import { useUiStore } from '../../../store/uiStore'
import { useLocale } from '../../../ui/I18nProvider'
import { fmtDate, fmtMoney } from '../../../i18n/format'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import Loader from '../../../components/Loader'
import StatusBadge from '../../../components/StatusBadge'
import Ltr from '../../../components/bidi/Ltr'
import { Input, Select } from '../../../components/FormField'
import { EmptyState, ErrorState } from '../../../components/StateViews'
import List from '../../../ui/variants/List'

const KEY = ['subscription']

// D187 SUB.3 /admin/subscription: each paid module's state (trial / paid / grace / read-only), choose modules and monthly or yearly,
// see the bill the server prices (prorated add, coupon, tax 0), pay with bKash (back here with ?payment=), redeem a coupon, remove a
// module from the next period (no refund) and the invoices. The client never sends an amount.
export default function Subscription() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const status = useQuery({ queryKey: KEY, queryFn: () => api.get('/subscription/modules').then(r => r.data.data) })
  const invoices = useQuery({ queryKey: [...KEY, 'invoices'], queryFn: () => api.get('/subscription/invoices').then(r => r.data.data) })
  const [picked, setPicked] = useState({})            // module_key -> 'monthly' | 'yearly'
  const [quote, setQuote] = useState(null)
  const [busy, setBusy] = useState(false)
  const [params, setParams] = useSearchParams()
  const back = params.get('payment')
  const announced = useRef(null)
  useEffect(() => {
    if (!back || announced.current === back) return
    announced.current = back
    useUiStore.getState().addToast(t(`subscription.payment.${back}`, { defaultValue: t('subscription.payment.failed') }), back === 'success' ? 'success' : 'error')
    setParams({}, { replace: true })
  }, [back, setParams, t])

  const name = (k) => t(`subscription.module_names.${k}`, { defaultValue: k })
  const items = () => Object.entries(picked).map(([module_key, billing_cycle]) => ({ module_key, billing_cycle }))
  const fail = (e) => useUiStore.getState().addToast(e.response?.data?.message ?? t('subscription.payment.failed'), 'error')
  const refresh = () => { setQuote(null); qc.invalidateQueries({ queryKey: KEY }) }
  const getQuote = async () => {
    if (!items().length) return useUiStore.getState().addToast(t('subscription.nothing_selected'), 'error')
    setBusy(true)
    try { setQuote((await api.post('/subscription/quote', { items: items() })).data.data) } catch (e) { fail(e) } finally { setBusy(false) }
  }
  const pay = async () => {
    setBusy(true)
    try {
      const d = (await api.post('/subscription/checkout', { items: items() })).data.data
      if (d.bkash_url) { window.location.assign(d.bkash_url); return }
      useUiStore.getState().addToast(t('subscription.payment.success'), 'success')
      setPicked({}); refresh()
    } catch (e) { fail(e) } finally { setBusy(false) }
  }
  const toggleCancel = async (m) => {
    try { await api.post(`/subscription/modules/${m.cancel_at_period_end ? 'resume' : 'cancel'}`, { module_key: m.module_key }); refresh() } catch (e) { fail(e) }
  }
  const pick = (k, cycle) => { setQuote(null); setPicked(p => { const n = { ...p }; if (cycle) n[k] = cycle; else delete n[k]; return n }) }

  const cols = [
    { key: 'module_key', label: t('subscription.module'), primary: true, render: m => (
      <span className="flex flex-col">
        <span>{name(m.module_key)}</span>
        {m.requires.length > 0 && <span className="text-xs text-content-muted">{t('subscription.needs', { list: m.requires.map(name).join(', ') })}</span>}
      </span>) },
    { key: 'state', label: t('subscription.state'), render: m => <span className="flex flex-col gap-1"><StatusBadge status={m.state} />
      {m.cancel_at_period_end && <span className="text-xs text-content-muted">{t('subscription.removing')}</span>}
      {m.current_period_end && <Button variant="ghost" onClick={() => toggleCancel(m)} data-cancel={m.module_key}>{t(m.cancel_at_period_end ? 'subscription.resume' : 'subscription.remove')}</Button>}</span> },
    { key: 'ends', label: t('subscription.period'), render: m => m.current_period_end ? t('subscription.period_ends', { date: fmtDate(m.current_period_end, locale) })
      : m.trial_ends_at ? t('subscription.trial_ends', { date: fmtDate(m.trial_ends_at, locale) }) : '—' },
    { key: 'monthly_price', label: t('subscription.monthly'), render: m => <Ltr>{fmtMoney(m.monthly_price, locale)}</Ltr> },
    { key: 'yearly_price', label: t('subscription.yearly'), render: m => <Ltr>{fmtMoney(m.yearly_price, locale)}</Ltr> },
    { key: 'select', label: t('subscription.select'), action: true, render: m => (
      <Select aria-label={`${t('subscription.select')}: ${name(m.module_key)}`} className="w-32" data-module={m.module_key} value={picked[m.module_key] ?? ''}
        onChange={e => pick(m.module_key, e.target.value)}
        options={[{ value: '', label: '—' }, { value: 'monthly', label: t('subscription.monthly') }, { value: 'yearly', label: t('subscription.yearly') }]} />) },
  ]

  if (status.isPending) return <Loader type="skeleton" rows={6} />
  if (status.isError) return <ErrorState onRetry={status.refetch} />
  const d = status.data
  return (
    <div className="flex flex-col gap-4" data-testid="subscription">
      <PageHeader title={t('subscription.title')} />
      <p className="text-sm text-content-muted">{t('subscription.free_note')} {t('subscription.grace_note', { n: d.grace_days })}</p>
      <Coupon running={d.coupon} onDone={refresh} />
      <Card>
        <List columns={cols} rows={d.modules.map(m => ({ ...m, id: m.module_key }))} empty={<EmptyState />} />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={getQuote} loading={busy} data-action="quote">{t('subscription.quote')}</Button>
        </div>
      </Card>
      {quote && <Bill quote={quote} name={name} busy={busy} onPay={pay} />}
      <Card className="flex flex-col gap-2">
        <h2 className="font-semibold">{t('subscription.invoices')}</h2>
        <List columns={[
          { key: 'invoice_number', label: t('subscription.invoices'), primary: true, render: v => <Ltr>{v.invoice_number}</Ltr> },
          { key: 'billing_period', label: t('subscription.period'), render: v => <Ltr>{v.billing_period}</Ltr> },
          { key: 'modules', label: t('subscription.module'), render: v => v.lines.map(l => name(l.module_key)).join(', ') },
          { key: 'discount', label: t('subscription.discount'), render: v => <Ltr>{fmtMoney(v.discount, locale)}</Ltr> },
          { key: 'total', label: t('subscription.total'), render: v => <Ltr>{fmtMoney(v.total, locale)}</Ltr> },
        ]} rows={invoices.data ?? []} loading={invoices.isPending} error={invoices.isError} onRetry={invoices.refetch}
          empty={<EmptyState title={t('subscription.no_invoices')} />} />
      </Card>
    </div>
  )
}

function Bill({ quote, name, busy, onPay }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  return (
    <Card className="flex flex-col gap-2" data-testid="bill">
      <List columns={[
        { key: 'module_key', label: t('subscription.module'), primary: true, render: l => name(l.module_key) },
        { key: 'billing_cycle', label: t('subscription.cycle'), render: l => t(`subscription.${l.billing_cycle}`) },
        { key: 'period', label: t('subscription.period'), render: l => <Ltr>{fmtDate(l.period_start, locale)} – {fmtDate(l.period_end, locale)}</Ltr> },
        { key: 'days', label: t('subscription.days', { n: '' }).trim(), render: l => t('subscription.days', { n: l.days }) },
        { key: 'amount', label: t('subscription.subtotal'), render: l => <Ltr>{fmtMoney(l.amount, locale)}</Ltr> },
        { key: 'discount', label: t('subscription.discount'), render: l => <Ltr>{fmtMoney(l.discount, locale)}</Ltr> },
      ]} rows={quote.lines.map(l => ({ ...l, id: l.module_key }))} />
      <dl className="grid grid-cols-2 gap-1 text-sm sm:w-80">
        <dt>{t('subscription.subtotal')}</dt><dd><Ltr>{fmtMoney(quote.subtotal, locale)}</Ltr></dd>
        <dt>{t('subscription.discount')}</dt><dd><Ltr>{fmtMoney(quote.discount, locale)}</Ltr></dd>
        <dt>{t('subscription.tax')}</dt><dd><Ltr>{fmtMoney(quote.tax, locale)}</Ltr></dd>
        <dt className="font-semibold">{t('subscription.total')}</dt><dd className="font-semibold" data-testid="bill-total"><Ltr>{fmtMoney(quote.total, locale)}</Ltr></dd>
      </dl>
      <div><Button onClick={onPay} loading={busy} data-action="pay">{t(quote.total === '0.00' ? 'subscription.pay_free' : 'subscription.pay')}</Button></div>
    </Card>
  )
}

function Coupon({ running, onDone }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  if (running) return (
    <Card data-testid="coupon-running"><span className="font-medium"><Ltr>{running.code}</Ltr></span> — {t('subscription.coupon_running', { percent: Number(running.percent), date: fmtDate(running.until, locale) })}</Card>
  )
  const apply = async (e) => {
    e.preventDefault()
    setBusy(true)
    try { await api.post('/subscription/coupon', { code }); setCode(''); useUiStore.getState().addToast(t('common.saved'), 'success'); onDone() }
    catch (err) { useUiStore.getState().addToast(err.response?.data?.message ?? t('subscription.coupon'), 'error') } finally { setBusy(false) }
  }
  return (
    <Card>
      <form onSubmit={apply} className="flex flex-wrap items-end gap-2" data-testid="coupon-form">
        <Input label={t('subscription.coupon_code')} ltr name="code" value={code} onChange={e => setCode(e.target.value)} maxLength={30} />
        <Button type="submit" loading={busy} disabled={!code.trim()}>{t('subscription.apply')}</Button>
      </form>
    </Card>
  )
}
