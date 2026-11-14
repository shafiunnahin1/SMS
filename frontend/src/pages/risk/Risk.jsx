import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import Tabs from '../../ui/variants/Tabs'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'

// D216 RISK.2 /admin|teacher/risk: students who may need support - each with WHY (the measured values), "seen" with a note and
// "close". A signal for the teacher, not a label: students and parents never see this page. The admin also sets the thresholds.
export default function Risk() {
  const { t } = useTranslation()
  const admin = useAuthStore((s) => s.user?.role) === 'admin'
  const [tab, setTab] = useState('list')
  return (
    <div className="flex flex-col gap-4" data-testid="risk">
      <PageHeader title={t('risk.title')} />
      <p className="text-sm text-content-muted">{t('risk.ethic')}</p>
      {admin && <Tabs items={[{ key: 'list', label: t('risk.list') }, { key: 'settings', label: t('risk.settings') }]} value={tab} onChange={setTab} label={t('risk.title')} />}
      {tab === 'list' || !admin ? <Flags admin={admin} /> : <Settings />}
    </div>
  )
}

/** the "why" of one reason, in words */
function why(t, r) {
  const d = r.details ?? {}
  if (r.kind === 'attendance') {
    const parts = []
    if (d.attendance_pct != null) parts.push(t('risk.why.attendance', { pct: d.attendance_pct, present: d.present, working: d.working, days: d.window_days }))
    if (d.consecutive_absent) parts.push(t('risk.why.consecutive', { n: d.consecutive_absent }))
    return parts.join(' · ')
  }
  if (r.kind === 'marks_drop') return t('risk.why.marks_drop', { from: d.previous_avg, to: d.latest, drop: d.drop })
  if (r.kind === 'dues') return t('risk.why.dues', { n: d.months_due })
  return ''
}

function Flags({ admin }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const [level, setLevel] = useState('')
  const [notes, setNotes] = useState({})
  const q = useQuery({ queryKey: ['risk', 'flags', level], queryFn: () => api.get('/risk/flags', { params: level ? { level } : {} }).then(r => r.data.data) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['risk'] })
  const act = async (f, action) => {
    try { await api.post(`/risk/flags/${f.id}/${action}`, { note: notes[f.id]?.trim() || null }); setNotes({ ...notes, [f.id]: '' }) } catch { /* the interceptor shows the error */ } finally { refresh() }
  }
  const evaluate = async () => {
    try { const r = await api.post('/risk/evaluate'); useUiStore.getState().addToast(t('risk.evaluated', { count: r.data.data.written })) } catch { /* the interceptor shows the error */ } finally { refresh() }
  }
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Select name="level" label={t('risk.level')} value={level} onChange={(e) => setLevel(e.target.value)} className="sm:w-48"
          options={[{ value: '', label: t('risk.all_levels') }, { value: 'high', label: t('risk.levels.high') }, { value: 'watch', label: t('risk.levels.watch') }]} />
        {admin && <Button variant="ghost" onClick={evaluate} data-action="evaluate">{t('risk.evaluate')}</Button>}
      </div>
      {q.isLoading ? <Loader /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.length ? <EmptyState title={t('risk.none')} /> : (
        <ul className="flex flex-col divide-y divide-line text-sm" data-testid="risk-list">
          {q.data.map(f => (
            <li key={f.id} className="py-3 flex flex-col gap-2" data-level={f.level}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{f.student.name}</span> <Ltr>({f.student.student_id})</Ltr>
                {f.batch && <span className="text-content-muted">{f.batch.name}</span>}
                <span className="rounded-full px-2 py-0.5 text-xs bg-surface-muted font-medium">{t(`risk.levels.${f.level}`)}</span>
                {f.status === 'acknowledged' && <span className="text-content-muted">{t('risk.seen')}{f.note ? `: ${f.note}` : ''}</span>}
                <span className="text-content-muted">{fmtDate(f.computed_on, locale)}</span>
              </div>
              <ul className="list-disc ps-5">
                {f.reasons.map((r, i) => <li key={i}><span className="font-medium">{t(`risk.kinds.${r.kind}`)}</span>: {why(t, r)}</li>)}
              </ul>
              <div className="flex flex-wrap items-end gap-2">
                <Input name={`note-${f.id}`} aria-label={t('risk.note')} placeholder={t('risk.note')} value={notes[f.id] ?? ''} onChange={(e) => setNotes({ ...notes, [f.id]: e.target.value })} maxLength={255} className="grow" />
                {f.status === 'open' && <Button onClick={() => act(f, 'acknowledge')} data-action="acknowledge">{t('risk.acknowledge')}</Button>}
                <Button variant="ghost" onClick={() => act(f, 'resolve')} data-action="resolve">{t('risk.resolve')}</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

const FIELDS = [['attendance_watch', 0.01], ['attendance_high', 0.01], ['window_days', 1], ['consecutive_absent_high', 1], ['marks_drop_watch', 0.01], ['marks_drop_high', 0.01], ['dues_watch', 1], ['dues_high', 1]]

function Settings() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['risk', 'settings'], queryFn: () => api.get('/risk/settings').then(r => r.data.data) })
  const [f, setF] = useState(null)
  const [busy, setBusy] = useState(false)
  const cur = f ?? q.data
  if (q.isPending) return <Loader />
  if (q.isError || !cur) return <ErrorState onRetry={q.refetch} />
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.put('/risk/settings', { ...Object.fromEntries(FIELDS.map(([k]) => [k, Number(cur[k])])), notify_parents: Boolean(cur.notify_parents) })
      useUiStore.getState().addToast(t('risk.saved'))
    } catch { /* the interceptor shows the error */ } finally { setBusy(false); setF(null); qc.invalidateQueries({ queryKey: ['risk'] }) }
  }
  return (
    <Card>
      <form className="flex flex-col gap-3 sm:max-w-xl" onSubmit={save} data-testid="risk-settings">
        <div className="grid gap-3 sm:grid-cols-2">
          {FIELDS.map(([k, step]) => <Input key={k} name={k} type="number" step={step} label={t(`risk.fields.${k}`)} value={cur[k]} onChange={(e) => setF({ ...cur, [k]: e.target.value })} required ltr />)}
        </div>
        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" name="notify_parents" checked={Boolean(cur.notify_parents)} onChange={(e) => setF({ ...cur, notify_parents: e.target.checked })} />{t('risk.notify_parents')}</label>
        <p className="text-sm text-content-muted">{t('risk.notify_parents_hint')}</p>
        <div><Button type="submit" disabled={busy} data-action="save-risk">{t('risk.save')}</Button></div>
      </form>
    </Card>
  )
}
