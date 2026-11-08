import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { useTerms } from '../../hooks/useTerms'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input } from '../../components/FormField'
import { useUiStore } from '../../store/uiStore'
import Ltr from '../../components/bidi/Ltr'

const STATUSES = ['present', 'absent', 'late', 'leave']

// D197 AAD.4 /teacher/periods: my routine periods of a day; pick one, mark each student, save (no SMS from periods)
export default function MyPeriods() {
  const { t } = useTranslation()
  const term = useTerms()
  const qc = useQueryClient()
  const [date, setDate] = useState('')
  const [open, setOpen] = useState(null)
  const [marks, setMarks] = useState({})
  const [busy, setBusy] = useState(false)
  const q = useQuery({ queryKey: ['my-periods', date], queryFn: () => api.get('/teacher/periods/today', { params: date ? { date } : {} }).then(r => r.data.data) })
  const period = q.data?.periods.find(p => p.routine_id === open)
  const status = (st) => marks[st.student_id] ?? st.status ?? 'present'
  const save = async () => {
    setBusy(true)
    try {
      await api.post('/period-attendance', { routine_id: period.routine_id, date: q.data.date, records: period.students.map(st => ({ student_id: st.student_id, status: status(st) })) })
      useUiStore.getState().addToast(t('common.saved'))
      setMarks({}); qc.invalidateQueries({ queryKey: ['my-periods'] })
    } catch { /* the interceptor shows it */ } finally { setBusy(false) }
  }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('period_attendance.title')} />
      <div className="max-w-xs"><Input type="date" ltr label={t('period_attendance.date')} value={date || q.data?.date || ''} onChange={e => { setDate(e.target.value); setOpen(null) }} /></div>
      {q.isPending ? <Loader type="cards" count={2} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.periods.length ? <EmptyState title={t('period_attendance.none')} /> : (
        <>
          <div className="flex flex-wrap gap-2" role="tablist">
            {q.data.periods.map(p => (
              <Button key={p.routine_id} variant={p.routine_id === open ? 'primary' : 'secondary'} onClick={() => { setOpen(p.routine_id); setMarks({}) }} data-testid="period">
                <Ltr>{p.start_time}–{p.end_time}</Ltr> <span dir="auto">{p.subject}</span>{p.batch && <> · <span dir="auto">{p.batch}</span></>}
              </Button>
            ))}
          </div>
          {period && (
            <Card className="flex flex-col gap-2" data-testid="period-sheet">
              {!period.students.length ? <EmptyState title={t('period_attendance.no_students', { batch: term('batch') })} /> : period.students.map(st => (
                <div key={st.student_id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-1">
                  <span dir="auto"><Ltr>{st.roll_no ?? '—'}</Ltr> · {st.name}{st.on_leave && <> · {t('period_attendance.on_leave')}</>}</span>
                  <div className="flex gap-1" role="radiogroup" aria-label={st.name}>
                    {STATUSES.map(v => (
                      <button key={v} type="button" role="radio" aria-checked={status(st) === v} onClick={() => setMarks(m => ({ ...m, [st.student_id]: v }))}
                        className={`h-8 px-2 rounded-token text-sm ${status(st) === v ? 'bg-primary text-on-primary' : 'bg-surface [border:1px_solid_var(--line)]'}`}>{t(`status.${v}`)}</button>
                    ))}
                  </div>
                </div>
              ))}
              {period.students.length > 0 && <div className="flex justify-end"><Button loading={busy} onClick={save}>{t('common.save')}</Button></div>}
            </Card>
          )}
        </>
      )}
    </div>
  )
}
