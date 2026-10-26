import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import { useTerms } from '../../hooks/useTerms'
import { useAuthStore } from '../../store/authStore'
import { useAttendanceSheet } from '../../features/attendance/useAttendanceSheet'
import AttendanceReport from '../../features/attendance/AttendanceReport'
import PageSlot from '../../ui/PageSlot'
import Tabs from '../../ui/variants/Tabs'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'

// docs/UI-PACKS.md section 4 "pages/attendance/Take.jsx": identical for every pack - choose batch + date, the hook does the logic,
// <PageSlot name="attendance.take"> lets the pack choose the view. Step 4.3: a teacher sees only their own batches
// (GET /teacher/batches; the API refuses any other with 403), and a second tab shows the month report.
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' })

/** D169 (4) STW.5 + D101 (owner 2026-10-27, "both"): a staff member's granted batches plus their own batches as a teacher, if any */
async function staffBatches() {
  const [granted, own] = await Promise.allSettled([api.get('/staff/attendance-batches'), api.get('/teacher/batches')])
  if (granted.status === 'rejected') throw granted.reason
  const all = [...granted.value.data.data, ...(own.status === 'fulfilled' ? own.value.data.data : [])]
  return all.filter((b, i) => all.findIndex(x => x.id === b.id) === i)
}

export default function AttendanceTakePage() {
  const { t } = useTranslation()
  const term = useTerms()
  const role = useAuthStore(s => s.role)
  const source = role === 'teacher' ? '/teacher/batches' : role === 'institution_staff' ? 'staff' : '/batches'
  const batches = useQuery({ queryKey: ['batches', source], queryFn: () => role === 'institution_staff' ? staffBatches() : api.get(source).then(r => r.data.data) })
  const [tab, setTab] = useState('take')
  const [batchId, setBatchId] = useState('')
  const [date, setDate] = useState(today)
  const chosen = batchId || batches.data?.[0]?.id
  const options = (batches.data ?? []).map(b => ({ value: b.id, label: b.program ? `${b.program.name} — ${b.name}` : b.name }))

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('attendance.title')} />
      {batches.isPending ? <Card><Loader type="form" fields={2} /></Card> : batches.isError ? <ErrorState onRetry={batches.refetch} /> : !batches.data.length ? <EmptyState /> : (
        <>
          <Tabs items={[{ key: 'take', label: t('attendance.take') }, { key: 'report', label: t('attendance.report.title') }]} value={tab} onChange={setTab} label={t('attendance.title')} />
          {tab === 'take'
            ? <TakeSheet batchSelect={<Select label={term('batch')} value={chosen} onChange={e => setBatchId(e.target.value)} options={options} />}
                batchId={chosen} date={date} setDate={setDate} />
            : <AttendanceReport batchSelect={<Select label={term('batch')} value={chosen} onChange={e => setBatchId(e.target.value)} options={options} />} batchId={chosen} />}
        </>
      )}
    </div>
  )
}

function TakeSheet({ batchSelect, batchId, date, setDate }) {
  const { t } = useTranslation()
  const sheet = useAttendanceSheet(batchId, date)
  return (
    <>
      <Card className="grid gap-3 sm:grid-cols-2">
        {batchSelect}
        <Input label={t('attendance.date')} type="date" ltr value={date} max={today()} onChange={e => setDate(e.target.value)} />
      </Card>
      {sheet.query.isPending ? <Card><Loader type="skeleton" rows={6} /></Card>
        : sheet.query.isError ? <ErrorState onRetry={sheet.query.refetch} />
        : sheet.data.holiday ? <EmptyState title={t('attendance.holiday', { title: sheet.data.holiday })} />
        : <PageSlot name="attendance.take" state={sheet.state} data={sheet.data} actions={sheet.actions} />}
    </>
  )
}
