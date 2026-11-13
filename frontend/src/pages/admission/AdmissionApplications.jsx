import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtMoney } from '../../i18n/format'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import StatusBadge from '../../components/StatusBadge'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Select } from '../../components/FormField'
import { useCrud } from '../../features/academic/useCrud'
import { useTerms } from '../../hooks/useTerms'

// D209 ACY.2: one cycle's applications, oldest first, with paid / unpaid. While the cycle is open the admin or the accountant
// takes the fee in cash (the server sets the amount, an APP- receipt); the admin can reverse a payment (a new negative row).
export default function AdmissionApplications({ cycleId, isAdmin, mode, programId }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admission', 'applications', cycleId], queryFn: () => api.get(`/admission/cycles/${cycleId}/applications`).then(r => r.data) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admission', 'applications', cycleId] })
  // D209 ACY.3: marks for a merit cycle while it is in `testing` (admin)
  const [marks, setMarks] = useState({})
  const [saving, setSaving] = useState(false)
  // ACY.4: confirm / decline / admit for the listing cycle (admin); admit picks the batch the student joins
  const term = useTerms()
  const batches = useCrud('batches').list
  const [admitting, setAdmitting] = useState(null)   // {id, batch_id}
  const act = async (fn, done) => { try { await fn(); done?.() } catch { /* the interceptor shows the error */ } finally { refresh() } }
  useEffect(() => { if (q.data) setMarks(Object.fromEntries(q.data.data.filter(l => l.test_roll).map(l => [l.application_no, l.test_marks ?? '']))) }, [q.data])
  if (q.isPending) return <Loader type="skeleton" rows={4} />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  const { data: rows, meta } = q.data
  const canTake = meta.status === 'open' && Number(meta.application_fee) > 0 && meta.methods.includes('cash')
  const marking = isAdmin && mode === 'merit' && meta.status === 'testing'
  const saveMarks = async () => {
    setSaving(true)
    try {
      await api.post(`/admission/cycles/${cycleId}/test-marks`, { rows: Object.entries(marks).map(([no, m]) => ({ application_no: no, marks: m === '' ? null : m })) })
      useUiStore.getState().addToast(t('common.saved'))
    } catch { /* the interceptor shows the error */ } finally { setSaving(false); refresh() }
  }

  const collect = (l) => useUiStore.getState().openConfirm({ title: t('admission.collect'), description: t('admission.collect_confirm', { amount: fmtMoney(meta.application_fee, locale), name: l.name }),
    onConfirm: async () => {
      try {
        const r = await api.post(`/admission/leads/${l.id}/payments`)
        useUiStore.getState().addToast(t('admission.receipt', { no: r.data.data.receipt_no }))
      } catch { /* the interceptor shows the error */ } finally { refresh() }
    } })
  const reverse = async (l) => {
    const reason = window.prompt(t('admission.reverse_reason'))
    if (!reason) return
    try {
      const pays = (await api.get(`/admission/leads/${l.id}/payments`)).data.data
      const last = [...pays].reverse().find(p => Number(p.amount) > 0)
      if (last) await api.post(`/admission/lead-payments/${last.id}/reverse`, { reason })
    } catch { /* the interceptor shows the error */ } finally { refresh() }
  }

  if (!rows.length) return <EmptyState title={t('admission.no_applications')} />
  return (
    <div className="flex flex-col gap-2">
    <ul className="flex flex-col divide-y divide-line" data-testid="applications">
      {rows.map(l => (
        <li key={l.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-col">
            <span className="font-medium">{l.name} <span className="text-xs text-content-muted"><Ltr>{l.application_no}</Ltr></span></span>
            <span className="text-xs text-content-muted"><Ltr>{l.phone}</Ltr>{l.test_roll ? ` · ${t('admission.roll')} ${l.test_roll}` : ''}</span>
          </span>
          <span className="inline-flex items-center gap-2">
            {marking && l.test_roll && <input aria-label={t('admission.marks_of', { no: l.application_no })} inputMode="decimal" dir="ltr" name={`marks-${l.application_no}`}
              className="w-20 h-10 rounded-token px-2 bg-surface text-content [border:1px_solid_var(--line)]" value={marks[l.application_no] ?? ''}
              onChange={e => setMarks(m => ({ ...m, [l.application_no]: e.target.value }))} />}
            {l.list_status && <StatusBadge status={`list_${l.list_status}`} />}
            {Number(meta.application_fee) > 0 && <StatusBadge status={l.paid ? 'paid' : 'due'} />}
            {canTake && !l.paid && <Button onClick={() => collect(l)} data-action="collect">{t('admission.collect')}</Button>}
            {isAdmin && meta.status === 'listing' && l.list_status === 'selected' && <>
              <Button variant="secondary" onClick={() => act(() => api.post(`/admission/leads/${l.id}/confirm`))} data-action="confirm">{t('admission.confirm')}</Button>
              <Button onClick={() => setAdmitting({ id: l.id, batch_id: '' })} data-action="admit">{t('admission.admit')}</Button>
            </>}
            {isAdmin && meta.status === 'listing' && ['selected', 'waiting'].includes(l.list_status) && <Button variant="ghost" data-action="decline"
              onClick={() => useUiStore.getState().openConfirm({ title: t('admission.decline'), description: t('admission.decline_confirm'), type: 'danger', onConfirm: () => act(() => api.post(`/admission/leads/${l.id}/decline`)) })}>{t('admission.decline')}</Button>}
            {isAdmin && meta.status === 'open' && Number(l.paid_amount) > 0 && <Button variant="secondary" onClick={() => reverse(l)} data-action="reverse">{t('admission.reverse')}</Button>}
          </span>
        </li>
      ))}
    </ul>
    {admitting && (
      <div className="flex flex-wrap items-end gap-2" data-testid="admit">
        <Select label={term('batch')} placeholder="—" value={admitting.batch_id} onChange={e => setAdmitting(a => ({ ...a, batch_id: e.target.value }))} name="batch_id"
          options={(batches.data ?? []).filter(b => !programId || String(b.program_id ?? b.program?.id) === String(programId)).map(b => ({ value: String(b.id), label: b.name }))} />
        <Button onClick={() => act(() => api.post(`/admission/leads/${admitting.id}/admit`, admitting.batch_id ? { batch_ids: [Number(admitting.batch_id)] } : {}), () => setAdmitting(null))} data-action="admit-confirm">{t('admission.admit')}</Button>
        <Button variant="secondary" onClick={() => setAdmitting(null)}>{t('common.cancel')}</Button>
      </div>
    )}
    {marking && <div><Button onClick={saveMarks} loading={saving} data-action="save-marks">{t('admission.save_marks')}</Button></div>}
    </div>
  )
}
