import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BookOpen, FileText, Layers, ListTree } from 'lucide-react'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import StatCard from '../../components/StatCard'
import Loader from '../../components/Loader'
import { ErrorState } from '../../components/StateViews'
import { fmtNumber as formatNumber } from '../../i18n/format'

const STATUSES = ['draft', 'review', 'rejected', 'published']

// R2.1.1 /writer/dashboard (D110): qbank's dashboard - a welcome line and the four counters (published questions, subjects,
// chapters, topics) - then the caller's questions by status (a writer's own; everyone's for a moderator), each opening that list.
export default function QbDashboard() {
  const { t, i18n } = useTranslation()
  const user = useAuthStore(s => s.user)
  const q = useQuery({ queryKey: ['writer', 'dashboard'], queryFn: () => api.get('/writer/dashboard').then(r => r.data.data) })
  if (q.isPending) return <Loader type="page" />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  const d = q.data
  const n = (v) => formatNumber(v, i18n.language)
  return (
    <div className="flex flex-col gap-4" data-testid="qb-dashboard">
      <PageHeader title={t('dashboard.title')} subtitle={t('dashboard.hello', { name: user?.name ?? '' })} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('qbd.total_questions')} value={n(d.questions)} icon={FileText} />
        <StatCard label={t('qb.subjects')} value={n(d.subjects)} icon={BookOpen} />
        <StatCard label={t('qb.chapters')} value={n(d.chapters)} icon={Layers} />
        <StatCard label={t('qb.topics')} value={n(d.topics)} icon={ListTree} />
      </div>
      <Card>
        <h2 className="mb-3 font-semibold">{user?.role === 'content_writer' ? t('qbd.my_questions') : t('qbd.all_questions')}</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {STATUSES.map(s => (
            <li key={s}>
              <Link to={`/writer/questions?status=${s}`} data-status={s}
                className="flex items-center justify-between gap-2 rounded-token [border:1px_solid_var(--line)] p-3 hover:bg-surface-muted">
                <span>{t(`qb.status.${s}`)}</span><span className="font-semibold" dir="ltr">{n(d.by_status[s])}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
