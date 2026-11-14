import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input } from '../../components/FormField'

// D217 OPAY.3 /admin/settings/payments: the gateways the registry offers here, each with its form (built from credential_fields),
// "switch on" (the admin's password; then a connection test makes it active) and "switch off". No real provider exists yet.
export default function PaymentSettings() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['settings', 'payments'], queryFn: () => api.get('/admin/settings/payments').then(r => r.data.data) })
  const [forms, setForms] = useState({})
  const [busy, setBusy] = useState(false)
  if (q.isPending) return <Loader type="page" />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  const refresh = () => qc.invalidateQueries({ queryKey: ['settings', 'payments'] })
  const rowOf = (key) => q.data.gateways.find(g => g.gateway === key)
  const form = (key) => forms[key] ?? { password: '', credentials: {} }
  const setForm = (key, patch) => setForms({ ...forms, [key]: { ...form(key), ...patch } })
  const on = async (g) => {
    setBusy(true)
    try {
      await api.put(`/admin/settings/payments/gateways/${g.key}`, { password: form(g.key).password, credentials: form(g.key).credentials })
      await api.post(`/admin/settings/payments/gateways/${g.key}/test`)
      useUiStore.getState().addToast(t('opay.switched_on'))
      setForms({ ...forms, [g.key]: undefined })
    } catch { /* the interceptor shows the error */ } finally { setBusy(false); refresh() }
  }
  const off = (g) => useUiStore.getState().openConfirm({ title: t('opay.switch_off'), description: t('opay.switch_off_confirm'),
    onConfirm: async () => { try { await api.delete(`/admin/settings/payments/gateways/${g.key}`) } catch { /* the interceptor shows the error */ } finally { refresh() } } })
  return (
    <div className="flex flex-col gap-4" data-testid="payment-settings">
      <PageHeader title={t('opay.settings_title')} />
      <p className="text-sm text-content-muted">{t('opay.no_real_gateway')}</p>
      {!q.data.available_gateways.length ? <Card><EmptyState title={t('opay.no_gateway')} /></Card> : q.data.available_gateways.map(g => {
        const row = rowOf(g.key)
        const active = row?.status === 'active'
        return (
          <Card key={g.key} className="flex flex-col gap-3 sm:max-w-xl" data-gateway={g.key}>
            <h2 className="font-semibold">{g.label[locale] ?? g.label.bn}</h2>
            <p className="text-sm" data-testid={`state-${g.key}`}>{t(`opay.gateway_states.${row?.status ?? 'none'}`)}{row?.last_error ? ` · ${row.last_error}` : ''}</p>
            {active ? <div><Button variant="ghost" onClick={() => off(g)} data-action="off">{t('opay.switch_off')}</Button></div> : (
              <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); on(g) }}>
                {g.credential_fields.map(fd => (
                  <Input key={fd.key} name={`cred-${fd.key}`} type={fd.secret ? 'password' : 'text'} autoComplete="off" label={fd.label[locale] ?? fd.label.bn} required maxLength={255}
                    value={form(g.key).credentials[fd.key] ?? ''} onChange={(e) => setForm(g.key, { credentials: { ...form(g.key).credentials, [fd.key]: e.target.value } })} />
                ))}
                <Input name={`password-${g.key}`} type="password" autoComplete="current-password" label={t('opay.your_password')} hint={t('opay.password_hint')} required
                  value={form(g.key).password} onChange={(e) => setForm(g.key, { password: e.target.value })} />
                <div><Button type="submit" disabled={busy} data-action="on">{t('opay.switch_on')}</Button></div>
              </form>
            )}
          </Card>
        )
      })}
    </div>
  )
}
