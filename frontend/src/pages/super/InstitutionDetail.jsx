import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate, fmtMoney, fmtNumber } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import StatusBadge from '../../components/StatusBadge'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'
import Ltr from '../../components/bidi/Ltr'
import StatCard from '../../ui/variants/StatCard'
import { TYPES } from './Institutions'

// Step 5.3 /super-admin/institutions/:id: numbers, suspend / activate, type, module overrides (default / on / off - the tenant's
// menu follows at once), and the SMS wallet: add or correct money by hand (D58) with its ledger.
export default function InstitutionDetail() {
  const { id } = useParams()
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['super', 'institution', id], queryFn: () => api.get(`/super/institutions/${id}`).then(r => r.data.data) })
  const [busy, setBusy] = useState(false)
  if (q.isPending) return <Loader type="page" />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  const d = q.data
  const apply = (r) => { qc.setQueryData(['super', 'institution', id], r.data.data); qc.invalidateQueries({ queryKey: ['super', 'institutions'] }); useUiStore.getState().addToast(t('common.saved')) }
  const call = async (fn) => {
    setBusy(true)
    try { apply(await fn()) } catch (e) { const m = e.response?.data?.message; if (m) useUiStore.getState().addToast(m, 'error') } finally { setBusy(false) }
  }
  const toggle = () => useUiStore.getState().openConfirm({
    title: t(d.status === 'suspended' ? 'super.activate' : 'super.suspend'), description: t(d.status === 'suspended' ? 'super.activate_hint' : 'super.suspend_hint'),
    type: d.status === 'suspended' ? undefined : 'danger', onConfirm: () => call(() => api.patch(`/super/institutions/${id}/toggle`)),
  })
  const setModule = (key, value) => call(() => api.put(`/super/institutions/${id}`, { modules: { [key]: value === '' ? null : value === 'on' } }))

  return (
    <div className="flex flex-col gap-4" data-testid="institution-detail">
      <PageHeader title={<span dir="auto">{d.name}</span>} actions={
        <Button variant={d.status === 'suspended' ? 'primary' : 'danger'} onClick={toggle} loading={busy} data-action="toggle">{t(d.status === 'suspended' ? 'super.activate' : 'super.suspend')}</Button>} />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge status={d.status} /><Ltr>{d.host}</Ltr><span>{t(`dashboard.types.${d.institution_type}`)}</span>
      </div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('dashboard.students')} value={fmtNumber(d.students, locale)} />
        <StatCard label={t('dashboard.teachers')} value={fmtNumber(d.teachers, locale)} />
        <StatCard label={t('sms.balance')} value={fmtMoney(d.sms.balance, locale)} />
        <StatCard label={t('super.sms_route')} value={t(d.sms.own_enabled ? 'super.route_own' : d.sms.universal_enabled ? 'super.route_universal' : 'super.route_off')} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">{t('super.profile')}</h2>
          <Select label={t('super.type')} value={d.institution_type} disabled={busy} onChange={e => call(() => api.put(`/super/institutions/${id}`, { institution_type: e.target.value }))}
            options={TYPES.map(s => ({ value: s, label: t(`dashboard.types.${s}`) }))} />
          <h3 className="font-medium">{t('super.admins')}</h3>
          {!d.admins.length ? <EmptyState /> : (
            <ul className="flex flex-col divide-y divide-line text-sm">
              {d.admins.map(a => <li key={a.id} className="h-row flex items-center justify-between gap-2"><span dir="auto">{a.name}</span><Ltr>{a.phone ?? a.email}</Ltr></li>)}
            </ul>
          )}
        </Card>
        <Card className="flex flex-col gap-2" data-testid="modules">
          <h2 className="font-semibold">{t('super.modules')}</h2>
          <p className="text-sm text-content-muted">{t('super.modules_hint')}</p>
          <ul className="flex flex-col divide-y divide-line">
            {d.modules.map(m => (
              <li key={m.key} className="flex items-center justify-between gap-2 py-1 text-sm">
                <span>{t(`super.module_names.${m.key}`, { defaultValue: m.key })} <StatusBadge status={m.enabled ? 'active' : 'inactive'} /></span>
                <Select aria-label={t(`super.module_names.${m.key}`, { defaultValue: m.key })} className="w-40" disabled={busy} data-module={m.key}
                  value={m.override === null ? '' : m.override ? 'on' : 'off'} onChange={e => setModule(m.key, e.target.value)}
                  options={[{ value: '', label: t(m.in_type ? 'super.default_on' : 'super.default_off') }, { value: 'on', label: t('super.force_on') }, { value: 'off', label: t('super.force_off') }]} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Wallet d={d} onDone={apply} />
    </div>
  )
}

function Wallet({ d, onDone }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const [v, setV] = useState({ amount: '', note: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true); setErrors({})
    try {
      await api.post(`/super/institutions/${d.id}/sms-credits`, v)
      setV({ amount: '', note: '' })
      onDone({ data: await api.get(`/super/institutions/${d.id}`).then(r => r.data) })
      qc.invalidateQueries({ queryKey: ['super', 'institutions'] })
    } catch (e) {
      const r = e.response?.data
      if (r?.errors) setErrors(r.errors); else if (r?.message) useUiStore.getState().addToast(r.message, 'error')
    } finally { setSaving(false) }
  }
  return (
    <Card className="flex flex-col gap-3" data-testid="wallet">
      <h2 className="font-semibold">{t('super.wallet')}</h2>
      <div className="grid gap-3 sm:grid-cols-3 items-end">
        <Input label={t('super.amount')} ltr inputMode="decimal" hint={t('super.amount_hint')} value={v.amount} onChange={e => setV(x => ({ ...x, amount: e.target.value }))} error={errors.amount?.[0]} name="amount" />
        <Input label={t('super.note')} value={v.note} onChange={e => setV(x => ({ ...x, note: e.target.value }))} error={errors.note?.[0]} name="note" />
        <Button onClick={save} loading={saving} data-action="adjust">{t('super.adjust')}</Button>
      </div>
      {!d.sms.transactions.length ? <EmptyState title={t('sms.no_ledger')} /> : (
        <ul className="flex flex-col divide-y divide-line text-sm">
          {d.sms.transactions.map(r => (
            <li key={r.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
              <span>{t(`sms.types.${r.type}`, { defaultValue: r.type })} <span className="text-content-muted" dir="auto">{r.reference}</span></span>
              <span className="text-content-muted">{fmtDate(r.created_at, locale)}</span>
              <Ltr>{fmtMoney(r.amount, locale)} → {fmtMoney(r.balance_after, locale)}</Ltr>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
