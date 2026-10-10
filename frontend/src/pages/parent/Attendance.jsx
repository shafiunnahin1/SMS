import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate, fmtNumber } from '../../i18n/format'
import { thisMonth } from '../../features/attendance/AttendanceReport'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import StatusBadge from '../../components/StatusBadge'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input } from '../../components/FormField'
import StatCard from '../../ui/variants/StatCard'

// Step 4.3: the parent's own children only (GET /parent/children); the chosen child's month via GET /parent/children/{id}/attendance
// (another child's id is a 404 on the API)
export default function ParentAttendance() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const children = useQuery({ queryKey: ['parent', 'children'], queryFn: () => api.get('/parent/children').then(r => r.data.data) })
  const [chosen, setChosen] = useState(null)
  const [month, setMonth] = useState(thisMonth)
  const child = chosen ?? children.data?.[0]?.id
  const att = useQuery({ queryKey: ['parent', 'attendance', child, month], enabled: Boolean(child),
    queryFn: () => api.get(`/parent/children/${child}/attendance`, { params: { month } }).then(r => r.data.data) })

  if (children.isPending) return <><PageHeader title={t('attendance.parent.title')} /><Loader type="page" count={2} rows={3} /></>
  if (children.isError) return <ErrorState onRetry={children.refetch} />
  if (!children.data.length) return <EmptyState />

  const n = (v) => fmtNumber(v, locale)
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('attendance.parent.title')} />
      {children.data.length > 1 && (
        <div role="tablist" aria-label={t('fees.pick_child')} className="flex flex-wrap gap-2">
          {children.data.map(c => (
            <button key={c.id} role="tab" aria-selected={c.id === child} type="button" onClick={() => setChosen(c.id)}
              className={`h-9 px-3 rounded-token text-sm ${c.id === child ? 'bg-primary text-on-primary' : 'bg-surface [border:1px_solid_var(--line)]'}`}>
              <span dir="auto">{c.name}</span>
            </button>
          ))}
        </div>
      )}
      <Card className="grid gap-3 sm:grid-cols-2">
        <Input label={t('attendance.month')} type="month" ltr value={month} max={thisMonth()} onChange={e => setMonth(e.target.value)} />
      </Card>
      {att.isPending ? <Loader type="cards" count={4} /> : att.isError ? <ErrorState onRetry={att.refetch} /> : (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4" data-testid="parent-attendance-summary">
            <StatCard label={t('attendance.parent.rate')} value={`${n(att.data.percentage)}%`} />
            <StatCard label={t('attendance.status.present')} value={n(att.data.present)} />
            <StatCard label={t('attendance.status.absent')} value={n(att.data.absent)} />
            <StatCard label={t('attendance.status.late')} value={n(att.data.late)} />
          </div>
          <Card>
            <h2 className="font-semibold mb-2">{t('attendance.parent.daily')}</h2>
            {!att.data.daily_records.length ? <EmptyState title={t('attendance.parent.none')} /> : (
              <ul className="flex flex-col divide-y divide-line" data-testid="parent-attendance-days">
                {att.data.daily_records.map(r => (
                  <li key={`${r.date}-${r.batch_id}`} className="flex items-center justify-between h-row">
                    <span>{fmtDate(r.date, locale)}</span><StatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
