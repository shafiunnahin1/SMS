import { useEffect, useState } from 'react'
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
import { ErrorState } from '../../components/StateViews'
import { Input } from '../../components/FormField'
import { secretInputProps } from '../../components/secretInput'
import Ltr from '../../components/bidi/Ltr'
import StatCard from '../../ui/variants/StatCard'
import StatusBadge from '../../components/StatusBadge'

// Step 5.3 /super-admin/settings (D56/D57): the universal BulkSMSBD API - key (write-only, encrypted), sender ID and the price
// of one SMS part; this month's universal sending. Empty fields fall back to the server's own settings.
// The owner (2026-10-10): the platform's bKash merchant for SMS-wallet recharge (D58) is set here too - write-only secrets.
export default function PlatformSettings() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['super', 'sms-settings'], queryFn: () => api.get('/super/sms-settings').then(r => r.data.data) })
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (q.data) setForm({ rate: q.data.rate, sender_id: q.data.sender_id ?? '', api_key: '' }) }, [q.data])
  if (q.isPending || !form) return q.isError ? <ErrorState onRetry={q.refetch} /> : <Loader type="page" />
  const d = q.data
  const send = async (body) => {
    setSaving(true); setErrors({})
    try {
      const r = await api.put('/super/sms-settings', body)
      qc.setQueryData(['super', 'sms-settings'], r.data.data)
      useUiStore.getState().addToast(t('common.saved'))
    } catch (e) { if (e.response?.data?.errors) setErrors(e.response.data.errors) } finally { setSaving(false) }
  }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  return (
    <div className="flex flex-col gap-4" data-testid="platform-settings">
      <PageHeader title={t('super.settings')} />
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('sms.rate')} value={fmtMoney(d.rate, locale)} />
        <StatCard label={t('super.sent_universal')} value={fmtNumber(d.sent_this_month, locale)} />
        <StatCard label={t('super.charged_universal')} value={fmtMoney(d.charged_this_month, locale)} />
        <StatCard label={t('super.sender')} value={d.effective_sender ?? '—'} />
      </div>
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">{t('super.universal_api')}</h2>
        <p className="text-sm text-content-muted">{t('super.universal_hint')}</p>
        <Input label={t('super.rate_label')} ltr inputMode="decimal" value={form.rate} onChange={e => set('rate', e.target.value)} error={errors.rate?.[0]} name="rate" hint={t('super.rate_hint')} />
        <Input label={t('sms.settings.sender_id')} ltr maxLength={20} value={form.sender_id} onChange={e => set('sender_id', e.target.value)} error={errors.sender_id?.[0]} name="sender_id" />
        <Input label={t('sms.settings.api_key')} ltr {...secretInputProps} value={form.api_key} onChange={e => set('api_key', e.target.value)} error={errors.api_key?.[0]} name="api_key"
          hint={d.api_key_set ? <>{t(d.api_key_source === 'panel' ? 'sms.settings.key_set' : 'super.key_from_server')} <Ltr>{d.api_key_hint}</Ltr></> : t('super.key_none')} />
        <p className="text-xs text-content-muted">{t('super.driver')}: <Ltr>{d.driver}</Ltr></p>
        <div className="flex flex-wrap justify-end gap-2">
          {d.api_key_source === 'panel' && <Button variant="secondary" onClick={() => send({ clear_api_key: true })} disabled={saving}>{t('super.clear_key')}</Button>}
          <Button loading={saving} data-action="save" onClick={() => send({ rate: form.rate, sender_id: form.sender_id || null, api_key: form.api_key || undefined })}>{t('common.save')}</Button>
        </div>
      </Card>
      <BkashCard d={d.bkash} onSaved={(data) => qc.setQueryData(['super', 'sms-settings'], data)} />
    </div>
  )
}

const BKASH_SECRETS = ['app_key', 'app_secret', 'username', 'password']

function BkashCard({ d, onSaved }) {
  const { t } = useTranslation()
  const empty = { base_url: d.base_url ?? '', sandbox: d.sandbox, app_key: '', app_secret: '', username: '', password: '' }
  const [f, setF] = useState(empty)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(null)
  const [test, setTest] = useState(null)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const send = async (body, kind) => {
    setBusy(kind); setErrors({}); setTest(null)
    try {
      const r = await api.put('/super/sms-settings', body)
      onSaved(r.data.data)
      if (kind === 'test') setTest({ ok: Boolean(r.data.data.bkash.test_ok), error: r.data.data.bkash.test_error })
      else { useUiStore.getState().addToast(t('common.saved')); setF(x => ({ ...x, app_key: '', app_secret: '', username: '', password: '' })) }
    } catch (e) {
      const errs = e.response?.data?.errors ?? {}
      setErrors(Object.fromEntries(Object.entries(errs).map(([k, v]) => [k.replace('bkash.', ''), v])))
    } finally { setBusy(null) }
  }
  const save = () => send({ bkash: { base_url: f.base_url || null, sandbox: f.sandbox, ...Object.fromEntries(BKASH_SECRETS.filter(k => f[k]).map(k => [k, f[k]])) } }, 'save')
  const hint = (k) => d[k].set ? <>{t(d[k].source === 'panel' ? 'sms.settings.key_set' : 'super.key_from_server')} <Ltr>{d[k].hint}</Ltr></> : t('super.bkash.not_set')
  return (
    <Card className="flex flex-col gap-3" data-testid="bkash-settings">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">{t('super.bkash.title')}</h2>
        <StatusBadge status={d.configured ? 'active' : 'inactive'} />
      </div>
      <p className="text-sm text-content-muted">{t('super.bkash.hint')}</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.sandbox} onChange={e => set('sandbox', e.target.checked)} name="sandbox" className="h-4 w-4 accent-[var(--color-primary)]" />
        {t('super.bkash.sandbox')}
      </label>
      <Input label={t('super.bkash.base_url')} ltr autoComplete="off" spellCheck={false} data-lpignore="true" value={f.base_url} onChange={e => set('base_url', e.target.value)} error={errors.base_url?.[0]} name="base_url" hint={t('super.bkash.base_url_hint')} />
      <div className="grid gap-3 sm:grid-cols-2">
        {BKASH_SECRETS.map(k => (
          <Input key={k} label={t(`super.bkash.${k}`)} ltr {...secretInputProps} value={f[k]} onChange={e => set(k, e.target.value)} error={errors[k]?.[0]} name={`bkash_${k}`} hint={hint(k)} />
        ))}
      </div>
      {test !== null && <div className="text-sm" data-testid="bkash-test" role="status">
        <p>{t(test.ok ? 'super.bkash.test_ok' : 'super.bkash.test_failed')}</p>
        {!test.ok && test.error && <p className="text-xs text-content-muted mt-1" data-testid="bkash-test-error"><Ltr>{test.error}</Ltr></p>}
      </div>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={() => send({ bkash_test: true }, 'test')} loading={busy === 'test'} disabled={!d.configured || busy !== null} data-action="bkash-test">{t('super.bkash.test')}</Button>
        <Button onClick={save} loading={busy === 'save'} disabled={busy !== null} data-action="bkash-save">{t('common.save')}</Button>
      </div>
    </Card>
  )
}
