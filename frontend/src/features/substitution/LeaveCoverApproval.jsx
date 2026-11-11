import { useState } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { Select } from '../../components/FormField'
import { useUiStore } from '../../store/uiStore'
import Ltr from '../../components/bidi/Ltr'

const newKey = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

// D201 SUBM.1: on the HR leave page, a pending Teacher leave that has class periods is approved together with the substitute of
// each period (or an explicit gap). The approval sends every period's choice and the scope digest it was read with; the server
// answers which choices stayed a gap and why. Shows nothing when there is no such leave or the substitution module is off.
function OneLeave({ leaveId, onDone }) {
  const { t } = useTranslation()
  const [pick, setPick] = useState({})
  const [busy, setBusy] = useState(false)
  const [gaps, setGaps] = useState(null)
  const q = useQuery({ queryKey: ['cover-leave', leaveId], retry: false, queryFn: () => api.get(`/hr/leaves/${leaveId}/substitution-slots`).then(r => r.data.data) })
  const slots = (q.data?.slots ?? []).filter(s => s.status !== 'cancelled')
  const candidates = useQueries({ queries: slots.map(s => ({ queryKey: ['cover-candidates', s.id, s.version], retry: false,
    queryFn: () => api.get(`/hr/leaves/${leaveId}/substitution-slots/${s.id}/candidates`).then(r => r.data.data) })) })
  if (!slots.length) return null
  const chosen = (s) => pick[s.id] ?? (s.status === 'nominated' && s.substitute ? String(s.substitute.id) : '')
  const approve = async () => {
    setBusy(true)
    try {
      const { data } = await api.request({ method: 'patch', url: `/hr/leaves/${leaveId}/approve`, headers: { 'Idempotency-Key': newKey() }, data: {
        cover_choices: slots.map(s => ({ routine_id: s.routine_id, occurrence_date: s.occurrence_date, substitute_teacher_id: chosen(s) ? Number(chosen(s)) : null })),
        expected_versions: { occurrence_scope: q.data.occurrence_scope } } })
      useUiStore.getState().addToast(t('common.saved'))
      setGaps(data.cover_gaps ?? [])
    } catch { /* the interceptor shows it (a changed plan is 409: the list reloads) */ } finally { setBusy(false); onDone() }
  }
  return (
    <Card className="flex flex-col gap-3" data-testid="leave-cover-approval">
      <h3 className="font-semibold"><span dir="auto">{slots[0].original_teacher}</span> · <Ltr>{q.data.leave.from_date} → {q.data.leave.to_date}</Ltr></h3>
      {slots.map((s, n) => (
        <div key={s.id} className="grid gap-2 sm:grid-cols-2 items-end">
          <p className="text-sm"><Ltr>{s.occurrence_date} · {s.source_start_time}–{s.source_end_time}</Ltr> · <span dir="auto">{s.subject}</span>{s.batch && <> · <span dir="auto">{s.batch}</span></>}</p>
          <Select label={t('substitution.pick')} value={chosen(s)} onChange={e => setPick(p => ({ ...p, [s.id]: e.target.value }))}
            options={[{ value: '', label: t('substitution.leave_gap') }, ...(candidates[n]?.data ?? []).map(c => ({ value: String(c.id), label: c.name }))]} />
        </div>
      ))}
      <div className="flex justify-end"><Button loading={busy} onClick={approve}>{t('substitution.approve_with')}</Button></div>
      {gaps?.length > 0 && <p className="text-sm" data-testid="cover-gaps">{t('substitution.gaps_result', { n: gaps.length })} {gaps.map((g, n) => <span key={n}><Ltr>{g.occurrence_date}</Ltr>: {t(`substitution.reasons.${g.reason}`, g.reason)}; </span>)}</p>}
    </Card>
  )
}

export default function LeaveCoverApproval() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const pending = useQuery({ queryKey: ['hr/leaves', 'pending-cover'], retry: false, queryFn: () => api.get('/hr/leaves', { params: { status: 'pending', per_page: 50 } }).then(r => (r.data.data ?? []).filter(l => l.user_id)) })
  if (!pending.data?.length) return null
  const reload = () => { for (const k of ['hr/leaves', 'cover-leave', 'cover-candidates', 'cover-needing']) qc.invalidateQueries({ queryKey: [k] }) }
  return (
    <section className="flex flex-col gap-2 mb-4">
      <h2 className="font-semibold">{t('substitution.approve_title')}</h2>
      <p className="text-sm text-content-muted">{t('substitution.approve_hint')}</p>
      {pending.data.map(l => <OneLeave key={l.id} leaveId={l.id} onDone={reload} />)}
    </section>
  )
}
