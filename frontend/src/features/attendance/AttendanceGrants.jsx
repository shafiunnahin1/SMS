import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { UserCheck, X } from 'lucide-react'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useTerms } from '../../hooks/useTerms'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { Select } from '../../components/FormField'
import { ErrorState } from '../../components/StateViews'

// D169 (4) STW.5: the head / admin or the batch's teacher in charge lets a staff member take this batch's attendance, and revokes it.
// The server decides who may manage (the class teacher only for their own batch); a grant is still useless without the staff
// member's attendance key in their selected department.
export default function AttendanceGrants({ batchId }) {
  const { t } = useTranslation()
  const term = useTerms()
  const qc = useQueryClient()
  const key = ['attendance-grants', String(batchId)]
  const q = useQuery({ queryKey: key, queryFn: () => api.get(`/batches/${batchId}/attendance-grants`).then(r => r.data.data) })
  const [userId, setUserId] = useState('')
  const [busy, setBusy] = useState(false)
  const act = async (fn) => {
    setBusy(true)
    try { await fn(); qc.invalidateQueries({ queryKey: key }); useUiStore.getState().addToast(t('common.saved')) }
    catch (e) { const m = e.response?.data?.message; if (m) useUiStore.getState().addToast(m, 'error') } finally { setBusy(false) }
  }
  if (q.isPending) return <Loader type="skeleton" rows={2} />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  const granted = new Set(q.data.grants.map(g => g.user.id))
  const options = q.data.staff.filter(s => !granted.has(s.id)).map(s => ({ value: s.id, label: s.name }))
  return (
    <div className="flex flex-col gap-2" data-testid="attendance-grants">
      <h3 className="inline-flex items-center gap-2 font-semibold"><UserCheck aria-hidden="true" className="h-4 w-4" />{t('attendance.grants.title')}</h3>
      <p className="text-sm text-content-muted">{t('attendance.grants.hint', { unit: term('batch') })}</p>
      {q.data.grants.length === 0 ? <p className="text-sm" data-testid="no-grants">{t('attendance.grants.none')}</p> : (
        <ul className="flex flex-col gap-1">
          {q.data.grants.map(g => (
            <li key={g.id} className="flex items-center justify-between gap-2 rounded-token bg-surface-muted px-3 py-1">
              <span dir="auto">{g.user.name}</span>
              <Button variant="ghost" onClick={() => act(() => api.delete(`/attendance-grants/${g.id}`))} disabled={busy} aria-label={t('attendance.grants.revoke_name', { name: g.user.name })}>
                <X aria-hidden="true" className="h-4 w-4" />{t('attendance.grants.revoke')}</Button>
            </li>
          ))}
        </ul>
      )}
      {options.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <Select label={t('attendance.grants.staff')} placeholder={t('attendance.grants.pick')} options={options} value={userId} onChange={e => setUserId(e.target.value)} className="min-w-48 flex-1" />
          <Button onClick={() => act(async () => { await api.post(`/batches/${batchId}/attendance-grants`, { user_id: Number(userId) }); setUserId('') })} disabled={!userId || busy} data-action="grant">
            {t('attendance.grants.give')}</Button>
        </div>
      )}
    </div>
  )
}
