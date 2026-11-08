import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import { useTerms } from '../../hooks/useTerms'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'
import { useCrud } from '../../features/academic/useCrud'
import Ltr from '../../components/bidi/Ltr'

// D197 AAD.4 /admin/attendance/periods: per subject attendance % of a batch in a month (from the period attendance)
export default function PeriodReport() {
  const { t } = useTranslation()
  const term = useTerms()
  const batches = useCrud('batches').list
  const [batchId, setBatchId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const batch = (batches.data ?? []).find(b => String(b.id) === batchId)
  const programId = batch ? (batch.program_id ?? batch.program?.id) : null
  const subjects = useCrud('subjects', { params: { program_id: programId }, enabled: Boolean(programId) }).list
  const ready = Boolean(batchId && subjectId && month)
  const q = useQuery({ queryKey: ['period-report', batchId, subjectId, month], enabled: ready,
    queryFn: () => api.get('/period-attendance/report', { params: { batch_id: batchId, subject_id: subjectId, month } }).then(r => r.data.data) })
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('period_attendance.report_title')} />
      <Card className="grid gap-3 sm:grid-cols-3">
        <Select label={term('batch')} placeholder="—" value={batchId} onChange={e => { setBatchId(e.target.value); setSubjectId('') }} options={(batches.data ?? []).map(b => ({ value: String(b.id), label: b.name }))} />
        <Select label={t('period_attendance.subject')} placeholder="—" value={subjectId} onChange={e => setSubjectId(e.target.value)} options={(subjects.data ?? []).map(x => ({ value: String(x.id), label: x.name }))} />
        <Input type="month" ltr label={t('period_attendance.month')} value={month} onChange={e => setMonth(e.target.value)} />
      </Card>
      {!ready ? <EmptyState title={t('period_attendance.pick', { batch: term('batch') })} /> : q.isPending ? <Loader /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.length ? <EmptyState /> : (
        <Card className="overflow-x-auto" data-testid="period-report">
          <table className="w-full text-sm">
            <thead><tr><th className="text-start">{t('period_attendance.student')}</th><th>{t('period_attendance.periods')}</th><th>{t('status.present')}</th><th>{t('status.absent')}</th><th>{t('status.leave')}</th><th>%</th></tr></thead>
            <tbody>{q.data.map(r => (
              <tr key={r.student_id} className="border-t border-line">
                <td dir="auto"><Ltr>{r.roll_no ?? '—'}</Ltr> · {r.name}</td>
                {[r.periods, r.present, r.absent, r.leave, r.percentage ?? '—'].map((v, n) => <td key={n} className="text-center"><Ltr>{v}</Ltr></td>)}
              </tr>
            ))}</tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
