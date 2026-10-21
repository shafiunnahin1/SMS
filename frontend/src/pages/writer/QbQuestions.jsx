import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronDown, Plus, RotateCcw, Search, X } from 'lucide-react'
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
import MathText from '../../features/qb/MathText'
import { breadcrumbLabel, sourceLabel } from '../../features/qb/curriculum'

const PER_PAGE = 16
const LABELS = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ']

const STATUSES = ['all', 'draft', 'review', 'rejected', 'published']

// QB.2 /writer/questions (D65): a writer's own questions, a moderator's and the Super Admin's view of everyone's - by status. A
// moderator lands on the review tab (?status=review). Opening a row goes to the editor / review page.
export default function QbQuestions() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const role = useAuthStore(s => s.user?.role)
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? (role === 'content_moderator' ? 'review' : 'all')
  const [filters, setFilters] = useState({ q: '', class_level_ids: [], subject_ids: [], chapter_ids: [], topic_ids: [], curriculum_node_ids: [], question_type_ids: [], source_types: [], years: [] })
  const [page, setPage] = useState(1)
  const [shown, setShown] = useState(() => new Set())
  const q = useQuery({
    queryKey: ['writer', 'questions', status, filters, page],
    queryFn: () => api.get('/writer/questions', { params: { ...filters, q: filters.q || undefined, status: status === 'all' ? undefined : status, page, per_page: PER_PAGE } }).then(r => r.data),
  })
  const rows = q.data?.data ?? []
  const meta = q.data?.meta
  const curriculum = useQuery({
    queryKey: ['writer', 'curriculum'],
    queryFn: () => api.get('/writer/curriculum').then(r => r.data.data),
    enabled: true,
  })
  const questionTypes = useQuery({
    queryKey: ['writer', 'question-types'],
    queryFn: () => api.get('/writer/question-types').then(r => r.data.data),
    enabled: true,
  })
  const localizedName = item => i18n.language?.startsWith('en') ? item?.name_en || item?.name_bn : item?.name_bn || item?.name_en
  const subjects = curriculum.data?.subjects ?? []
  const setFilter = (key, value) => { setPage(1); setFilters(old => {
    const next = { ...old, [key]: value }
    if (key === 'class_level_ids') { next.subject_ids = []; next.chapter_ids = []; next.topic_ids = []; next.curriculum_node_ids = [] }
    if (key === 'subject_ids') { next.chapter_ids = []; next.topic_ids = []; next.curriculum_node_ids = [] }
    if (key === 'chapter_ids') next.topic_ids = []
    return next
  }) }
  const resetFilters = () => { setPage(1); setFilters({ q: '', class_level_ids: [], subject_ids: [], chapter_ids: [], topic_ids: [], curriculum_node_ids: [], question_type_ids: [], source_types: [], years: [] }) }
  const availableSubjects = useMemo(() => subjects.filter(s => !filters.class_level_ids.length || (s.class_level_ids ?? []).some(id => filters.class_level_ids.includes(id))), [subjects, filters.class_level_ids])
  const availableChapters = availableSubjects.filter(s => filters.subject_ids.includes(s.id)).flatMap(s => s.chapters ?? [])
    .filter(c => !filters.class_level_ids.length || !c.class_level_ids?.length || c.class_level_ids.some(id => filters.class_level_ids.includes(id)))
  const availableTopics = availableChapters.filter(c => filters.chapter_ids.includes(c.id)).flatMap(c => c.topics ?? [])
  const facets = meta?.facets ?? { question_types: [], source_types: [], years: [] }
  const activeFilters = ['class_level_ids', 'subject_ids', 'chapter_ids', 'topic_ids', 'curriculum_node_ids', 'question_type_ids', 'source_types', 'years'].reduce((n, k) => n + filters[k].length, 0) + Number(Boolean(filters.q))
  const subjectById = Object.fromEntries(subjects.map(item => [item.id, item]))
  const chapterById = Object.fromEntries(subjects.flatMap(item => item.chapters ?? []).map(item => [item.id, item]))
  const topicById = Object.fromEntries(subjects.flatMap(item => item.chapters ?? []).flatMap(chapter => chapter.topics ?? []).map(item => [item.id, item]))
  const classById = Object.fromEntries((curriculum.data?.class_levels ?? []).map(item => [item.id, item]))
  const typeById = Object.fromEntries((questionTypes.data ?? []).map(item => [item.id, item]))
  const curriculumVersions = (curriculum.data?.curriculum_versions ?? []).filter(v => filters.subject_ids.includes(v.qb_subject_id))
  const curriculumOptions = curriculumVersions.flatMap(v => flattenCurriculum(v.nodes, [], localizedName))
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
                      ['type', localizedName(typeById[row.qb_question_type_id] ?? facets.question_types.find(x => x.id === row.qb_question_type_id))],
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
              <div className="flex flex-col gap-3 border-t border-border-subtle px-5 py-4">
                <button type="button" onClick={() => navigate(`/writer/questions/${row.id}`)} className="text-start text-base leading-8" dir="auto">
                  <span className="line-clamp-3 whitespace-normal [overflow-wrap:anywhere]"><MathText text={row.question_text} media={row.media ?? []} /></span>
                </button>
                {(row.options ?? []).length > 0 && <ol className="grid gap-2 sm:grid-cols-2">{row.options.map((option, k) => (
                  <li key={option.id ?? k} className={`flex min-h-12 items-center gap-3 rounded-token border border-border-subtle bg-surface-muted/30 px-3 py-2 ${shown.has(row.id) && option.is_correct ? 'bg-primary-soft' : ''}`}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs">{LABELS[k] ?? k + 1}</span><MathText text={option.content_text} media={row.media ?? []} />
                  </li>))}</ol>}
                {(row.creative_parts ?? []).length > 0 && <ol className="flex flex-col gap-1">{row.creative_parts.map((part, k) => <li key={part.part_label ?? k}><span className="font-medium">{part.part_label}.</span> <MathText text={part.question_text} /></li>)}</ol>}
                {(row.stimuli ?? []).map((stimulus, k) => stimulus.content_text && <div key={stimulus.id ?? k} className="rounded-token bg-surface-muted/40 p-3"><MathText text={stimulus.content_text} media={row.media ?? []} /></div>)}
                {(row.items ?? []).length > 0 && <ol className="flex flex-col gap-1">{row.items.map((item, k) => <li key={k}><MathText text={item.prompt_text} media={row.media ?? []} /></li>)}</ol>}
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" onClick={() => setShown(old => { const next = new Set(old); next.has(row.id) ? next.delete(row.id) : next.add(row.id); return next })} aria-expanded={shown.has(row.id)} data-action="toggle-answer">
                    {shown.has(row.id) ? t('qbaq.hide_answer') : t('qbaq.show_answer')}<ChevronDown aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </div>
                {shown.has(row.id) && <div className="flex flex-col gap-2 rounded-token bg-primary-soft p-3 text-sm" data-testid="qb-answer">
                  {row.options?.some(option => option.is_correct) && <div><p className="font-semibold">{t('qbaq.correct')}</p><div className="flex flex-wrap gap-2">{row.options.map((option, k) => option.is_correct && <span key={k}>{LABELS[k] ?? k + 1} <MathText text={option.content_text} media={row.media ?? []} /></span>)}</div></div>}
                  {row.answer_text && <div><p className="font-semibold">{t('qb.answer')}</p><MathText text={row.answer_text} media={row.media ?? []} /></div>}
                  {row.explanation_text && <div><p className="font-semibold">{t('qbaq.explanation')}</p><MathText text={row.explanation_text} media={row.media ?? []} /></div>}
                  {(row.creative_parts ?? []).some(part => part.answer_text) && row.creative_parts.filter(part => part.answer_text).map((part, k) => <div key={k}><p className="font-semibold">{part.part_label}. {t('qb.answer')}</p><MathText text={part.answer_text} media={row.media ?? []} /></div>)}
                  {(row.items ?? []).some(item => item.answer_json != null) && row.items.filter(item => item.answer_json != null).map((item, k) => <div key={k}><p className="font-semibold">{t('qb.answer')}</p><pre className="whitespace-pre-wrap font-sans">{typeof item.answer_json === 'string' ? item.answer_json : JSON.stringify(item.answer_json)}</pre></div>)}
                </div>}
              </div>
              <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-subtle bg-surface-muted/30 px-5 py-3 text-xs text-content-muted">
                <span>{t('qbaq.class')}: <bdi>{(subjectById[row.qb_subject_id]?.class_level_ids ?? []).map(id => localizedName(classById[id])).filter(Boolean).slice(0, 3).join(', ') || '—'}</bdi></span>
                {row.marks != null && <span>{t('qbaq.marks')}: <bdi>{row.marks}</bdi></span>}
                {row.difficulty != null && <span>{t('qbaq.difficulty')}: {t(`qbaq.level.${row.difficulty}`, { defaultValue: row.difficulty })}</span>}
                {(row.curriculum_breadcrumbs ?? []).map((crumb, i) => <span key={`${crumb.node_id}-${i}`} dir="auto" className="break-words" data-testid="row-curriculum">{breadcrumbLabel(crumb, locale)}</span>)}
                <span className="rounded-token bg-surface-muted px-2 py-0.5" dir="auto">{row.occurrences?.[0] ? sourceLabel(row.occurrences[0], t) : t('qbaq.no_source')}</span>
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
          <Card className="flex max-h-[calc(100vh-2rem)] flex-col gap-3 overflow-y-auto p-4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-token bg-primary text-on-primary"><Search aria-hidden="true" className="h-4 w-4" /></span>
              <div className="flex-1"><p className="text-xs font-semibold uppercase text-primary-fg">{t('qbaq.filter')}</p><h2 className="font-semibold">{t('qbaq.search_questions')}</h2></div>
              {activeFilters > 0 && <span className="rounded-token bg-primary-soft px-2 text-xs">{t('qbaq.active_n', { n: activeFilters })}</span>}
              <Button variant="ghost" onClick={resetFilters} aria-label={t('qbaq.reset')} data-action="reset"><RotateCcw aria-hidden="true" className="h-4 w-4" /></Button>
            </div>
            <Input label={t('qbaq.search')} value={filters.q} onChange={e => setFilter('q', e.target.value)} name="q" placeholder={t('qbaq.search_hint')} />
            <Multi label={t('qbaq.class')} name="class" value={filters.class_level_ids} onChange={v => setFilter('class_level_ids', v)} options={(curriculum.data?.class_levels ?? []).map(c => ({ value: c.id, label: localizedName(c) }))} />
            <Multi label={t('qbaq.subject')} name="subject" value={filters.subject_ids} onChange={v => setFilter('subject_ids', v)} options={availableSubjects.map(s => ({ value: s.id, label: localizedName(s) }))} />
            <Multi label={t('qbaq.chapter')} name="chapter" value={filters.chapter_ids} onChange={v => setFilter('chapter_ids', v)} disabled={!filters.subject_ids.length} options={availableChapters.map(c => ({ value: c.id, label: localizedName(c) }))} />
            <Multi label={t('qbaq.topic')} name="topic" value={filters.topic_ids} onChange={v => setFilter('topic_ids', v)} disabled={!filters.chapter_ids.length} options={availableTopics.map(item => ({ value: item.id, label: localizedName(item) }))} />
            {curriculumOptions.length > 0 && <Multi label={t('qbed.curriculum_path')} name="curriculum" value={filters.curriculum_node_ids} onChange={v => setFilter('curriculum_node_ids', v)} options={curriculumOptions} />}
            <Multi label={t('qbaq.type')} name="type" value={filters.question_type_ids} onChange={v => setFilter('question_type_ids', v)} options={facets.question_types.map(item => ({ value: item.id, label: localizedName(item) }))} />
            <Multi label={t('qbaq.source')} name="source" value={filters.source_types} onChange={v => setFilter('source_types', v)} options={facets.source_types.map(item => ({ value: item, label: item }))} />
            <Multi label={t('qbaq.year')} name="year" value={filters.years} onChange={v => setFilter('years', v)} options={facets.years.map(item => ({ value: item, label: String(item) }))} />
          </Card>
        </aside>
      </div>
    </div>
  )
}

function flattenCurriculum(nodes, parents, name) {
  return (nodes ?? []).flatMap(node => {
    const path = [...parents, name(node)]
    return [{ value: node.id, label: path.join(' / ') }, ...flattenCurriculum(node.children, path, name)]
  })
}

function Multi({ label, name, value, onChange, options, disabled = false }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const chosen = options.filter(option => value.includes(option.value))
  const visible = options.filter(option => !search || String(option.label).toLowerCase().includes(search.toLowerCase()))
  return <div className="flex flex-col gap-1" data-filter={name}>
    <span className="text-sm font-medium">{label}</span>
    <div className={`flex flex-wrap items-center gap-1 rounded-token border p-1 ${disabled ? 'opacity-50' : ''}`}>
      {chosen.map(option => <span key={option.value} className="flex items-center gap-1 rounded-token bg-primary px-2 py-0.5 text-xs text-on-primary" dir="auto">{option.label}<button type="button" aria-label={t('qbaq.remove', { x: option.label })} onClick={() => onChange(value.filter(item => item !== option.value))}><X aria-hidden="true" className="h-3 w-3" /></button></span>)}
      <button type="button" disabled={disabled} onClick={() => setOpen(current => !current)} aria-expanded={open} aria-label={label} className="flex flex-1 items-center gap-1 p-1 text-sm text-content-muted">
        {chosen.length === 0 && <span className="flex-1 text-start">{t('qbaq.pick')}</span>}<ChevronDown aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
    {open && !disabled && <div className="flex max-h-60 flex-col gap-1 overflow-auto rounded-token border p-2">
      <input className="rounded-token border px-2 py-1 text-sm" placeholder={t('qbaq.search')} value={search} onChange={event => setSearch(event.target.value)} aria-label={t('qbaq.search')} />
      {visible.length === 0 ? <p className="text-xs text-content-muted">{t('qbaq.no_choices')}</p> : visible.map(option => <label key={option.value} className="flex items-center gap-2 text-sm" dir="auto"><input type="checkbox" checked={value.includes(option.value)} onChange={() => onChange(value.includes(option.value) ? value.filter(item => item !== option.value) : [...value, option.value])} />{option.label}</label>)}
    </div>}
  </div>
}
