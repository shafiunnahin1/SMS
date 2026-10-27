import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronDown, FolderPlus, RotateCcw, Save, Search, X } from 'lucide-react'
import api from '../../api/axios'
import { useLocale } from '../../ui/I18nProvider'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input } from '../../components/FormField'
import MathText from '../../features/qb/MathText'
import BuyButton from '../../features/qb/BuyButton'
import CurriculumPicker from '../../features/qb/CurriculumPicker'
import { flattenCurriculum, versionsForSubject } from '../../features/qb/curriculum'

// R2.1.5 / D133 (D110) /admin|teacher/question-bank/all-questions: qbank's All Questions - the question cards beside qbank's
// "Search questions" filter (search, class, subject, chapter, topic, question type, source, year; many at a time, each narrowing
// the next), "Select all" on the page, a selection kept across pages, and the floating "create paper (N)" with the paper's name.
// ?paper=<id> opens it for that paper: its questions start selected and the button updates it. A paper is a qbank "question set".
const PER_PAGE = 16
const LABELS = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ']

export default function QbAllQuestions() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const area = useLocation().pathname.replace(/\/question-bank(?:\/all-questions)?\/?$/, '')
  const [params] = useSearchParams()
  const paperId = params.get('paper')
  const [f, setF] = useState({ q: '', class_level_ids: [], subject_ids: [], chapter_ids: [], topic_ids: [], curriculum_node_ids: [], question_type_ids: [], source_types: [], years: [] })
  const [page, setPage] = useState(1)
  const [picked, setPicked] = useState(() => new Map())     // id -> the question row (type and marks are needed to build the paper)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState(() => new Set())      // cards whose answer panel is open
  const tree = useQuery({ queryKey: ['qb-library', 'curriculum'], queryFn: () => api.get('/question-bank/curriculum').then(r => r.data.data) })
  const list = useQuery({ queryKey: ['qb-all-questions', f, page], placeholderData: (prev) => prev,
    queryFn: () => api.get('/question-bank/questions', { params: { ...f, q: f.q || undefined, page, per_page: PER_PAGE, facets: 1 } }).then(r => r.data) })
  const paper = useQuery({ queryKey: ['qb-paper', paperId], enabled: Boolean(paperId), queryFn: () => api.get(`/question-bank/papers/${paperId}`).then(r => r.data.data) })
  useEffect(() => {                                           // "add questions" to a paper: its questions start selected
    if (!paper.data) return
    const ids = paper.data.sections.flatMap(s => s.items.map(i => i.qb_question_id))
    Promise.all(ids.map(id => api.get(`/question-bank/questions/${id}`).then(r => r.data.data).catch(() => null)))
      .then(rows => setPicked(new Map(rows.filter(Boolean).map(q => [q.id, q]))))
  }, [paper.data])

  const nm = (n) => (locale === 'bn' ? n?.name_bn : n?.name_en) || n?.name_bn || n?.name_en || ''
  const toast = (m, k) => useUiStore.getState().addToast(m, k)
  const set = (k, v) => { setPage(1); setF(x => {
    const next = { ...x, [k]: v }
    if (k === 'class_level_ids') { next.subject_ids = []; next.chapter_ids = []; next.topic_ids = []; next.curriculum_node_ids = [] }   // qbank cascades
    if (k === 'subject_ids') { next.chapter_ids = []; next.topic_ids = []; next.curriculum_node_ids = [] }
    if (k === 'chapter_ids') next.topic_ids = []
    return next
  }) }
  const reset = () => { setPage(1); setF({ q: '', class_level_ids: [], subject_ids: [], chapter_ids: [], topic_ids: [], curriculum_node_ids: [], question_type_ids: [], source_types: [], years: [] }) }

  const subjects = useMemo(() => (tree.data?.subjects ?? []).filter(s => !f.class_level_ids.length || s.class_level_ids.some(id => f.class_level_ids.includes(id))), [tree.data, f.class_level_ids])
  const chapters = subjects.filter(s => f.subject_ids.includes(s.id)).flatMap(s => s.chapters)
    .filter(c => !f.class_level_ids.length || !c.class_level_ids.length || c.class_level_ids.some(id => f.class_level_ids.includes(id)))
  const topics = chapters.filter(c => f.chapter_ids.includes(c.id)).flatMap(c => c.topics)
  const activeVersions = (tree.data?.curriculum_versions ?? []).filter(version => version.is_active)
  const languageSubjectIds = new Set(f.class_level_ids.length
    ? f.subject_ids.filter(subjectId => versionsForSubject(activeVersions, subjectId, f.class_level_ids).length > 0)
    : [])
  const hasLanguageSubjects = languageSubjectIds.size > 0
  const onlyLanguageSubjects = f.subject_ids.length > 0 && languageSubjectIds.size === f.subject_ids.length
  const curriculumVersions = [...new Map([...languageSubjectIds].flatMap(subjectId =>
    versionsForSubject(activeVersions, subjectId, f.class_level_ids),
  ).map(version => [version.id, version])).values()]
  const curriculumRows = flattenCurriculum(curriculumVersions, nm)
  const facets = list.data?.meta?.facets ?? { question_types: [], source_types: [], years: [] }
  const byId = (arr) => Object.fromEntries((arr ?? []).map(x => [x.id, x]))
  const allSubjects = byId(tree.data?.subjects)
  const allChapters = byId((tree.data?.subjects ?? []).flatMap(s => s.chapters))
  const allTopics = byId((tree.data?.subjects ?? []).flatMap(s => s.chapters.flatMap(c => c.topics)))
  const classes = byId(tree.data?.class_levels)
  const types = byId(facets.question_types)
  const active = ['class_level_ids', 'subject_ids', 'chapter_ids', 'topic_ids', 'curriculum_node_ids', 'question_type_ids', 'source_types', 'years'].reduce((n, k) => n + f[k].length, 0) + (f.q ? 1 : 0)

  const rows = list.data?.data ?? []
  const meta = list.data?.meta
  const selectable = rows.filter(q => q.unlocked)
  const allOnPage = selectable.length > 0 && selectable.every(q => picked.has(q.id))
  const someOnPage = selectable.some(q => picked.has(q.id))
  const toggle = (q) => {
    if (!q.unlocked) return
    setPicked(m => { const n = new Map(m); n.has(q.id) ? n.delete(q.id) : n.set(q.id, q); return n })
  }
  const toggleAll = () => setPicked(m => {
    const n = new Map(m)
    selectable.forEach(q => (allOnPage ? n.delete(q.id) : n.set(q.id, q)))
    return n
  })
  const code = (q) => [allSubjects[q.qb_subject_id]?.code || 'Q', (types[q.qb_question_type_id]?.slug || 'q').toUpperCase(), String(q.id).padStart(6, '0')].join('-')

  // the paper's sections are the question types, in the order first picked (qbank prints one heading per type)
  const sections = () => {
    const groups = new Map()
    for (const q of picked.values()) {
      const key = q.qb_question_type_id
      if (!groups.has(key)) groups.set(key, { title: nm(types[key]) || t('qbaq.questions'), instruction: null, items: [] })
      groups.get(key).items.push({ qb_question_id: q.id, marks: String(Number(q.marks) || 1) })
    }
    return [...groups.values()]
  }
  const save = async () => {
    if (picked.size === 0) { toast(t('qbaq.pick_first'), 'error'); return }
    setBusy(true)
    try {
      const p = paper.data
      // owner 2026-10-24: the one class picked in the filter is the paper's class (its heading shows it)
      const pickedClass = f.class_level_ids.length === 1 ? { class_level_id: f.class_level_ids[0] } : {}
      const body = p
        ? { title: p.title, exam_name: p.exam_name, program_id: p.program_id, qb_subject_id: p.qb_subject_id, duration_minutes: p.duration_minutes, instructions_json: { ...(p.instructions_json ?? {}), ...pickedClass }, sets_count: p.sets_count, sections: sections() }
        : { title: name.trim(), sets_count: 1, instructions_json: pickedClass, sections: sections() }
      const { data } = p ? await api.put(`/question-bank/papers/${p.id}`, body) : await api.post('/question-bank/papers', body)
      toast(t('common.saved'))
      qc.invalidateQueries({ queryKey: ['qb-papers'] })
      navigate(`${area}/question-bank/papers/${data.data.id}`)
    } catch (e) {
      const d = e.response?.data
      if (d?.error === 'qb_paper_unbought') {
        useUiStore.getState().openConfirm({ title: t('qbpp.unbought_title', { n: d.data.ids.length, total: d.data.total }), description: t('qbpp.unbought_hint'), type: 'info', confirmLabel: t('qbb.buy'),
          onConfirm: async () => { try { await api.post('/question-bank/buy-many', { question_ids: d.data.ids }); await save() } catch (err) { toast(err.response?.data?.message ?? t('qbb.failed'), 'error') } } })
      } else toast(Object.values(d?.errors ?? {})[0]?.[0] ?? d?.message ?? t('common.error'), 'error')
    } finally { setBusy(false) }
  }

  if (tree.isPending) return <Loader type="page" />
  if (tree.isError) return <ErrorState onRetry={tree.refetch} />
  return (
    <div className="flex flex-col gap-4" data-testid="qb-all-questions">
      <PageHeader title={paper.data ? t('qbaq.add_to', { title: paper.data.title }) : t('qbaq.title')} />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <section className="flex min-w-0 flex-col gap-4">
          <Card className="flex min-h-20 flex-wrap items-center gap-3 px-5 py-4 shadow-sm">
            <div className="flex-1">
              <p className="font-semibold"><Ltr>{meta?.total ?? 0}</Ltr> {t('qbaq.questions')}</p>
              {meta && meta.total > 0 && <p className="text-sm text-content-muted"><Ltr>{(meta.current_page - 1) * meta.per_page + 1}–{(meta.current_page - 1) * meta.per_page + rows.length}</Ltr> {t('qbaq.displayed')}</p>}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="select_all" checked={allOnPage} disabled={selectable.length === 0} ref={el => { if (el) el.indeterminate = !allOnPage && someOnPage }} onChange={toggleAll} />{t('qbaq.select_all')}
            </label>
          </Card>
          {list.isPending ? <Loader /> : list.isError ? <ErrorState onRetry={list.refetch} /> : rows.length === 0 ? <EmptyState title={t('qbaq.none')} /> : rows.map((q, i) => (
            <Card key={q.id} className="flex flex-col gap-0 overflow-hidden p-0 shadow-sm" data-question={q.id}>
              <header className="flex flex-wrap items-start gap-3 bg-surface-muted/40 px-5 py-4">
                <input type="checkbox" aria-label={t('qbaq.select_q', { n: code(q) })} title={!q.unlocked ? t('qbaq.buy_to_select') : undefined} checked={picked.has(q.id)} disabled={!q.unlocked} onChange={() => toggle(q)} className="mt-2 h-5 w-5" name={`q-${q.id}`} />
                <span className="flex h-9 w-9 items-center justify-center rounded-token bg-primary font-semibold text-on-primary"><Ltr>{(meta.current_page - 1) * meta.per_page + i + 1}</Ltr></span>
                <div className="flex flex-col gap-1">
                  <Ltr className="font-semibold">{code(q)}</Ltr>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {[nm(types[q.qb_question_type_id]), nm(allSubjects[q.qb_subject_id]), allChapters[q.qb_chapter_id] && t('qbaq.chapter_n', { n: allChapters[q.qb_chapter_id].number ?? '', name: nm(allChapters[q.qb_chapter_id]) }), nm(allTopics[q.qb_topic_id])]
                      .filter(Boolean).map(x => <span key={x} className="rounded-token bg-primary-soft px-2 py-0.5" dir="auto">{x}</span>)}
                  </div>
                </div>
              </header>
              <div className="flex flex-col gap-3 border-t border-border-subtle px-5 py-4">
                <div className="text-base leading-8"><MathText text={q.question_text} media={q.media ?? []} /></div>
                {q.options.length > 0 && (
                  <ol className="grid gap-2 sm:grid-cols-2">
                    {q.options.map((o, k) => (
                      <li key={k} className={`flex min-h-12 items-center gap-3 rounded-token border border-border-subtle bg-surface-muted/30 px-3 py-2 ${shown.has(q.id) && o.is_correct ? 'bg-primary-soft' : ''}`}>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs">{LABELS[k] ?? k + 1}</span>
                        <MathText text={o.content_text} />
                      </li>
                    ))}
                  </ol>
                )}
                {(q.creative_parts ?? []).length > 0 && <ol className="flex flex-col gap-1">{q.creative_parts.map(p => <li key={p.part_label}><span className="font-medium">{p.part_label}.</span> <MathText text={p.question_text} /></li>)}</ol>}
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" onClick={() => setShown(s => { const n = new Set(s); n.has(q.id) ? n.delete(q.id) : n.add(q.id); return n })} aria-expanded={shown.has(q.id)} data-action="toggle-answer">
                    {shown.has(q.id) ? t('qbaq.hide_answer') : t('qbaq.show_answer')}<ChevronDown aria-hidden="true" className="h-4 w-4" />
                  </Button>
                  {!q.unlocked && <BuyButton type="question" id={q.id} />}
                </div>
                {shown.has(q.id) && (q.unlocked ? (
                  <div className="flex flex-col gap-2 rounded-token bg-primary-soft p-3 text-sm" data-testid="qb-answer">
                    {q.options.some(o => o.is_correct) && <div><p className="font-semibold">{t('qbaq.correct')}</p><div className="flex flex-wrap gap-2">{q.options.map((o, k) => o.is_correct && <span key={k}>{LABELS[k]} <MathText text={o.content_text} /></span>)}</div></div>}
                    {q.answer_text && <div><p className="font-semibold">{t('qb.answer')}</p><MathText text={q.answer_text} /></div>}
                    {q.explanation_text && <div><p className="font-semibold">{t('qbaq.explanation')}</p><MathText text={q.explanation_text} /></div>}
                  </div>
                ) : <p className="text-sm text-content-muted" role="status">{t('qbaq.locked')}</p>)}
              </div>
              <footer className="flex flex-wrap items-center gap-3 border-t border-border-subtle bg-surface-muted/50 px-5 py-3 text-xs text-content-muted">
                <span>{t('qbaq.class')}: {q.class_level_ids.slice(0, 3).map(id => nm(classes[id])).filter(Boolean).join(', ') || '—'}</span>
                <span>{t('qbaq.marks')}: <Ltr>{q.marks}</Ltr></span>
                <span>{t('qbaq.difficulty')}: {t(`qbaq.level.${q.difficulty}`)}</span>
                <span className="flex-1" aria-hidden="true" />
                <span className="rounded-token bg-surface-muted px-2 py-0.5" dir="auto">
                  {q.sources[0] ? [q.sources[0].board, q.sources[0].institution_name, q.sources[0].exam_type, q.sources[0].year].filter(Boolean).join(' · ') : t('qbaq.no_source')}
                </span>
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

        <aside className="flex flex-col gap-3 xl:sticky xl:top-4 xl:self-start" data-testid="qb-filter">
          <Card className="flex max-h-[calc(100vh-2rem)] flex-col gap-3 overflow-y-auto p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-token bg-primary text-on-primary"><Search aria-hidden="true" className="h-4 w-4" /></span>
              <div className="flex-1"><p className="text-xs font-semibold uppercase text-primary-fg">{t('qbaq.filter')}</p><h2 className="font-semibold">{t('qbaq.search_questions')}</h2></div>
              {active > 0 && <span className="rounded-token bg-primary-soft px-2 text-xs">{t('qbaq.active_n', { n: active })}</span>}
              <Button variant="ghost" onClick={reset} aria-label={t('qbaq.reset')} data-action="reset"><RotateCcw aria-hidden="true" className="h-4 w-4" /></Button>
            </div>
            <Input label={t('qbaq.search')} name="q" value={f.q} onChange={e => set('q', e.target.value)} placeholder={t('qbaq.search_hint')} />
            <Multi label={t('qbaq.class')} name="class" value={f.class_level_ids} onChange={v => set('class_level_ids', v)} options={(tree.data.class_levels ?? []).map(c => ({ value: c.id, label: nm(c) }))} />
            <Multi label={t('qbaq.subject')} name="subject" value={f.subject_ids} onChange={v => set('subject_ids', v)} options={subjects.map(s => ({ value: s.id, label: nm(s) }))} />
            {!onlyLanguageSubjects && <>
              <Multi label={t('qbaq.chapter')} name="chapter" value={f.chapter_ids} onChange={v => set('chapter_ids', v)} disabled={f.subject_ids.length === 0} options={chapters.map(c => ({ value: c.id, label: nm(c) }))} />
              <Multi label={t('qbaq.topic')} name="topic" value={f.topic_ids} onChange={v => set('topic_ids', v)} disabled={f.chapter_ids.length === 0} options={topics.map(x => ({ value: x.id, label: nm(x) }))} />
            </>}
            {hasLanguageSubjects && <CurriculumPicker label={t('qbed.curriculum_path')} name="curriculum-filter"
              rows={curriculumRows} versions={curriculumVersions.map(version => ({ ...version, label: nm(version) || version.version_key }))}
              value={f.curriculum_node_ids.map(String)} onChange={ids => set('curriculum_node_ids', ids)} />}
            <Multi label={t('qbaq.type')} name="type" value={f.question_type_ids} onChange={v => set('question_type_ids', v)} options={facets.question_types.map(x => ({ value: x.id, label: nm(x) }))} />
            <Multi label={t('qbaq.source')} name="source" value={f.source_types} onChange={v => set('source_types', v)} options={facets.source_types.map(x => ({ value: x, label: x }))} />
            <Multi label={t('qbaq.year')} name="year" value={f.years} onChange={v => set('years', v)} options={facets.years.map(x => ({ value: x, label: String(x) }))} />
          </Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-6 z-20 flex flex-col items-center gap-2 px-4" data-testid="qb-create-paper">
        {naming && !paper.data && (
          <Card className="flex w-full max-w-md items-end gap-2 shadow-lg">
            <Input className="flex-1" label={t('qbaq.paper_name')} name="paper_name" value={name} maxLength={200} placeholder={t('qbaq.paper_name_hint')} onChange={e => setName(e.target.value)} autoFocus />
            <Button onClick={save} loading={busy} disabled={!name.trim()} aria-label={t('common.save')} data-action="save-paper"><Save aria-hidden="true" className="h-4 w-4" /></Button>
            <Button variant="ghost" onClick={() => setNaming(false)} aria-label={t('common.cancel')}><X aria-hidden="true" className="h-4 w-4" /></Button>
          </Card>
        )}
        {/* the name field never closes from this button (a second or double click used to hide it): open -> save a named paper, else focus the name */}
        <Button onClick={() => (picked.size === 0 ? toast(t('qbaq.pick_first'), 'error') : paper.data ? save() : !naming ? setNaming(true)
          : name.trim() ? save() : document.querySelector('input[name="paper_name"]')?.focus())} loading={busy && Boolean(paper.data)} className="shadow-lg" data-action="create-paper">
          <FolderPlus aria-hidden="true" className="h-4 w-4" />{paper.data ? t('qbaq.update_paper') : t('qbaq.create_paper')}
          <span className="rounded-full bg-surface px-2 text-xs text-content"><Ltr>{picked.size}</Ltr></span>
        </Button>
      </div>
    </div>
  )
}

/** qbank's multi-select dropdown: the chosen values as chips, a search box and a checkbox list */
function Multi({ label, name, value, onChange, options, disabled = false }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const chosen = options.filter(o => value.includes(o.value))
  const shown = options.filter(o => !q || String(o.label).toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="flex flex-col gap-1" data-filter={name}>
      <span className="text-sm font-medium">{label}</span>
      <div className={`flex flex-wrap items-center gap-1 rounded-token border p-1 ${disabled ? 'opacity-50' : ''}`}>
        {chosen.map(o => (
          <span key={o.value} className="flex items-center gap-1 rounded-token bg-primary px-2 py-0.5 text-xs text-on-primary" dir="auto">
            {o.label}<button type="button" aria-label={t('qbaq.remove', { x: o.label })} onClick={() => onChange(value.filter(v => v !== o.value))}><X aria-hidden="true" className="h-3 w-3" /></button>
          </span>
        ))}
        <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={label} className="flex flex-1 items-center gap-1 p-1 text-sm text-content-muted">
          {chosen.length === 0 && <span className="flex-1 text-start">{t('qbaq.pick')}</span>}<ChevronDown aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      {open && !disabled && (
        <div className="flex max-h-60 flex-col gap-1 overflow-auto rounded-token border p-2">
          <input className="rounded-token border px-2 py-1 text-sm" placeholder={t('qbaq.search')} value={q} onChange={e => setQ(e.target.value)} aria-label={t('qbaq.search')} />
          {shown.length === 0 ? <p className="text-xs text-content-muted">{t('qbaq.no_choices')}</p> : shown.map(o => (
            <label key={o.value} className="flex items-center gap-2 text-sm" dir="auto">
              <input type="checkbox" checked={value.includes(o.value)} onChange={() => onChange(value.includes(o.value) ? value.filter(v => v !== o.value) : [...value, o.value])} />{o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
