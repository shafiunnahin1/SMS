import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../api/axios'
import { useUiStore } from '../../../store/uiStore'
import { useLocale } from '../../../ui/I18nProvider'
import { fmtMoney } from '../../../i18n/format'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import Loader from '../../../components/Loader'
import { ErrorState } from '../../../components/StateViews'
import { Input } from '../../../components/FormField'
import Ltr from '../../../components/bidi/Ltr'

// D59 /admin/settings/sms: two switches (the universal API, charged from the SMS wallet; the institution's own BulkSMSBD API,
// never charged) and the own key + masking sender. The key is write-only - the server only says whether one is set (last 4).
export default function SmsSettings() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['sms', 'sender'], queryFn: () => api.get('/admin/settings/sms-sender').then(r => r.data.data) })
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  useEffect(() => { if (q.data) setForm({ universal_enabled: q.data.universal_enabled, own_enabled: q.data.own_enabled, sender_id: q.data.sender_id ?? '', api_key: '' }) }, [q.data])

  if (q.isPending || !form) return q.isError ? <ErrorState onRetry={q.refetch} /> : <Loader type="page" />
  const d = q.data
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const done = (r) => { qc.setQueryData(['sms', 'sender'], r.data.data); useUiStore.getState().addToast(t('common.saved')) }

  const save = async () => {
    setSaving(true); setErrors({})
    try {
      done(await api.put('/admin/settings/sms-sender', { ...form, sender_id: form.sender_id || null, api_key: form.api_key || undefined }))
    } catch (e) {
      const r = e.response?.data
      if (r?.errors) setErrors(r.errors)
      else if (r?.message) useUiStore.getState().addToast(r.message, 'error')
    } finally { setSaving(false) }
  }
  const remove = () => useUiStore.getState().openConfirm({ title: t('sms.settings.remove'), description: t('sms.settings.remove_confirm'), type: 'danger',
    onConfirm: async () => done(await api.delete('/admin/settings/sms-sender')) })

  const toggle = (k, label, hint) => (
    <label className="flex items-start gap-3 py-2">
      <input type="checkbox" role="switch" checked={form[k]} onChange={e => set(k, e.target.checked)} data-field={k} className="mt-1 h-4 w-4 accent-[var(--color-primary)]" />
      <span className="flex flex-col"><span className="font-medium">{label}</span><span className="text-sm text-content-muted">{hint}</span></span>
    </label>
  )

  return (
    <div className="flex flex-col gap-4" data-testid="sms-settings">
      <PageHeader title={t('sms.settings.title')} />
      <Card>
        <p className="text-sm" data-testid="sms-effective">{t('sms.settings.effective')}: <strong>{t(`sms.settings.routes.${d.effective}`)}</strong></p>
      </Card>
      <Card className="flex flex-col divide-y divide-line">
        {toggle('universal_enabled', t('sms.settings.universal'), t('sms.settings.universal_hint', { sender: d.universal_sender || '—', rate: fmtMoney(d.rate, locale) }))}
        {toggle('own_enabled', t('sms.settings.own'), t('sms.settings.own_hint'))}
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">{t('sms.settings.own_api')}</h2>
        <Input label={t('sms.settings.sender_id')} ltr maxLength={20} value={form.sender_id} onChange={e => set('sender_id', e.target.value)} error={errors.sender_id?.[0]} name="sender_id" />
        <Input label={t('sms.settings.api_key')} ltr type="password" autoComplete="off" value={form.api_key} onChange={e => set('api_key', e.target.value)} error={errors.api_key?.[0]} name="api_key"
          hint={d.api_key_set ? <>{t('sms.settings.key_set')} <Ltr>{d.api_key_hint}</Ltr></> : t('sms.settings.key_none')} />
        <div className="flex flex-wrap justify-end gap-2">
          {(d.api_key_set || d.sender_id) && <Button variant="secondary" onClick={remove} data-action="remove">{t('sms.settings.remove')}</Button>}
          <Button onClick={save} loading={saving} data-action="save">{t('common.save')}</Button>
        </div>
      </Card>
    </div>
  )
}
