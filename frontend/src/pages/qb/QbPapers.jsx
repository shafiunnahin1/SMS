import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import List from '../../ui/variants/List'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState } from '../../components/StateViews'

// QB.8 /admin|teacher/question-bank/papers (D66): a teacher's own question papers; the head teacher sees every paper of the institution.
export default function QbPapers() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const base = useLocation().pathname.replace(/\/$/, '')
  const role = useAuthStore(s => s.user?.role)
  const q = useQuery({ queryKey: ['qb-papers'], queryFn: () => api.get('/question-bank/papers').then(r => r.data.data) })
  const columns = [
    { key: 'title', label: t('qbpp.title'), primary: true, render: r => <span dir="auto">{r.title}</span> },
    ...(role === 'admin' ? [{ key: 'author', label: t('qbpp.author'), render: r => <span dir="auto">{r.author ?? '—'}</span> }] : []),
    { key: 'total_marks', label: t('qbpp.total_marks'), render: r => <Ltr>{r.total_marks}</Ltr> },
    { key: 'status', label: t('qb.state'), render: r => <span data-status={r.status} className="text-sm">{t(`qbpp.status.${r.status}`)}</span> },
  ]
  return (
    <div className="flex flex-col gap-4" data-testid="qb-papers">
      <PageHeader title={t('qbpp.papers')} actions={<Button onClick={() => navigate(`${base}/new`)} data-action="new"><Plus aria-hidden="true" className="h-4 w-4" />{t('qbpp.new')}</Button>} />
      <Card><List columns={columns} rows={q.data ?? []} loading={q.isPending} error={q.isError} onRetry={q.refetch}
        onRowClick={(r) => navigate(`${base}/${r.id}`)} empty={<EmptyState title={t('qbpp.none')} />} /></Card>
    </div>
  )
}
