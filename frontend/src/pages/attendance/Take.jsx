import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import { useTerms } from '../../hooks/useTerms'
import { useAttendanceSheet } from '../../features/attendance/useAttendanceSheet'
import PageSlot from '../../ui/PageSlot'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'

// docs/UI-PACKS.md section 4 "pages/attendance/Take.jsx": identical for every pack - choose batch + date, the hook does the logic,
// <PageSlot name="attendance.take"> lets the pack choose the view
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' })

export default function AttendanceTakePage() {
  const { t } = useTranslation()
  const term = useTerms()
  const batches = useQuery({ queryKey: ['batches'], queryFn: () => api.get('/batches').then(r => r.data.data) })
  const [batchId, setBatchId] = useState('')
  const [date, setDate] = useState(today)
  const chosen = batchId || batches.data?.[0]?.id
  const sheet = useAttendanceSheet(chosen, date)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('attendance.title')} />
      {batches.isPending ? <Card><Loader type="form" fields={2} /></Card> : batches.isError ? <ErrorState onRetry={batches.refetch} /> : !batches.data.length ? <EmptyState /> : (
        <>
          <Card className="grid gap-3 sm:grid-cols-2">
            <Select label={term('batch')} value={chosen} onChange={e => setBatchId(e.target.value)}
              options={batches.data.map(b => ({ value: b.id, label: b.program ? `${b.program.name} — ${b.name}` : b.name }))} />
            <Input label={t('attendance.date')} type="date" ltr value={date} max={today()} onChange={e => setDate(e.target.value)} />
          </Card>
          {sheet.query.isPending ? <Card><Loader type="skeleton" rows={6} /></Card>
            : sheet.query.isError ? <ErrorState onRetry={sheet.query.refetch} />
            : sheet.data.holiday ? <EmptyState title={t('attendance.holiday', { title: sheet.data.holiday })} />
            : <PageSlot name="attendance.take" state={sheet.state} data={sheet.data} actions={sheet.actions} />}
        </>
      )}
    </div>
  )
}
