import { plainText } from '../../features/qb/richText'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, RotateCcw, Search } from 'lucide-react'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import QbStatus from '../../features/qb/QbStatus'
import { EmptyState } from '../../components/StateViews'
import Tabs from '../../ui/variants/Tabs'
import { Input } from '../../components/FormField'
import Loader from '../../components/Loader'
import { ErrorState } from '../../components/StateViews'

const STATUSES = ['all', 'draft', 'review', 'rejected', 'published']

// QB.2 /writer/questions (D65): a writer's own questions, a moderator's and the Super Admin's view of everyone's - by status. A
// moderator lands on the review tab (?status=review). Opening a row goes to the editor / review page.
export default function QbQuestions() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const role = useAuthStore(s => s.user?.role)
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? (role === 'content_moderator' ? 'review' : 'all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const q = useQuery({
    queryKey: ['writer', 'questions', status, search, page],
    queryFn: () => api.get('/writer/questions', { params: { status: status === 'all' ? undefined : status, q: search || undefined, page, per_page: 16 } }).then(r => r.data),
  })
  const rows = q.data?.data ?? []
  const meta = q.data?.meta
  const curriculum = useQuery({
    queryKey: ['writer', 'curriculum'],
    queryFn: () => api.get('/writer/curriculum').then(r => r.data.data),
    enabled: rows.length > 0,
  })
  const questionTypes = useQuery({
    queryKey: ['writer', 'question-types'],
    queryFn: () => api.get('/writer/question-types').then(r => r.data.data),
    enabled: rows.length > 0,
  })
  const localizedName = item => i18n.language?.startsWith('en') ? item?.name_en || item?.name_bn : item?.name_bn || item?.name_en
  const subjects = curriculum.data?.subjects ?? []
  const subjectById = Object.fromEntries(subjects.map(item => [item.id, item]))
  const chapterById = Object.fromEntries(subjects.flatMap(item => item.chapters ?? []).map(item => [item.id, item]))
  const topicById = Object.fromEntries(subjects.flatMap(item => item.chapters ?? []).flatMap(chapter => chapter.topics ?? []).map(item => [item.id, item]))
  const classById = Object.fromEntries((curriculum.data?.class_levels ?? []).map(item => [item.id, item]))
  const typeById = Object.fromEntries((questionTypes.data ?? []).map(item => [item.id, item]))
  return (
    <div className="flex flex-col gap-4" data-testid="qb-questions">
      <PageHeader title={t('qb.questions')} actions={role !== 'content_moderator' &&
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate('/writer/questions/start')} data-action="start"><Plus aria-hidden="true" className="h-4 w-4" />{t('qb.new_question')}</Button>
          <Button variant="secondary" onClick={() => navigate('/writer/questions/new')} data-action="new">{t('qbn.straight_to_editor')}</Button>
        </div>} />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <section className="flex min-w-0 flex-col gap-4">
          <Tabs label={t('qb.state')} value={status} onChange={(s) => { setPage(1); setParams({ status: s }) }}
            items={STATUSES.map(s => ({ key: s, label: s === 'all' ? t('qb.all') : t(`qb.status.${s}`) }))} />
          <Card className="flex min-h-20 flex-wrap items-center gap-3 px-5 py-4 shadow-sm">
            <div className="flex-1">
              <p className="font-semibold"><bdi>{meta?.total ?? 0}</bdi> {t('qb.questions')}</p>
              {meta && meta.total > 0 && <p className="text-sm text-content-muted"><bdi>{(meta.current_page - 1) * meta.per_page + 1}–{(meta.current_page - 1) * meta.per_page + rows.length}</bdi> {t('qbaq.displayed')}</p>}
            </div>
          </Card>
          {q.isPending ? <Loader /> : q.isError ? <ErrorState onRetry={q.refetch} /> : rows.length === 0 ? <EmptyState title={t('qb.no_questions')} /> : rows.map((row, index) => (
            <Card key={row.id} className="group flex flex-col gap-0 overflow-hidden p-0 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md" data-question={row.id}>
              <header className="flex flex-wrap items-start gap-3 border-b border-border-subtle bg-surface-muted/30 px-5 py-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-token bg-primary font-semibold text-on-primary"><bdi>{(meta.current_page - 1) * meta.per_page + index + 1}</bdi></span>
                <button type="button" onClick={() => navigate(`/writer/questions/${row.id}`)} className="flex min-w-0 flex-1 flex-col gap-2 text-start" aria-label={t('qb.question_no', { id: row.id })}>
                  <span className="font-semibold text-primary-fg group-hover:text-primary">{t('qb.question_no', { id: row.id })}</span>
                  <span className="flex flex-wrap gap-1.5 text-xs">
                    {[
                      ['type', localizedName(typeById[row.qb_question_type_id])],
                      ['subject', localizedName(subjectById[row.qb_subject_id])],
                      ['chapter', chapterById[row.qb_chapter_id] && t('qbaq.chapter_n', { n: chapterById[row.qb_chapter_id].number ?? '', name: localizedName(chapterById[row.qb_chapter_id]) })],
                      ['topic', localizedName(topicById[row.qb_topic_id])],
                    ].filter(([, label]) => label).map(([key, label]) => (
                      <span key={key} className="rounded-token bg-primary-soft px-2 py-0.5" dir="auto">{label}</span>
                    ))}
                    {role !== 'content_writer' && row.author && <span className="rounded-token bg-primary-soft px-2 py-0.5" dir="auto">{row.author}</span>}
                    <span className="rounded-token bg-primary-soft px-2 py-0.5"><QbStatus status={row.status} /></span>
                  </span>
                </button>
              </header>
              <button type="button" onClick={() => navigate(`/writer/questions/${row.id}`)} className="px-5 py-5 text-start text-base leading-8" dir="auto">
                <span className="line-clamp-3 whitespace-normal [overflow-wrap:anywhere]">{plainText(row.question_text)}</span>
              </button>
              <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-subtle bg-surface-muted/30 px-5 py-3 text-xs text-content-muted">
                <span>{t('qbaq.class')}: <bdi>{(subjectById[row.qb_subject_id]?.class_level_ids ?? []).map(id => localizedName(classById[id])).filter(Boolean).slice(0, 3).join(', ') || '—'}</bdi></span>
                {row.marks != null && <span>{t('qbaq.marks')}: <bdi>{row.marks}</bdi></span>}
                {row.difficulty != null && <span>{t('qbaq.difficulty')}: {t(`qbaq.level.${row.difficulty}`, { defaultValue: row.difficulty })}</span>}
              </footer>
            </Card>
          ))}
          {meta && meta.last_page > 1 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>{t('qbaq.page_of', { page: meta.current_page, last: meta.last_page, n: rows.length })}</span>
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('common.previous')}</Button>
              <Button variant="secondary" disabled={page >= meta.last_page} onClick={() => setPage(p => p + 1)}>{t('common.next')}</Button>
            </div>
          )}
        </section>
        <aside className="flex flex-col gap-3 xl:sticky xl:top-4 xl:self-start" data-testid="qb-question-filter">
          <Card className="flex flex-col gap-3 p-4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-token bg-primary text-on-primary"><Search aria-hidden="true" className="h-4 w-4" /></span>
              <div className="flex-1"><p className="text-xs font-semibold uppercase text-primary-fg">{t('qbaq.filter')}</p><h2 className="font-semibold">{t('qbaq.search_questions')}</h2></div>
              <Button variant="ghost" onClick={() => { setPage(1); setSearch('') }} aria-label={t('qbaq.reset')} data-action="reset-search"><RotateCcw aria-hidden="true" className="h-4 w-4" /></Button>
            </div>
            <Input label={t('qb.search')} value={search} onChange={e => { setPage(1); setSearch(e.target.value) }} name="q" />
          </Card>
        </aside>
      </div>
    </div>
  )
}
