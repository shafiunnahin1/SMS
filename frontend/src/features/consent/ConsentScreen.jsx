import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import api from '../../api/axios'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { ErrorState } from '../../components/StateViews'

// docs/legal/privacy-and-consent.md section 3: the parent's "privacy and consent" screen. Until data_processing is given the portal
// shows only this screen (fees stay reachable). Indicative in R1 - the legal text is a draft for the owner's lawyer.
const OPTIONAL = ['sms', 'photo']

export default function ConsentScreen({ children }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['parent', 'consents'], queryFn: () => api.get('/parent/consents').then(r => r.data.data) })
  const [choice, setChoice] = useState({ data_processing: false, sms: true, photo: false })
  const [saving, setSaving] = useState(false)

  if (q.isPending) return <Card><Loader type="form" fields={3} /></Card>
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  if (!q.data.needs_data_consent) return children

  const save = async () => {
    setSaving(true)
    try {
      for (const type of ['data_processing', ...OPTIONAL]) {
        await api.put(`/parent/consents/${type}`, { status: choice[type] ? 'granted' : 'revoked' })
      }
      await qc.invalidateQueries({ queryKey: ['parent', 'consents'] })
    } catch { /* interceptor toasts */ } finally { setSaving(false) }
  }
  const Row = ({ type, required }) => (
    <label className="flex items-start gap-3 py-2">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-primary)]" checked={choice[type]} onChange={e => setChoice(c => ({ ...c, [type]: e.target.checked }))} data-consent={type} />
      <span><span className="font-medium">{t(`consent.${type}.title`)}</span>{required && <span className="text-red-600"> *</span>}
        <span className="block text-sm text-content-muted">{t(`consent.${type}.body`)}</span></span>
    </label>
  )
  return (
    <Card className="flex flex-col gap-3" data-testid="consent-screen">
      <div className="flex items-center gap-2"><ShieldCheck aria-hidden="true" className="h-6 w-6 text-primary-fg" /><h1 className="text-lg font-semibold">{t('consent.title')}</h1></div>
      <p className="text-sm text-content-muted">{t('consent.intro', { names: q.data.children.map(c => c.name).join(', ') })}</p>
      <div className="flex flex-col divide-y divide-line">
        <Row type="data_processing" required />
        {OPTIONAL.map(type => <Row key={type} type={type} />)}
      </div>
      <Button onClick={save} loading={saving} disabled={!choice.data_processing} data-testid="consent-save">{t('consent.save')}</Button>
      <p className="text-xs text-content-muted">{t('consent.draft_note')}</p>
    </Card>
  )
}
