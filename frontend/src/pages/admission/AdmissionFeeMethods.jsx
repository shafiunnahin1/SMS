import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { ErrorState } from '../../components/StateViews'

const METHODS = ['cash', 'online']

// D209 ACY.2: how this institution takes the application fee - cash at the office and/or online (online is saved now and works
// once a payment gateway is set up). At least one stays on.
export default function AdmissionFeeMethods() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admission', 'fee-methods'], queryFn: () => api.get('/admission/fee-methods').then(r => r.data.data) })
  const [chosen, setChosen] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (q.data) setChosen(q.data.methods) }, [q.data])
  if (q.isPending || !chosen) return q.isError ? <ErrorState onRetry={q.refetch} /> : <Loader type="skeleton" rows={2} />
  const toggle = (m) => setChosen(c => c.includes(m) ? c.filter(x => x !== m) : [...c, m])
  const save = async () => {
    setBusy(true)
    try {
      const r = await api.put('/admission/fee-methods', { methods: chosen })
      qc.setQueryData(['admission', 'fee-methods'], r.data.data)
      useUiStore.getState().addToast(t('common.saved'))
    } catch { /* the interceptor shows the error */ } finally { setBusy(false) }
  }
  return (
    <Card className="flex flex-col gap-2" data-testid="fee-methods">
      <h2 className="font-semibold">{t('admission.fee_methods')}</h2>
      {METHODS.map(m => (
        <label key={m} className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-primary)]" checked={chosen.includes(m)} onChange={() => toggle(m)} name={`method-${m}`} />
          <span>{t(`admission.methods.${m}`)}{m === 'online' && !q.data.online_available && <span className="text-content-muted"> — {t('admission.online_soon')}</span>}</span>
        </label>
      ))}
      <div><Button onClick={save} loading={busy} disabled={!chosen.length} data-action="save-methods">{t('common.save')}</Button></div>
    </Card>
  )
}
