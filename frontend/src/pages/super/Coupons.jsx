import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate, fmtMoney, fmtNumber } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import StatusBadge from '../../components/StatusBadge'
import Ltr from '../../components/bidi/Ltr'
import { Input, Select } from '../../components/FormField'
import { EmptyState } from '../../components/StateViews'
import List from '../../ui/variants/List'

const KEY = ['super', 'coupons']
const PRESETS = [1, 3, 6, 12]
const TYPES = ['school', 'college', 'coaching', 'private_batch']

/** today + n months as YYYY-MM-DD (the server checks the date again) */
export const monthsFromToday = (n, from = new Date()) => {
  const d = new Date(from.getFullYear(), from.getMonth() + n, from.getDate())
  if (d.getDate() !== from.getDate()) d.setDate(0)                // 31 Jan + 1 month -> 28/29 Feb, never 3 Mar
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// D187 (6) SUB.3 /super-admin/coupons: create a percent coupon (last day to redeem 1/3/6/12 months or a date; discount months
// 1/3/6/12 or custom; all or chosen modules; optional institution types; total and per-institution uses), pause or reactivate it
export default function Coupons() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const list = useQuery({ queryKey: KEY, queryFn: () => api.get('/super/coupons').then(r => r.data.data) })
  const setStatus = async (c) => {
    try { await api.patch(`/super/coupons/${c.id}/status`, { status: c.status === 'active' ? 'paused' : 'active' }); qc.invalidateQueries({ queryKey: KEY }) }
    catch (e) { useUiStore.getState().addToast(e.response?.data?.message ?? t('subscription.payment.failed'), 'error') }
  }
  const cols = [
    { key: 'code', label: t('subscription.coupon_code'), primary: true, render: c => <Ltr>{c.code}</Ltr> },
    { key: 'percent', label: t('subscription.percent'), render: c => <Ltr>{fmtNumber(Number(c.percent), locale)}%</Ltr> },
    { key: 'valid_until', label: t('subscription.redeem_until'), render: c => (c.valid_until ? fmtDate(c.valid_until, locale) : '—') },
    { key: 'discount_months', label: t('subscription.discount_months'), render: c => t('subscription.months', { n: c.discount_months }) },
    { key: 'covers', label: t('subscription.covers'), render: c => (c.applies_to_modules?.length ? c.applies_to_modules.map(k => t(`subscription.module_names.${k}`, { defaultValue: k })).join(', ') : t('subscription.all_modules')) },
    { key: 'used', label: t('subscription.used'), render: c => <Ltr>{fmtNumber(c.redeemed_count, locale)}{c.max_redemptions ? ` / ${fmtNumber(c.max_redemptions, locale)}` : ''}</Ltr> },
    { key: 'given', label: t('subscription.given'), render: c => <Ltr>{fmtMoney(c.discount_given, locale)}</Ltr> },
    { key: 'status', label: t('subscription.state'), render: c => <StatusBadge status={c.status} /> },
    { key: 'actions', label: t('common.actions'), action: true, render: c => <Button variant="secondary" onClick={() => setStatus(c)} data-coupon={c.code}>{t(c.status === 'active' ? 'subscription.pause' : 'subscription.activate')}</Button> },
  ]
  return (
    <div className="flex flex-col gap-4" data-testid="coupons">
      <PageHeader title={t('subscription.coupons_title')} />
      <NewCoupon onDone={() => qc.invalidateQueries({ queryKey: KEY })} />
      <Card><List columns={cols} rows={list.data ?? []} loading={list.isPending} error={list.isError} onRetry={list.refetch} empty={<EmptyState title={t('subscription.no_coupons')} />} /></Card>
    </div>
  )
}

function NewCoupon({ onDone }) {
  const { t } = useTranslation()
  const prices = useQuery({ queryKey: ['super', 'module-prices'], queryFn: () => api.get('/super/module-prices').then(r => r.data.data) })
  const blank = { code: '', value: '', until: '3', untilDate: '', months: '3', monthsCustom: '', allModules: true, modules: [], types: [], max: '', per: '1', note: '' }
  const [f, setF] = useState(blank)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }))
  const flip = (k, v) => setF(p => ({ ...p, [k]: p[k].includes(v) ? p[k].filter(x => x !== v) : [...p[k], v] }))
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setErrors({})
    try {
      await api.post('/super/coupons', {
        code: f.code.trim(), value: f.value,
        valid_until: f.until === 'custom' ? f.untilDate : monthsFromToday(Number(f.until)),
        discount_months: Number(f.months === 'custom' ? f.monthsCustom : f.months),
        applies_to_modules: f.allModules ? null : f.modules, applies_to_types: f.types.length ? f.types : null,
        max_redemptions: f.max === '' ? null : Number(f.max), per_institution_limit: Number(f.per || 1), note: f.note || null,
      })
      useUiStore.getState().addToast(t('common.saved'), 'success')
      setF(blank); onDone()
    } catch (err) { setErrors(Object.fromEntries(Object.entries(err.response?.data?.errors ?? {}).map(([k, m]) => [k, m[0]]))) } finally { setBusy(false) }
  }
  const presetOptions = [...PRESETS.map(n => ({ value: String(n), label: t('subscription.months', { n }) })), { value: 'custom', label: t('subscription.custom') }]
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-semibold">{t('subscription.new_coupon')}</h2>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3" noValidate data-testid="coupon-new">
        <Input label={t('subscription.coupon_code')} ltr name="code" value={f.code} onChange={set('code')} maxLength={30} error={errors.code} />
        <Input label={t('subscription.percent')} ltr inputMode="decimal" name="value" value={f.value} onChange={set('value')} error={errors.value} />
        <div className="flex flex-col gap-2">
          <Select label={t('subscription.redeem_until')} name="until" value={f.until} onChange={set('until')} options={presetOptions} error={errors.valid_until} />
          {f.until === 'custom' && <Input aria-label={t('subscription.redeem_until')} type="date" ltr name="untilDate" value={f.untilDate} onChange={set('untilDate')} />}
        </div>
        <div className="flex flex-col gap-2">
          <Select label={t('subscription.discount_months')} name="months" value={f.months} onChange={set('months')} options={presetOptions} error={errors.discount_months} />
          {f.months === 'custom' && <Input aria-label={t('subscription.discount_months')} ltr inputMode="numeric" name="monthsCustom" value={f.monthsCustom} onChange={set('monthsCustom')} />}
        </div>
        <Input label={t('subscription.max_redemptions')} hint={t('subscription.unlimited')} ltr inputMode="numeric" name="max" value={f.max} onChange={set('max')} error={errors.max_redemptions} />
        <Input label={t('subscription.per_institution')} ltr inputMode="numeric" name="per" value={f.per} onChange={set('per')} error={errors.per_institution_limit} />
        <fieldset className="flex flex-col gap-1 sm:col-span-3">
          <legend className="text-sm font-medium">{t('subscription.covers')}</legend>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="allModules" checked={f.allModules} onChange={e => setF(p => ({ ...p, allModules: e.target.checked }))} />{t('subscription.all_modules')}</label>
          {!f.allModules && (
            <div className="grid gap-1 sm:grid-cols-3" data-testid="coupon-modules">
              {(prices.data ?? []).map(r => (
                <label key={r.module_key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" value={r.module_key} checked={f.modules.includes(r.module_key)} onChange={() => flip('modules', r.module_key)} />
                  {t(`subscription.module_names.${r.module_key}`, { defaultValue: r.module_key })}
                </label>))}
            </div>)}
        </fieldset>
        <fieldset className="flex flex-wrap gap-3 sm:col-span-3">
          <legend className="text-sm font-medium">{t('subscription.types')}</legend>
          {TYPES.map(ty => (
            <label key={ty} className="flex items-center gap-2 text-sm"><input type="checkbox" value={ty} checked={f.types.includes(ty)} onChange={() => flip('types', ty)} />{t(`dashboard.types.${ty}`, { defaultValue: ty })}</label>))}
        </fieldset>
        <Input label={t('subscription.note')} name="note" value={f.note} onChange={set('note')} maxLength={255} className="sm:col-span-2" />
        <div className="flex items-end"><Button type="submit" loading={busy}>{t('subscription.create')}</Button></div>
      </form>
    </Card>
  )
}
