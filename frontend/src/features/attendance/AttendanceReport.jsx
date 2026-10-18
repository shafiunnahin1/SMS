import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import { useLocale } from '../../ui/I18nProvider'
import { fmtNumber } from '../../i18n/format'
import Card from '../../components/Card'
import DataTable from '../../components/DataTable'
import { Input } from '../../components/FormField'
import Ltr from '../../components/bidi/Ltr'

export const thisMonth = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }).slice(0, 7)

// Step 4.3 month report: GET /attendance/report?batch_id=&month= (one grouped query; a teacher only for their own batch)
export default function AttendanceReport({ batchSelect, batchId }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const [month, setMonth] = useState(thisMonth)
  const report = useQuery({ queryKey: ['attendance', 'report', batchId, month], enabled: Boolean(batchId && month),
    queryFn: () => api.get('/attendance/report', { params: { batch_id: batchId, month } }).then(r => r.data.data) })
  const n = (v) => <Ltr>{fmtNumber(v, locale)}</Ltr>
  const columns = [
    { key: 'name', label: t('students.name'), render: r => <span dir="auto">{r.name}</span> },
    { key: 'percentage', label: t('attendance.report.percentage'), numeric: true, render: r => <Ltr>{fmtNumber(r.percentage, locale)}%</Ltr> },
    { key: 'absent', label: t('attendance.status.absent'), numeric: true, render: r => n(r.absent) },
    { key: 'present', label: t('attendance.status.present'), numeric: true, render: r => n(r.present) },
    { key: 'late', label: t('attendance.status.late'), numeric: true, render: r => n(r.late) },
    { key: 'leave', label: t('attendance.status.leave'), numeric: true, render: r => n(r.leave) },
    { key: 'total_days', label: t('attendance.report.days'), numeric: true, render: r => n(r.total_days) },
  ]
  return (
    <>
      <Card className="grid gap-3 sm:grid-cols-2">
        {batchSelect}
        <Input label={t('attendance.month')} type="month" ltr value={month} max={thisMonth()} onChange={e => setMonth(e.target.value)} />
      </Card>
      <Card data-testid="attendance-report">
        <DataTable columns={columns} data={report.data?.rows ?? []} rowKey="student_id" loading={report.isPending} error={report.isError} onRetry={report.refetch} />
      </Card>
    </>
  )
}
