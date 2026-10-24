import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ChevronDown, ChevronUp, Eye, Plus, Trash2 } from 'lucide-react'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import DirIcon from '../../components/DirIcon'
import Ltr from '../../components/bidi/Ltr'
import { ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'
import MathText from '../../features/qb/MathText'

const EMPTY = { title: '', exam_name: '', duration_minutes: '', sets_count: '1', instructions: '', group: false, order: [], sections: [{ title: '', instruction: '', items: [] }] }

// QB.8 /admin|teacher/question-bank/papers/:id and /new (D66, question-bank.md §5): sections, questions searched from the bank with
// their marks, saved as a draft. Not-yet-bought questions: the server answers with their ids and total; the page asks once and buys
// them (buy-many), then saves. A final paper prints set A / B, with or without answers (Chromium PDF).
export default function QbPaperEdit() {
  const { t } = useTranslation()
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const base = useLocation().pathname.replace(/\/[^/]+$/, '')
  const qc = useQueryClient()
  const paper = useQuery({ queryKey: ['qb-paper', id], queryFn: () => api.get(`/question-bank/papers/${id}`).then(r => r.data.data), enabled: !isNew })
  const curriculum = useQuery({ queryKey: ['qb-library', 'curriculum'], queryFn: () => api.get('/question-bank/curriculum').then(r => r.data.data) })
  const questionTypes = useQuery({ queryKey: ['qb-question-types'], queryFn: () => api.get('/question-bank/question-types').then(r => r.data.data) })
  const [v, setV] = useState(EMPTY)
  const [texts, setTexts] = useState({})              // question id -> text, for the questions shown in the sections
  const [details, setDetails] = useState({})           // only the question-bank public shape; answers are present only when bought
  const [search, setSearch] = useState('')
  const [target, setTarget] = useState(0)
  const [busy, setBusy] = useState(false)
  const [finalOpts, setFinalOpts] = useState({ strategy: 'both', set_names: 'latin' })   // D126 (2)
  const [planInfo, setPlanInfo] = useState(null)       // D126 (3): the blueprint a new paper started from, and what it was short of
  const blueprints = useQuery({ queryKey: ['qb-blueprints'], queryFn: () => api.get('/question-bank/blueprints').then(r => r.data.data), enabled: isNew })
  const found = useQuery({ queryKey: ['qb-library', 'questions', 'paper', search], queryFn: () => api.get('/question-bank/questions', { params: { q: search || undefined, per_page: 10 } }).then(r => r.data.data) })
  useEffect(() => {
    if (!paper.data) return
    const p = paper.data
    setV({ title: p.title, exam_name: p.exam_name ?? '', duration_minutes: p.duration_minutes ? String(p.duration_minutes) : '', sets_count: String(p.sets_count),
      instructions: p.instructions_json?.text ?? '', group: !!p.instructions_json?.group_by_subject, order: (p.subjects ?? []).map(x => x.id), sections: p.sections.map(s => ({ title: s.title, instruction: s.instruction ?? '', items: s.items.map(i => ({ ...i, marks: String(i.marks) })) })) })
    p.sections.flatMap(s => s.items).forEach(i => api.get(`/question-bank/questions/${i.qb_question_id}`).then(r => {
      setTexts(x => ({ ...x, [i.qb_question_id]: r.data.data.question_text }))
      setDetails(x => ({ ...x, [i.qb_question_id]: r.data.data }))
    }).catch(() => {}))
  }, [paper.data])

  if (!isNew && paper.isPending) return <Loader type="page" />
  if (paper.isError) return <ErrorState onRetry={paper.refetch} />
  const final = paper.data?.status === 'final'
  const set = (patch) => setV(x => ({ ...x, ...patch }))
  const section = (i, patch) => set({ sections: v.sections.map((s, k) => (k === i ? { ...s, ...patch } : s)) })
  const used = new Set(v.sections.flatMap(s => s.items.map(i => i.qb_question_id)))
  const add = (q) => {
    setTexts(x => ({ ...x, [q.id]: q.question_text }))
    setDetails(x => ({ ...x, [q.id]: q }))
    section(target, { items: [...v.sections[target].items, { qb_question_id: q.id, marks: String(Number(q.marks) || 1) }] })
  }
  const body = () => ({ title: v.title, exam_name: v.exam_name || null, duration_minutes: v.duration_minutes ? Number(v.duration_minutes) : null, sets_count: Number(v.sets_count),
    instructions_json: (v.instructions || v.group) ? { text: v.instructions || null, group_by_subject: v.group, subject_order: v.order } : null, sections: v.sections.map(s => ({ title: s.title, instruction: s.instruction || null, items: s.items.map(i => ({ qb_question_id: i.qb_question_id, marks: i.marks })) })) })
  const toast = (m, k) => useUiStore.getState().addToast(m, k)
  const save = async () => {
    setBusy(true)
    try {
      const { data } = isNew ? await api.post('/question-bank/papers', body()) : await api.put(`/question-bank/papers/${id}`, body())
      toast(t('common.saved'))
      qc.invalidateQueries({ queryKey: ['qb-papers'] })
      if (isNew) navigate(`${base}/${data.data.id}`, { replace: true }); else paper.refetch()
    } catch (e) {
      const d = e.response?.data
      if (d?.error === 'qb_paper_unbought') {
        useUiStore.getState().openConfirm({ title: t('qbpp.unbought_title', { n: d.data.ids.length, total: d.data.total }), description: t('qbpp.unbought_hint'), type: 'info', confirmLabel: t('qbb.buy'),
          onConfirm: async () => {
            try { await api.post('/question-bank/buy-many', { question_ids: d.data.ids }); await save() } catch (err) { toast(err.response?.data?.message ?? t('qbb.failed'), 'error') }
          } })
      } else toast(Object.values(d?.errors ?? {})[0]?.[0] ?? d?.message, 'error')
    } finally { setBusy(false) }
  }
  const finalize = async () => {
    try { await api.post(`/question-bank/papers/${id}/finalize`, finalOpts); toast(t('common.saved')); paper.refetch(); qc.invalidateQueries({ queryKey: ['qb-papers'] }) }
    catch (e) { toast(e.response?.data?.message, 'error') }
  }
  const fromBlueprint = async (bpId, exclude = []) => {   // D126 (3): the plan becomes the paper's sections; short rules are shown
    if (!bpId) return
    try {
      const { data } = await api.post(`/question-bank/blueprints/${bpId}/plan`, { exclude_ids: exclude })
      const bp = data.data.blueprint
      setV(x => ({ ...x, title: x.title || bp.name_bn, duration_minutes: bp.duration_minutes ? String(bp.duration_minutes) : x.duration_minutes,
        sections: data.data.sections.map(s => ({ title: s.title, instruction: '', items: s.items.map(i => ({ qb_question_id: i.qb_question_id, marks: String(i.marks), rule: i.rule })) })) }))
      setPlanInfo({ id: bpId, short: data.data.short, rules: data.data.sections.flatMap(s => s.rules.map(r => ({ ...r, title: s.title }))) })
      data.data.sections.flatMap(s => s.items).forEach(i => api.get(`/question-bank/questions/${i.qb_question_id}`).then(r => {
        setTexts(x => ({ ...x, [i.qb_question_id]: r.data.data.question_text }))
        setDetails(x => ({ ...x, [i.qb_question_id]: r.data.data }))
      }).catch(() => {}))
    } catch (e) { toast(e.response?.data?.message ?? t('common.error'), 'error') }
  }
  const swap = async (si, k) => {                       // another eligible question for the same rule
    const it = v.sections[si].items[k]
    const { data } = await api.get(`/question-bank/blueprints/${planInfo.id}/candidates`, { params: { rule: it.rule, used: [...used] } })
    const next = data.data[0]
    if (!next) { toast(t('qbpp.no_other'), 'error'); return }
    setTexts(x => ({ ...x, [next.id]: next.question_text }))
    section(si, { items: v.sections[si].items.map((x, j) => (j === k ? { ...x, qb_question_id: next.id } : x)) })
  }
  const subjects = (paper.data?.subjects ?? []).filter(x => x.id)          // D128: the saved paper's subjects
  const subjectCatalog = curriculum.data?.subjects ?? []
  const typeCatalog = questionTypes.data ?? []
  const questionCode = (questionId) => {
    const q = details[questionId]
    const subject = subjectCatalog.find(x => x.id === q?.qb_subject_id)
    const type = typeCatalog.find(x => x.id === q?.qb_question_type_id)
    return [subject?.code || 'Q', (type?.slug || 'q').toUpperCase(), String(questionId).padStart(6, '0')].join('-')
  }
  const ordered = [...v.order.map(sid => subjects.find(x => x.id === sid)).filter(Boolean), ...subjects.filter(x => !v.order.includes(x.id))]
  const move = (k, d) => { const ids = ordered.map(x => x.id); [ids[k], ids[k + d]] = [ids[k + d], ids[k]]; set({ order: ids }) }
  const setLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4" data-testid="qb-paper-edit">
      {!isNew && <button type="button" onClick={() => navigate(base)} className="flex w-fit items-center gap-2 text-sm font-medium text-content-muted hover:text-primary-fg" data-action="back-to-papers"><DirIcon icon="back" className="h-4 w-4" />{t('qbpp.papers')}</button>}
      <Card className="overflow-hidden border-s-4 border-primary bg-gradient-to-br from-primary-soft via-surface to-surface p-0 shadow-card">
        <div className="flex flex-col gap-5 p-5 sm:p-7 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary-fg">{t('qbpp.question_set')}</p>
            <h1 className="text-2xl font-bold text-content" dir="auto">{isNew ? t('qbpp.new') : v.title}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-content-muted">
              <span>{t('qbpp.question_count', { count: v.sections.reduce((n, s) => n + s.items.length, 0) })}</span>
              {!isNew && <span data-status={paper.data.status} className="rounded-token bg-surface px-2 py-1">{t(`qbpp.status.${paper.data.status}`)}</span>}
              {!isNew && <span>{t('qbpp.total_marks')}: {paper.data.total_marks}</span>}
            </div>
          </div>
          {!isNew && <div className="flex flex-wrap gap-2" data-testid="paper-primary-actions">
            {!final && <Button variant="secondary" onClick={() => navigate(`${base}/${id}/preview?set=A`)} data-action="preview" data-set="A"><Eye aria-hidden="true" className="h-4 w-4" />{t('qbpv.open')}</Button>}
            {final && <Button variant="secondary" onClick={() => navigate(`${base}/${id}/omr`)} data-action="omr">{t('qbomr.title')}</Button>}
            {!final && <Button variant="secondary" onClick={() => document.querySelector('[data-testid="paper-picker"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} data-action="add-questions-shortcut"><Plus aria-hidden="true" className="h-4 w-4" />{t('qbpp.add_questions')}</Button>}
            {!final && <Button onClick={finalize} data-action="finalize">{t('qbpp.finalize')}</Button>}
          </div>}
        </div>
      </Card>
      {!isNew && final && <PaperSets paperId={id} paper={paper.data} base={base} onChanged={() => { paper.refetch(); qc.invalidateQueries({ queryKey: ['qb-papers'] }) }} />}
      <Card className="grid gap-3 sm:grid-cols-2" data-testid="paper-settings">
        <fieldset disabled={final} className="contents">
          <Input label={t('qbpp.title')} value={v.title} onChange={e => set({ title: e.target.value })} name="title" />
          <Input label={t('qbpp.exam_name')} value={v.exam_name} onChange={e => set({ exam_name: e.target.value })} name="exam_name" />
          <Input label={t('qbpp.duration')} ltr inputMode="numeric" value={v.duration_minutes} onChange={e => set({ duration_minutes: e.target.value })} name="duration_minutes" />
          <Select label={t('qbpp.sets')} options={setLetters.map((_, k) => ({ value: String(k + 1), label: t('qbpp.n_sets', { n: k + 1 }) }))} value={v.sets_count} onChange={e => set({ sets_count: e.target.value })} name="sets_count" />
          <Textarea className="sm:col-span-2" label={t('qbpp.instructions')} rows={2} value={v.instructions} onChange={e => set({ instructions: e.target.value })} name="instructions" />
          <div className="flex flex-col gap-2 sm:col-span-2" data-testid="paper-subject-group">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="group_by_subject" checked={v.group} onChange={e => set({ group: e.target.checked })} />{t('qbpp.group_by_subject')}</label>
            {v.group && (ordered.length === 0 ? <p className="text-sm text-content-muted">{t('qbpp.group_save_first')}</p> : (
              <ol className="flex flex-col gap-1 text-sm">
                {ordered.map((x, k) => (
                  <li key={x.id} className="flex items-center gap-2" data-subject={x.id}>
                    <span className="flex-1" dir="auto">{k + 1}. {x.name}</span>
                    <Button variant="ghost" disabled={k === 0} onClick={() => move(k, -1)} aria-label={t('qbpp.move_up')}><ChevronUp aria-hidden="true" className="h-4 w-4" /></Button>
                    <Button variant="ghost" disabled={k === ordered.length - 1} onClick={() => move(k, 1)} aria-label={t('qbpp.move_down')}><ChevronDown aria-hidden="true" className="h-4 w-4" /></Button>
                  </li>
                ))}
              </ol>
            ))}
          </div>
        </fieldset>
      </Card>
      {isNew && (blueprints.data ?? []).length > 0 && (
        <Card className="flex flex-col gap-2" data-testid="paper-blueprint">
          <Select label={t('qbpp.from_blueprint')} name="blueprint" value={planInfo ? String(planInfo.id) : ''} placeholder={t('qbpp.no_blueprint')}
            onChange={e => fromBlueprint(e.target.value)} options={blueprints.data.map(b => ({ value: String(b.id), label: `${b.name_bn} (${b.total_marks})` }))} />
          {planInfo?.short > 0 && (
            <ul className="text-sm text-red-600" role="alert" data-testid="paper-short">
              {planInfo.rules.filter(r => r.short > 0).map(r => <li key={r.rule}>{t('qbpp.short', { title: r.title, wanted: r.wanted, found: r.found })}</li>)}
            </ul>
          )}
        </Card>
      )}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4">
          {v.sections.map((s, i) => (
            <Card key={i} className="flex flex-col gap-3 p-0" data-testid={`paper-section-${i}`}>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-surface-muted/40 px-5 py-4">
                <div><p className="text-xs font-semibold uppercase tracking-wide text-primary-fg">{t('qbpp.section_n', { n: i + 1 })}</p><h2 className="font-semibold" dir="auto">{s.title || t('qbpp.section_title')}</h2></div>
                {v.sections.length > 1 && !final && <Button variant="secondary" onClick={() => set({ sections: v.sections.filter((_, k) => k !== i) })} aria-label={t('common.delete')}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>}
              </header>
              <div className="flex flex-col gap-3 px-5 pb-5">
              <fieldset disabled={final} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-end gap-2">
                  <Input className="flex-1 min-w-48" label={t('qbpp.section_title')} value={s.title} onChange={e => section(i, { title: e.target.value })} name={`section-${i}-title`} />
                </div>
                <Input label={t('qbpp.section_instruction')} value={s.instruction} onChange={e => section(i, { instruction: e.target.value })} />
              </fieldset>
                <ol className="flex flex-col gap-3">
                  {s.items.map((it, k) => (
                    <li key={it.qb_question_id} className="overflow-hidden rounded-token border border-border-subtle bg-surface" data-question-id={it.qb_question_id}>
                      <header className="flex flex-wrap items-center gap-3 border-b border-border-subtle bg-surface-muted/40 px-4 py-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-token bg-primary font-semibold text-on-primary">{k + 1}</span>
                        <div className="min-w-0 flex-1"><p className="text-sm font-semibold"><Ltr>{questionCode(it.qb_question_id)}</Ltr></p><p className="text-xs text-content-muted" dir="auto">{s.title || t('qbpp.section_title')}</p></div>
                        {!final && <Button variant="secondary" onClick={() => section(i, { items: s.items.filter((_, j) => j !== k) })} aria-label={t('common.delete')} data-action="remove-question"><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>}
                      </header>
                      <div className="flex flex-col gap-3 px-4 py-4">
                        <div className="text-base leading-8" dir="auto"><MathText text={texts[it.qb_question_id] ?? `#${it.qb_question_id}`} /></div>
                        {(details[it.qb_question_id]?.options ?? []).length > 0 && <ol className="grid gap-2 sm:grid-cols-2">
                          {details[it.qb_question_id].options.map((option, optionIndex) => <li key={optionIndex} className={`flex min-h-12 items-center gap-3 rounded-token border border-border-subtle bg-surface-muted/30 px-3 py-2 ${option.is_correct ? 'bg-primary-soft' : ''}`}>
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs">{option.label || optionIndex + 1}</span><MathText text={option.content_text} />
                          </li>)}
                        </ol>}
                        {details[it.qb_question_id]?.unlocked && (details[it.qb_question_id]?.answer_text || details[it.qb_question_id]?.explanation_text || details[it.qb_question_id]?.options?.some(o => o.is_correct)) && (
                          <div className="grid gap-2 sm:grid-cols-2" data-testid={`paper-answer-${it.qb_question_id}`}>
                            {(details[it.qb_question_id].answer_text || details[it.qb_question_id].options?.some(o => o.is_correct)) && <div className="rounded-token border border-primary/30 bg-primary-soft p-3 text-sm"><p className="mb-1 font-semibold">{t('qbpp.answer')}</p>{details[it.qb_question_id].options.some(o => o.is_correct) && <span className="me-2">{details[it.qb_question_id].options.filter(o => o.is_correct).map(o => o.label).join(', ')}</span>}<MathText text={details[it.qb_question_id].answer_text || details[it.qb_question_id].options.filter(o => o.is_correct).map(o => o.content_text).join(' · ')} /></div>}
                            {details[it.qb_question_id].explanation_text && <div className="rounded-token border border-primary/30 bg-primary-soft p-3 text-sm"><p className="mb-1 font-semibold">{t('qbpp.solution')}</p><MathText text={details[it.qb_question_id].explanation_text} /></div>}
                          </div>
                        )}
                        {!final && <div className="flex flex-wrap items-end gap-2">
                          <Input className="w-24" ltr inputMode="decimal" aria-label={t('qbpp.marks')} value={it.marks} name={`marks-${it.qb_question_id}`}
                            onChange={e => section(i, { items: s.items.map((x, j) => (j === k ? { ...x, marks: e.target.value } : x)) })} />
                          {planInfo && it.rule !== undefined && <Button variant="ghost" onClick={() => swap(i, k)} data-action="swap">{t('qbpp.swap')}</Button>}
                        </div>}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </Card>
          ))}
          {!final && <div><Button variant="secondary" onClick={() => set({ sections: [...v.sections, { title: '', instruction: '', items: [] }] })} data-action="add-section"><Plus aria-hidden="true" className="h-4 w-4" />{t('qbpp.add_section')}</Button></div>}
          <div className="flex flex-wrap justify-end gap-2">
            {!final && <Button onClick={save} loading={busy} data-action="save">{t('common.save')}</Button>}
            {!isNew && !final && Number(v.sets_count) > 1 && (
              <div className="flex flex-wrap gap-2" data-testid="paper-set-options">
                <Select label={t('qbpp.strategy')} name="strategy" value={finalOpts.strategy} onChange={e => setFinalOpts({ ...finalOpts, strategy: e.target.value })}
                  options={['both', 'options', 'serial'].map(x => ({ value: x, label: t(`qbpp.strategies.${x}`) }))} />
                <Select label={t('qbpp.set_names')} name="set_names" value={finalOpts.set_names} onChange={e => setFinalOpts({ ...finalOpts, set_names: e.target.value })}
                  options={[{ value: 'latin', label: 'A, B, C…' }, { value: 'bangla', label: 'ক, খ, গ…' }]} />
              </div>
            )}
          </div>
        </div>
        {!final && (
          <Card className="flex flex-col gap-2" data-testid="paper-picker">
            <h2 className="font-semibold">{t('qbpp.add_questions')}</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input label={t('qb.search')} value={search} onChange={e => setSearch(e.target.value)} name="q" />
              <Select label={t('qbpp.into_section')} value={String(target)} onChange={e => setTarget(Number(e.target.value))} name="target"
                options={v.sections.map((s, i) => ({ value: String(i), label: s.title || t('qbpp.section_n', { n: i + 1 }) }))} />
            </div>
            {found.isPending ? <Loader /> : found.isError ? <ErrorState onRetry={found.refetch} /> : (
              <ul className="flex flex-col divide-y">
                {(found.data ?? []).map(q => (
                  <li key={q.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <span className="flex-1 min-w-40 line-clamp-2"><MathText text={q.question_text} /></span>
                    {q.unlocked ? <span className="text-xs text-content-muted">{t('qbpp.owned')}</span> : <span className="text-xs text-content-muted">{t('qbpp.not_owned')}</span>}
                    <Button variant="secondary" disabled={used.has(q.id)} onClick={() => add(q)} data-action="add-question"><Plus aria-hidden="true" className="h-4 w-4" />{t('qbpp.add')}</Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}

// qbank's subsets on the paper page (D126 (2), D133): the frozen sets with their own preview and print, and "create sets" that adds
// more sets after them - MCQ order and options shuffled by the chosen strategy, never repeating an earlier set
function PaperSets({ paperId, paper, base, onChanged }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form, setForm] = useState({ count: '1', strategy: 'both' })
  const [busy, setBusy] = useState(false)
  const sets = paper.sets ?? []
  const add = async () => {
    setBusy(true)
    try { await api.post(`/question-bank/papers/${paperId}/finalize`, { count: Number(form.count), strategy: form.strategy }); useUiStore.getState().addToast(t('qbpp.sets_added')); onChanged() }
    catch { /* the interceptor shows why (capacity, scanned) */ } finally { setBusy(false) }
  }
  return (
    <Card className="flex flex-col gap-3" data-testid="paper-sets">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="font-semibold">{t('qbpp.sets_title')}</h2><p className="text-sm text-content-muted">{t('qbpp.sets_hint')}</p></div>
        <div className="flex flex-wrap items-end gap-2" data-testid="paper-create-sets">
          <Select label={t('qbpp.sets_count')} name="add_count" value={form.count} onChange={e => setForm({ ...form, count: e.target.value })}
            options={Array.from({ length: Math.max(1, 26 - sets.length) }, (_, k) => ({ value: String(k + 1), label: String(k + 1) }))} />
          <Select label={t('qbpp.strategy')} name="add_strategy" value={form.strategy} onChange={e => setForm({ ...form, strategy: e.target.value })}
            options={['both', 'options', 'serial'].map(x => ({ value: x, label: t(`qbpp.strategies.${x}`) }))} />
          <Button onClick={add} loading={busy} disabled={sets.length >= 26} data-action="create-sets"><Plus aria-hidden="true" className="h-4 w-4" />{t('qbpp.create_sets')}</Button>
        </div>
      </div>
      <ul className="flex flex-col gap-2" data-testid="paper-set-list">
        {sets.map(s => (
          <li key={s.number} className="flex flex-wrap items-center gap-2 rounded-token px-3 py-2 [border:1px_solid_var(--line)]" data-set={s.set}>
            <span className="min-w-16 font-semibold">{t('qbpp.set_code', { code: s.code })}</span>
            <span className="flex-1 text-sm text-content-muted">{s.number === 1 ? t('qbpp.main_set') : t(`qbpp.strategies.${s.strategy}`)}</span>
            <Button variant="secondary" onClick={() => navigate(`${base}/${paperId}/preview?set=${s.set}`)} data-action="preview" data-set={s.set}><Eye aria-hidden="true" className="h-4 w-4" />{t('qbpv.open')}</Button>
          </li>
        ))}
      </ul>
    </Card>
  )
}
