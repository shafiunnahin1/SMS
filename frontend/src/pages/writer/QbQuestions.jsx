import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import QbStatus from '../../features/qb/QbStatus'
import { EmptyState } from '../../components/StateViews'
import List from '../../ui/variants/List'
import Tabs from '../../ui/variants/Tabs'
import { Input } from '../../components/FormField'

const STATUSES = ['all', 'draft', 'review', 'rejected', 'published']

// QB.2 /writer/questions (D65): a writer's own questions, a moderator's and the Super Admin's view of everyone's - by status. A
// moderator lands on the review tab (?status=review). Opening a row goes to the editor / review page.
export default function QbQuestions() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const role = useAuthStore(s => s.user?.role)
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? (role === 'content_moderator' ? 'review' : 'all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const q = useQuery({
    queryKey: ['writer', 'questions', status, search, page],
    queryFn: () => api.get('/writer/questions', { params: { status: status === 'all' ? undefined : status, q: search || undefined, page } }).then(r => r.data),
  })
  const columns = [
    { key: 'question_text', label: t('qb.question'), primary: true, render: r => <span dir="auto" className="line-clamp-2 whitespace-normal [overflow-wrap:anywhere]">{r.question_text}</span> },
    ...(role === 'content_writer' ? [] : [{ key: 'author', label: t('qb.author'), render: r => <span dir="auto">{r.author ?? '—'}</span> }]),
    { key: 'status', label: t('qb.state'), render: r => <QbStatus status={r.status} /> },
  ]
  return (
    <div className="flex flex-col gap-4" data-testid="qb-questions">
      <PageHeader title={t('qb.questions')} actions={role !== 'content_moderator' &&
        <Button onClick={() => navigate('/writer/questions/new')} data-action="new"><Plus aria-hidden="true" className="h-4 w-4" />{t('qb.new_question')}</Button>} />
      <Tabs label={t('qb.state')} value={status} onChange={(s) => { setPage(1); setParams({ status: s }) }}
        items={STATUSES.map(s => ({ key: s, label: s === 'all' ? t('qb.all') : t(`qb.status.${s}`) }))} />
      <Input label={t('qb.search')} value={search} onChange={e => { setPage(1); setSearch(e.target.value) }} name="q" />
      <Card>
        <List columns={columns} rows={q.data?.data ?? []} loading={q.isPending} error={q.isError} onRetry={q.refetch}
          onRowClick={(r) => navigate(`/writer/questions/${r.id}`)} empty={<EmptyState title={t('qb.no_questions')} />}
          pagination={q.data?.meta ? { page: q.data.meta.current_page, last: q.data.meta.last_page, onChange: setPage } : null} />
      </Card>
    </div>
  )
}
