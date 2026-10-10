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
import Ltr from '../../components/bidi/Ltr'
import StatCard from '../../ui/variants/StatCard'

// Step 5.3 /super-admin/settings (D56/D57): the universal BulkSMSBD API - key (write-only, encrypted), sender ID and the price
// of one SMS part; this month's universal sending. Empty fields fall back to the server's own settings.
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
        <Input label={t('sms.settings.api_key')} ltr type="password" autoComplete="off" value={form.api_key} onChange={e => set('api_key', e.target.value)} error={errors.api_key?.[0]} name="api_key"
          hint={d.api_key_set ? <>{t(d.api_key_source === 'panel' ? 'sms.settings.key_set' : 'super.key_from_server')} <Ltr>{d.api_key_hint}</Ltr></> : t('super.key_none')} />
        <p className="text-xs text-content-muted">{t('super.driver')}: <Ltr>{d.driver}</Ltr></p>
        <div className="flex flex-wrap justify-end gap-2">
          {d.api_key_source === 'panel' && <Button variant="secondary" onClick={() => send({ clear_api_key: true })} disabled={saving}>{t('super.clear_key')}</Button>}
          <Button loading={saving} data-action="save" onClick={() => send({ rate: form.rate, sender_id: form.sender_id || null, api_key: form.api_key || undefined })}>{t('common.save')}</Button>
        </div>
      </Card>
    </div>
  )
}
