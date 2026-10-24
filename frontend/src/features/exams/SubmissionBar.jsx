import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Send, Unlock, Check, X, RotateCcw } from 'lucide-react'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { Textarea } from '../../components/FormField'

// D162: the subject's marks state on the entry sheet - the teacher saves a draft, submits it to the head, and after that may only ask
// to update (with a reason); the head approves or rejects a request, and may return submitted marks to draft
export default function SubmissionBar({ examId, subjectId, state, isAdmin, onChanged }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(null)
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const status = state.status
  const act = async (action, body = {}) => {
    setBusy(action)
    try {
      await api.post(`/exams/${examId}/subjects/${subjectId}/submission`, { action, ...body })
      useUiStore.getState().addToast(t(`marks_flow.done.${action}`))
      setAsking(false); setReason(''); setNote('')
      onChanged()
    } catch (e) { useUiStore.getState().addToast(e.response?.data?.message ?? t('common.error'), 'error') } finally { setBusy(null) }
  }
  const tone = { draft: 'bg-surface-muted', unlocked: 'bg-surface-muted', submitted: 'bg-primary-soft text-primary-fg', unlock_requested: 'bg-primary-soft text-primary-fg' }[status]

  return (
    <Card className="flex flex-col gap-3" data-testid="marks-submission" data-status={status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-col gap-1">
          <span className={`w-fit rounded-token px-2 py-1 text-sm font-semibold ${tone}`}>{t(`marks_flow.status.${status}`)}</span>
          <span className="text-xs text-content-muted">{t(`marks_flow.hint.${status}${isAdmin ? '_admin' : ''}`)}</span>
        </span>
        <span className="flex flex-wrap gap-2">
          {['draft', 'unlocked'].includes(status) && (
            <Button onClick={() => act('submit')} loading={busy === 'submit'} data-action="submit-marks"><Send aria-hidden="true" className="h-4 w-4" />{t('marks_flow.submit')}</Button>)}
          {!isAdmin && status === 'submitted' && !asking && (
            <Button variant="secondary" onClick={() => setAsking(true)} data-action="request-update"><Unlock aria-hidden="true" className="h-4 w-4" />{t('marks_flow.request')}</Button>)}
          {isAdmin && ['submitted', 'unlock_requested'].includes(status) && (
            <Button variant="ghost" onClick={() => act('reopen', note ? { note } : {})} loading={busy === 'reopen'} data-action="reopen-marks"><RotateCcw aria-hidden="true" className="h-4 w-4" />{t('marks_flow.reopen')}</Button>)}
        </span>
      </div>
      {status === 'unlock_requested' && state.request_reason && <p className="text-sm" dir="auto">{t('marks_flow.reason')}: {state.request_reason}</p>}
      {status !== 'unlock_requested' && state.decision_note && <p className="text-sm text-content-muted" dir="auto">{t('marks_flow.note')}: {state.decision_note}</p>}
      {asking && (
        <div className="flex flex-col gap-2">
          <Textarea label={t('marks_flow.reason')} rows={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} name="request_reason" />
          <span className="flex flex-wrap gap-2">
            <Button onClick={() => act('request', { reason })} disabled={!reason.trim()} loading={busy === 'request'} data-action="send-request">{t('marks_flow.send_request')}</Button>
            <Button variant="ghost" onClick={() => setAsking(false)}>{t('common.cancel')}</Button>
          </span>
        </div>)}
      {isAdmin && status === 'unlock_requested' && (
        <div className="flex flex-col gap-2">
          <Textarea label={t('marks_flow.note_optional')} rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)} name="decision_note" />
          <span className="flex flex-wrap gap-2">
            <Button onClick={() => act('approve', note ? { note } : {})} loading={busy === 'approve'} data-action="approve-request"><Check aria-hidden="true" className="h-4 w-4" />{t('marks_flow.approve')}</Button>
            <Button variant="secondary" onClick={() => act('reject', note ? { note } : {})} loading={busy === 'reject'} data-action="reject-request"><X aria-hidden="true" className="h-4 w-4" />{t('marks_flow.reject')}</Button>
          </span>
        </div>)}
    </Card>
  )
}
