import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import { useTerms } from '../../hooks/useTerms'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate, fmtMoney, fmtNumber } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import StatusBadge from '../../components/StatusBadge'
import { EmptyState, ErrorState } from '../../components/StateViews'
import Ltr from '../../components/bidi/Ltr'
import StatCard from '../../ui/variants/StatCard'

// Step 4.7: one dashboard per role (docs/modules/panels-and-features.md "6 Panels"), fed by GET /{role}/dashboard
// (Super Admin: GET /super/dashboard on the central host). Numbers only come from the server.
const SOURCE = { admin: '/admin/dashboard', accountant: '/accountant/dashboard', teacher: '/teacher/dashboard', parent: '/parent/dashboard', super_admin: '/super/dashboard' }
const VIEWS = { admin: AdminView, accountant: AccountantView, teacher: TeacherView, parent: ParentView, super_admin: SuperView }

export default function Dashboard() {
  const { t } = useTranslation()
  const user = useAuthStore(s => s.user)
  const role = useAuthStore(s => s.role)
  const View = VIEWS[role]
  const data = useQuery({ queryKey: ['dashboard', role], enabled: Boolean(SOURCE[role]), queryFn: () => api.get(SOURCE[role]).then(r => r.data.data) })
  return (
    <div className="flex flex-col gap-4" data-testid="dashboard">
      <PageHeader title={t('dashboard.title')} />
      <p className="text-sm text-content-muted" dir="auto">{t('dashboard.hello', { name: user?.name })}</p>
      {!View ? null : data.isPending ? <Loader type="cards" count={4} /> : data.isError ? <ErrorState onRetry={data.refetch} /> : <View d={data.data} />}
    </div>
  )
}

const Grid = ({ children }) => <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">{children}</div>

function AdminView({ d }) {
  const { t } = useTranslation()
  const term = useTerms()
  const { locale } = useLocale()
  const n = (v) => fmtNumber(v, locale)
  const a = d.attendance_today
  return (
    <>
      <Grid>
        <StatCard label={t('dashboard.students')} value={n(d.students)} />
        <StatCard label={t('dashboard.teachers')} value={n(d.teachers)} />
        <StatCard label={term('batches')} value={n(d.batches)} />
        <StatCard label={t('dashboard.sms_balance')} value={n(d.sms_balance)} />
      </Grid>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-semibold mb-2">{t('dashboard.attendance_today')}</h2>
          <p className="text-sm">{t('attendance.status.present')}: <Ltr>{n(a.present)}</Ltr> · {t('attendance.status.absent')}: <Ltr>{n(a.absent)}</Ltr> · {t('attendance.status.leave')}: <Ltr>{n(a.leave)}</Ltr></p>
          <p className="text-sm text-content-muted mt-1">{t('dashboard.batches_taken', { unit: term('batches') })}: <Ltr>{n(a.batches_taken)}/{n(a.batches_total)}</Ltr></p>
          <Link to="/admin/attendance" className="text-sm text-primary-fg underline mt-2 inline-block">{t('attendance.title')}</Link>
        </Card>
        <Collection c={d.collection} link="/admin/fees/dues" />
      </div>
      <Card className="flex items-center justify-between gap-2">
        <span>{t('dashboard.exams_open')}: <Ltr>{n(d.exams_open)}</Ltr></span>
        <Link to="/admin/exams" className="text-sm text-primary-fg underline">{t('exams.title')}</Link>
      </Card>
    </>
  )
}

function Collection({ c, link }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  return (
    <Card data-testid="dashboard-collection">
      <h2 className="font-semibold mb-2">{t('dashboard.collection')}</h2>
      <p className="text-sm">{t('dashboard.today')}: <strong><Ltr>{fmtMoney(c.today, locale)}</Ltr></strong> · {t('dashboard.receipts_today', { count: c.receipts_today })}</p>
      <p className="text-sm text-content-muted mt-1">{t('dashboard.this_month')}: <Ltr>{fmtMoney(c.month, locale)}</Ltr></p>
      <Link to={link} className="text-sm text-primary-fg underline mt-2 inline-block">{t('fees.ledger_title')}</Link>
    </Card>
  )
}

function AccountantView({ d }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  return (
    <>
      <Collection c={d.collection} link="/accountant/fees/dues" />
      <Card>
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="font-semibold">{t('dashboard.recent_receipts')}</h2>
          <Link to="/accountant/fees/collect" className="text-sm text-primary-fg underline">{t('fees.collect_title')}</Link>
        </div>
        {!d.recent_receipts.length ? <EmptyState /> : (
          <ul className="flex flex-col divide-y divide-line">
            {d.recent_receipts.map(r => (
              <li key={r.receipt_no} className="flex items-center justify-between h-row gap-2 text-sm">
                <span><Ltr>{r.receipt_no}</Ltr> · <span dir="auto">{r.student}</span></span><Ltr>{fmtMoney(r.total, locale)}</Ltr>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

function TeacherView({ d }) {
  const { t } = useTranslation()
  const term = useTerms()
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <h2 className="font-semibold mb-2">{t('dashboard.my_batches', { unit: term('batches') })}</h2>
        {!d.batches.length ? <EmptyState /> : (
          <ul className="flex flex-col divide-y divide-line" data-testid="teacher-batches">
            {d.batches.map(b => (
              <li key={b.id} className="flex items-center justify-between h-row gap-2 text-sm">
                <span dir="auto">{b.program ? `${b.program} — ` : ''}{b.name}</span>
                {b.attendance_taken ? <StatusBadge status="completed" /> : <Link to="/teacher/attendance" className="text-primary-fg underline">{t('attendance.take')}</Link>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <h2 className="font-semibold mb-2">{t('dashboard.marks_pending')}</h2>
        {!d.marks_pending.length ? <EmptyState /> : (
          <ul className="flex flex-col divide-y divide-line">
            {d.marks_pending.map(p => (
              <li key={`${p.exam_id}-${p.subject_id}`} className="h-row flex items-center text-sm">
                <Link to={`/teacher/marks/${p.exam_id}/${p.subject_id}`} className="text-primary-fg underline" dir="auto">{p.exam} — {p.subject}</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function ParentView({ d }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  if (!d.length) return <EmptyState />
  return d.map(c => (
    <Card key={c.id} className="flex flex-col gap-2" data-testid="parent-child">
      <h2 className="font-semibold" dir="auto">{c.name}{c.batch ? ` · ${c.batch}` : ''}</h2>
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <Link to="/parent/attendance" className="rounded-token [border:1px_solid_var(--line)] p-density hover:bg-primary-soft">
          <p className="text-sm text-content-muted">{t('attendance.parent.rate')}</p>
          <p className="text-lg font-semibold"><Ltr>{c.attendance.percentage == null ? '—' : `${fmtNumber(c.attendance.percentage, locale)}%`}</Ltr></p>
          <p className="text-xs text-content-muted">{t('attendance.status.absent')}: <Ltr>{fmtNumber(c.attendance.absent, locale)}</Ltr></p>
        </Link>
        <Link to="/parent/fees" className="rounded-token [border:1px_solid_var(--line)] p-density hover:bg-primary-soft">
          <p className="text-sm text-content-muted">{t('fees.dues')}</p>
          <p className="text-lg font-semibold"><Ltr>{fmtMoney(c.dues.total, locale)}</Ltr></p>
        </Link>
        <Link to="/parent/results" className="rounded-token [border:1px_solid_var(--line)] p-density hover:bg-primary-soft">
          <p className="text-sm text-content-muted">{t('dashboard.latest_result')}</p>
          <p className="text-lg font-semibold" dir="auto">{c.latest_result
            ? <>{c.latest_result.gpa != null ? <>GPA <Ltr>{Number(c.latest_result.gpa).toFixed(2)}</Ltr></> : <Ltr>{fmtNumber(c.latest_result.percentage, locale)}%</Ltr>}</>
            : '—'}</p>
          {c.latest_result && <p className="text-xs text-content-muted" dir="auto">{c.latest_result.exam}</p>}
        </Link>
      </div>
    </Card>
  ))
}

function SuperView({ d }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const n = (v) => fmtNumber(v, locale)
  const s = d.institutions.by_status
  return (
    <>
      <Grid>
        <StatCard label={t('dashboard.institutions')} value={n(d.institutions.total)} />
        <StatCard label={t('status.active')} value={n(s.active)} />
        <StatCard label={t('dashboard.trial')} value={n(s.trial)} />
        <StatCard label={t('dashboard.signups_30')} value={n(d.signups_30_days)} />
      </Grid>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-semibold mb-2">{t('dashboard.by_type')}</h2>
          <ul className="flex flex-col divide-y divide-line">
            {Object.entries(d.by_type).map(([type, count]) => (
              <li key={type} className="flex justify-between h-row text-sm"><span>{t(`dashboard.types.${type}`)}</span><Ltr>{n(count)}</Ltr></li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="font-semibold mb-2">{t('dashboard.expiring')}</h2>
          {!d.expiring_7_days.length ? <EmptyState /> : (
            <ul className="flex flex-col divide-y divide-line">
              {d.expiring_7_days.map(i => (
                <li key={i.id} className="flex justify-between h-row text-sm"><span dir="auto">{i.name}</span><span>{fmtDate(i.expires_at, locale)}</span></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
