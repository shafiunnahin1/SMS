import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useTerms } from '../../hooks/useTerms'
import { usePrint } from '../../hooks/usePrint'
import { useCrud } from '../../features/academic/useCrud'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import StatusBadge from '../../components/StatusBadge'
import Tabs from '../../ui/variants/Tabs'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'

// D210 PTC.1 /admin/academic/promotion: (1) promote - pick the students of a batch (those who failed are simply left out) and the
// target batch; (2) TC - find a student, issue the transfer certificate (TC number + memo number), print it, or cancel one.
export default function PromotionTc() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('promote')
  return (
    <div className="flex flex-col gap-4" data-testid="promotion-tc">
      <PageHeader title={t('ptc.title')} />
      <Tabs items={[{ key: 'promote', label: t('ptc.promote') }, { key: 'tc', label: t('ptc.tc') }]} value={tab} onChange={setTab} label={t('ptc.title')} />
      {tab === 'promote' ? <Promote /> : <Tc />}
    </div>
  )
}

function Promote() {
  const { t } = useTranslation()
  const term = useTerms()
  const batches = useCrud('batches').list
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [chosen, setChosen] = useState([])
  const [busy, setBusy] = useState(false)
  const students = useQuery({ queryKey: ['students', 'batch', from], enabled: !!from, queryFn: () => api.get('/students', { params: { batch_id: from, per_page: 100 } }).then(r => r.data.data) })
  const opts = (batches.data ?? []).map(b => ({ value: String(b.id), label: `${b.program?.name ?? ''} ${b.name}`.trim() }))
  const run = async () => {
    setBusy(true)
    try {
      const r = await api.post('/students/promote', { student_ids: chosen, to_batch_id: Number(to) })
      useUiStore.getState().addToast(t('ptc.promoted', { n: r.data.data.promoted, skipped: r.data.data.skipped.length }))
      setChosen([]); students.refetch()
    } catch { /* the interceptor shows the error */ } finally { setBusy(false) }
  }
  const rows = students.data ?? []
  return (
    <Card className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label={t('ptc.from', { batch: term('batch') })} placeholder="—" value={from} onChange={e => { setFrom(e.target.value); setChosen([]) }} name="from" options={opts} />
        <Select label={t('ptc.to', { batch: term('batch') })} placeholder="—" value={to} onChange={e => setTo(e.target.value)} name="to" options={opts.filter(o => o.value !== from)} />
      </div>
      {!from ? <p className="text-sm text-content-muted">{t('ptc.pick_from')}</p> : students.isPending ? <Loader type="skeleton" rows={4} /> : students.isError ? <ErrorState onRetry={students.refetch} /> : !rows.length ? <EmptyState title={t('ptc.no_students')} /> : (
        <>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={chosen.length === rows.length}
            onChange={e => setChosen(e.target.checked ? rows.map(r => r.id) : [])} name="all" />{t('ptc.all', { n: rows.length })}</label>
          <ul className="flex flex-col divide-y divide-line" data-testid="promote-list">
            {rows.map(r => (
              <li key={r.id} className="py-2"><label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={chosen.includes(r.id)} name={`s-${r.id}`}
                  onChange={e => setChosen(c => e.target.checked ? [...c, r.id] : c.filter(x => x !== r.id))} />
                {r.name} <span className="text-content-muted"><Ltr>{r.student_id}</Ltr></span></label></li>
            ))}
          </ul>
          <div><Button onClick={run} loading={busy} disabled={!chosen.length || !to} data-action="promote">{t('ptc.promote_n', { n: chosen.length })}</Button></div>
        </>
      )}
    </Card>
  )
}

function Tc() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { preview } = usePrint()
  const [q, setQ] = useState('')
  const [student, setStudent] = useState(null)
  const [f, setF] = useState({ reason: '', last_class: '', last_attendance_date: '', conduct: '' })
  const [busy, setBusy] = useState(false)
  const found = useQuery({ queryKey: ['students', 'search', q], enabled: q.trim().length >= 2, queryFn: () => api.get('/students', { params: { q: q.trim(), per_page: 10 } }).then(r => r.data.data) })
  const list = useQuery({ queryKey: ['tc'], queryFn: () => api.get('/tc').then(r => r.data) })
  const issue = async () => {
    setBusy(true)
    try {
      const body = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''))
      const r = await api.post(`/students/${student.id}/tc`, body)
      useUiStore.getState().addToast(t('ptc.issued', { no: r.data.data.tc_number }))
      setStudent(null); setQ(''); qc.invalidateQueries({ queryKey: ['tc'] })
    } catch { /* the interceptor shows the error */ } finally { setBusy(false) }
  }
  const cancel = async (tc) => {
    const reason = window.prompt(t('ptc.cancel_reason'))
    if (!reason) return
    try { await api.post(`/tc/${tc.id}/cancel`, { reason }) } catch { /* the interceptor shows the error */ } finally { qc.invalidateQueries({ queryKey: ['tc'] }) }
  }
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3" data-testid="tc-form">
        {!student ? (
          <>
            <Input label={t('ptc.find')} value={q} onChange={e => setQ(e.target.value)} name="q" />
            {(found.data ?? []).map(s => (
              <Button key={s.id} variant="secondary" onClick={() => setStudent(s)} data-action="pick">{s.name} · <Ltr>{s.student_id}</Ltr></Button>
            ))}
          </>
        ) : (
          <>
            <p className="font-medium">{student.name} <span className="text-content-muted"><Ltr>{student.student_id}</Ltr></span></p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label={t('ptc.last_class')} value={f.last_class} onChange={e => setF(v => ({ ...v, last_class: e.target.value }))} name="last_class" maxLength={50} />
              <Input label={t('ptc.last_day')} type="date" ltr value={f.last_attendance_date} onChange={e => setF(v => ({ ...v, last_attendance_date: e.target.value }))} name="last_attendance_date" />
              <Input label={t('ptc.conduct')} value={f.conduct} onChange={e => setF(v => ({ ...v, conduct: e.target.value }))} name="conduct" maxLength={50} placeholder={t('ptc.conduct_default')} />
              <Input label={t('ptc.reason')} value={f.reason} onChange={e => setF(v => ({ ...v, reason: e.target.value }))} name="reason" maxLength={500} />
            </div>
            <p className="text-sm text-content-muted">{t('ptc.issue_note')}</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStudent(null)}>{t('common.cancel')}</Button>
              <Button onClick={issue} loading={busy} data-action="issue">{t('ptc.issue')}</Button>
            </div>
          </>
        )}
      </Card>
      {list.isPending ? <Loader type="skeleton" rows={3} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : !list.data.data.length ? <EmptyState title={t('ptc.none')} /> : (
        <Card>
          <ul className="flex flex-col divide-y divide-line" data-testid="tc-list">
            {list.data.data.map(tc => (
              <li key={tc.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex flex-col">
                  <span className="font-medium">{tc.student?.name} · <Ltr>{tc.tc_number}</Ltr></span>
                  <span className="text-content-muted font-mono"><Ltr>{tc.memo_no_bn}</Ltr></span>
                </span>
                <span className="inline-flex items-center gap-2">
                  {tc.revoked && <StatusBadge status="memo_cancelled" />}
                  <Button variant="secondary" onClick={() => preview(`/tc/${tc.id}/pdf`)} data-action="print">{t('ptc.print')}</Button>
                  {!tc.revoked && <Button variant="ghost" onClick={() => cancel(tc)} data-action="cancel">{t('memo.cancel')}</Button>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
