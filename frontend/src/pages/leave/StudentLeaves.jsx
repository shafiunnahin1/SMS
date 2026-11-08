import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'
import { useUiStore } from '../../store/uiStore'
import Ltr from '../../components/bidi/Ltr'

// D197 AAD.3 /admin/leave/students and /teacher/leave/students: the leave requests (a teacher sees their batches' students and
// decides up to the auto limit; the admin decides all). An approval lists absences already taken on those dates - correcting
// them stays a separate, deliberate edit on the attendance sheet.
export default function StudentLeaves() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [status, setStatus] = useState('pending')
  const [notes, setNotes] = useState({})
  const [fix, setFix] = useState(null)
  const q = useQuery({ queryKey: ['student-leaves', status], queryFn: () => api.get('/leave-requests/students', { params: status ? { status } : {} }).then(r => r.data.data) })
  const decide = async (l, next) => {
    try {
      const { data } = await api.patch(`/leave-requests/students/${l.id}`, { status: next, note: notes[l.id] || null })
      useUiStore.getState().addToast(t('common.saved'))
      setFix(data.data.absent_to_correct?.length ? { name: l.student, dates: data.data.absent_to_correct.map(a => a.date) } : null)
      qc.invalidateQueries({ queryKey: ['student-leaves'] })
    } catch { /* the interceptor shows it */ }
  }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('student_leave.title')} />
      <div className="max-w-xs">
        <Select label={t('student_leave.status')} value={status} onChange={e => setStatus(e.target.value)}
          options={['', 'pending', 'approved', 'rejected', 'cancelled'].map(v => ({ value: v, label: t(`student_leave.st_${v || 'all'}`) }))} />
      </div>
      {fix && <Card data-testid="leave-fix"><p className="text-sm">{t('student_leave.fix_absent', { name: fix.name })} <Ltr>{fix.dates.join(', ')}</Ltr></p></Card>}
      {q.isPending ? <Loader type="cards" count={2} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.length ? <EmptyState title={t('student_leave.none')} /> : q.data.map(l => (
        <Card key={l.id} className="flex flex-col gap-2" data-testid="leave-row">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold"><span dir="auto">{l.student}</span> · <Ltr>{l.from_date} → {l.to_date}</Ltr> ({t('student_leave.days', { n: l.total_days })})</h2>
            <span className="text-sm">{t(`student_leave.st_${l.status}`)}</span>
          </div>
          {l.reason && <p className="text-sm" dir="auto">{l.reason}</p>}
          {l.attachment_url && <a className="text-sm underline" href={l.attachment_url} target="_blank" rel="noreferrer">{t('student_leave.attachment')}</a>}
          {l.status === 'pending' && (l.can_decide ? (
            <div className="flex flex-wrap items-end gap-2">
              <Input className="grow" label={t('student_leave.note')} value={notes[l.id] ?? ''} onChange={e => setNotes(n => ({ ...n, [l.id]: e.target.value }))} />
              <Button onClick={() => decide(l, 'approved')}>{t('student_leave.approve')}</Button>
              <Button variant="secondary" onClick={() => decide(l, 'rejected')}>{t('student_leave.reject')}</Button>
            </div>
          ) : <p className="text-sm text-content-muted">{t('student_leave.admin_decides')}</p>)}
        </Card>
      ))}
    </div>
  )
}
