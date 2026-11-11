import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { Input, Select } from '../../components/FormField'
import { useUiStore } from '../../store/uiStore'
import Ltr from '../../components/bidi/Ltr'

const newKey = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

// D200 SUBL.4/5: every slot action carries a fresh Idempotency-Key and the version + source digest the list was read with;
// a stale list is answered 409 and the caller reloads.
export const slotAction = (method, slot, suffix, body = {}) => api.request({
  method, url: `/hr/leaves/${slot.leave_id}/substitution-slots/${slot.id}/${suffix}`, headers: { 'Idempotency-Key': newKey() },
  data: { ...body, expected_versions: { slot: String(slot.version), source: slot.source } },
})

// One cover slot with the actions of the viewer: `admin` (offer / clear / reopen), `applicant` (nominate / clear), `target` (accept / decline)
export default function SlotCard({ slot, as, onDone }) {
  const { t } = useTranslation()
  const [pick, setPick] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const canPick = (as === 'admin' && ['unassigned', 'offered', 'confirmed'].includes(slot.status)) || (as === 'applicant' && ['unassigned', 'nominated'].includes(slot.status))
  const candidates = useQuery({ queryKey: ['cover-candidates', slot.id, slot.version], enabled: canPick,
    queryFn: () => api.get(`/hr/leaves/${slot.leave_id}/substitution-slots/${slot.id}/candidates`).then(r => r.data.data) })
  const run = async (method, suffix, body) => {
    setBusy(true)
    try {
      await slotAction(method, slot, suffix, body)
      useUiStore.getState().addToast(t('common.saved'))
      setPick(''); setReason('')
    } catch { /* the interceptor shows the message; the list is reloaded either way */ } finally { setBusy(false); onDone() }
  }
  const confirmed = slot.status === 'confirmed'
  const reopen = as === 'admin' && slot.status === 'cancelled' && slot.latest_event === 'source_invalidated'
  return (
    <Card className="flex flex-col gap-2" data-testid="cover-slot">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold"><Ltr>{slot.occurrence_date} · {slot.source_start_time}–{slot.source_end_time}</Ltr> · <span dir="auto">{slot.subject}</span>{slot.batch && <> · <span dir="auto">{slot.batch}</span></>}</h3>
        <span className="text-sm">{t(`substitution.status.${slot.status}`)}</span>
      </div>
      <p className="text-sm text-content-muted" dir="auto">
        {slot.applicant ?? slot.original_teacher}{slot.substitute && <> → {slot.substitute.name}</>}
        {slot.reason_code && <> · {t(`substitution.reasons.${slot.reason_code}`, slot.reason_code)}</>}
      </p>
      {canPick && (
        <div className="flex flex-wrap items-end gap-2">
          <Select className="grow" label={t('substitution.pick')} placeholder={candidates.isPending ? '…' : t('substitution.choose')} value={pick} onChange={e => setPick(e.target.value)}
            options={(candidates.data ?? []).map(c => ({ value: String(c.id), label: c.name }))} />
          {as === 'admin' && confirmed && <Input label={t('substitution.reason')} value={reason} onChange={e => setReason(e.target.value)} />}
          <Button loading={busy} disabled={!pick || (as === 'admin' && confirmed && !reason)}
            onClick={() => run('put', as === 'admin' ? 'offer' : 'nomination', { substitute_teacher_id: pick, ...(as === 'admin' && confirmed ? { reason } : {}) })}>
            {t(as === 'admin' ? 'substitution.offer' : 'substitution.nominate')}
          </Button>
          {candidates.data?.length === 0 && <p className="text-sm text-content-muted">{t('substitution.nobody_free')}</p>}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        {as === 'applicant' && slot.status === 'nominated' && <Button variant="secondary" loading={busy} onClick={() => run('delete', 'nomination')}>{t('substitution.clear_nomination')}</Button>}
        {as === 'admin' && ['offered', 'confirmed'].includes(slot.status) && (
          <Button variant="secondary" loading={busy} disabled={confirmed && !reason} onClick={() => run('delete', 'offer', confirmed ? { reason } : {})}>{t('substitution.clear_offer')}</Button>
        )}
        {as === 'target' && slot.status === 'offered' && <>
          <Button loading={busy} onClick={() => run('patch', 'accept')}>{t('substitution.accept')}</Button>
          <Button variant="secondary" loading={busy} onClick={() => run('patch', 'decline')}>{t('substitution.decline')}</Button>
        </>}
        {reopen && <>
          <Input label={t('substitution.reason')} value={reason} onChange={e => setReason(e.target.value)} />
          <Button variant="secondary" loading={busy} disabled={!reason} onClick={() => run('patch', 'refresh-source', { reason })}>{t('substitution.reopen')}</Button>
        </>}
      </div>
    </Card>
  )
}
