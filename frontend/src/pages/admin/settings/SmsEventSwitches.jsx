import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../api/axios'
import { useUiStore } from '../../../store/uiStore'
import Card from '../../../components/Card'
import Loader from '../../../components/Loader'
import { ErrorState } from '../../../components/StateViews'
import { Select } from '../../../components/FormField'

// D208 SMSC.3: per event - off (nothing made), auto (sent at once) or manual (waits in the SMS history for Send). Saved per change.
export default function SmsEventSwitches() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['sms', 'events'], queryFn: () => api.get('/admin/settings/sms-events').then(r => r.data.data) })
  if (q.isPending) return <Loader type="skeleton" rows={4} />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  const change = async (key, mode) => {
    try {
      const r = await api.put('/admin/settings/sms-events', { events: { [key]: mode } })
      qc.setQueryData(['sms', 'events'], r.data.data)
      useUiStore.getState().addToast(t('common.saved'))
    } catch { /* the interceptor shows the error */ }
  }
  const modes = ['off', 'auto', 'manual'].map(m => ({ value: m, label: t(`sms.events.modes.${m}`) }))
  return (
    <Card className="flex flex-col gap-3" data-testid="sms-events">
      <h2 className="font-semibold">{t('sms.events.title')}</h2>
      <p className="text-sm text-content-muted">{t('sms.events.hint')}</p>
      <ul className="flex flex-col divide-y divide-line">
        {Object.entries(q.data.events).map(([key, mode]) => (
          <li key={key} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="flex flex-col">
              <span className="font-medium">{t(`sms.events.names.${key}`)}</span>
              {q.data.transactional.includes(key) && <span className="text-xs text-content-muted">{t('sms.events.transactional')}</span>}
            </span>
            <Select aria-label={t(`sms.events.names.${key}`)} value={mode} onChange={e => change(key, e.target.value)} options={modes} name={key} className="sm:w-40" />
          </li>
        ))}
      </ul>
    </Card>
  )
}
