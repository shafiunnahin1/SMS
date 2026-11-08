import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate, fmtMoney, fmtNumber } from '../../i18n/format'
import { thisMonth } from '../../features/attendance/AttendanceReport'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import StatusBadge from '../../components/StatusBadge'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input } from '../../components/FormField'
import StatCard from '../../ui/variants/StatCard'
import Ltr from '../../components/bidi/Ltr'

// D195 STP.1: the student's own portal - the server picks the student from the login (GET /student/*), the page never sends an id.
// The same views as the parent's pages for one child.
const useMine = (key, url, params) => useQuery({ queryKey: ['student', key, params ?? {}], queryFn: () => api.get(url, { params }).then(r => r.data.data) })
const num = (v) => (v == null ? '—' : Number(v))

function Page({ title, q, extra, children }) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={title} />
      {extra}
      {q.isPending ? <Loader type="page" count={2} rows={3} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : children(q.data)}
    </div>
  )
}

export function StudentDashboard() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  return (
    <Page title={t('student_portal.dashboard')} q={useMine('dashboard', '/student/dashboard')}>
      {d => (
        <>
          <p className="text-sm text-content-muted" dir="auto">{d.name} · <Ltr>{d.student_id}</Ltr>{d.program ? ` · ${d.program}` : ''}{d.batch ? ` — ${d.batch}` : ''}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label={t('student_portal.attendance_month')} value={d.attendance.percentage == null ? '—' : `${fmtNumber(d.attendance.percentage, locale)}%`} />
            <StatCard label={t('student_portal.dues')} value={fmtMoney(d.dues.total, locale)} />
            <StatCard label={t('student_portal.latest_result')} value={d.latest_result ? `${num(d.latest_result.percentage)}%` : '—'} />
          </div>
          {d.latest_result && <p className="text-sm" dir="auto">{d.latest_result.exam}{d.latest_result.is_pass != null && ` · ${t(d.latest_result.is_pass ? 'exams.passed' : 'exams.failed')}`}</p>}
        </>
      )}
    </Page>
  )
}

export function StudentResults() {
  const { t } = useTranslation()
  return (
    <Page title={t('exams.results')} q={useMine('results', '/student/results')}>
      {d => d.blocked ? <Card data-testid="result-blocked"><h2 className="font-semibold">{t('due_block.blocked_title')}</h2><p className="text-sm" dir="auto">{d.blocked.reason}</p></Card>
        : !d.exams.length ? <EmptyState title={t('exams.none_published')} /> : d.exams.map(sheet => (
        <Card key={sheet.exam.id} className="flex flex-col gap-3" data-testid="student-exam">
          <h2 className="font-semibold"><span dir="auto">{sheet.exam.name}</span> <Ltr>({sheet.exam.academic_year})</Ltr></h2>
          <ul className="flex flex-col divide-y divide-line">
            {sheet.subjects.map(s => (
              <li key={s.subject_id} className="flex items-center justify-between h-row gap-2">
                <span dir="auto">{s.subject}</span>
                <span className="text-sm"><Ltr>{s.is_absent ? t('status.absent') : `${num(s.marks_obtained)}/${num(s.full_marks)}`}</Ltr>{s.grade && <strong className="ms-2">{s.grade}</strong>}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm">
            {t('exams.percentage')}: <strong><Ltr>{num(sheet.total.percentage)}%</Ltr></strong>
            {sheet.use_gpa && <> · GPA: <strong><Ltr>{sheet.total.gpa == null ? '—' : Number(sheet.total.gpa).toFixed(2)}</Ltr></strong></>}
            {sheet.total.is_pass != null && <> · {t(sheet.total.is_pass ? 'exams.passed' : 'exams.failed')}</>}
          </p>
        </Card>
      ))}
    </Page>
  )
}

export function StudentFees() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  return (
    <Page title={t('student_portal.fees')} q={useMine('fees', '/student/fees')}>
      {d => (
        <>
          <Card>
            <h2 className="font-semibold mb-2">{t('fees.dues')}</h2>
            {!d.lines.length ? <EmptyState title={t('fees.no_dues')} /> : (
              <ul className="flex flex-col divide-y divide-line" data-testid="student-dues">
                {d.lines.map(l => <li key={l.key} className="flex items-center justify-between h-row"><span dir="auto">{l.category} · <Ltr>{l.period}</Ltr></span><Ltr>{fmtMoney(l.amount, locale)}</Ltr></li>)}
                <li className="flex items-center justify-between h-row font-semibold"><span>{t('common.total')}</span><Ltr>{fmtMoney(d.total, locale)}</Ltr></li>
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="font-semibold mb-2">{t('fees.receipts')}</h2>
            {!d.receipts.length ? <EmptyState /> : (
              <ul className="flex flex-col divide-y divide-line" data-testid="student-receipts">
                {d.receipts.map(r => (
                  <li key={r.receipt_no} className="flex items-center justify-between py-2">
                    <span><Ltr>{r.receipt_no}</Ltr><span className="block text-xs text-content-muted">{r.paid_at && fmtDate(r.paid_at, locale)}</span></span>
                    <Ltr>{fmtMoney(r.total, locale)}</Ltr>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </Page>
  )
}

export function StudentAttendance() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const [month, setMonth] = useState(thisMonth())
  const n = (v) => (v == null ? '—' : fmtNumber(v, locale))
  return (
      <Page title={t('student_portal.attendance')} q={useMine('attendance', '/student/attendance', { month })}
        extra={<Input label={t('attendance.month')} type="month" ltr value={month} max={thisMonth()} onChange={e => setMonth(e.target.value)} />}>
        {d => (
          <>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
              <StatCard label={t('attendance.parent.rate')} value={`${n(d.percentage)}%`} />
              <StatCard label={t('attendance.status.present')} value={n(d.present)} />
              <StatCard label={t('attendance.status.absent')} value={n(d.absent)} />
              <StatCard label={t('attendance.status.late')} value={n(d.late)} />
            </div>
            <Card>
              <h2 className="font-semibold mb-2">{t('attendance.parent.daily')}</h2>
              {!d.daily_records.length ? <EmptyState title={t('attendance.parent.none')} /> : (
                <ul className="flex flex-col divide-y divide-line" data-testid="student-attendance-days">
                  {d.daily_records.map(r => <li key={`${r.date}-${r.batch_id}`} className="flex items-center justify-between h-row"><span>{fmtDate(r.date, locale)}</span><StatusBadge status={r.status} /></li>)}
                </ul>
              )}
            </Card>
          </>
        )}
      </Page>
  )
}
