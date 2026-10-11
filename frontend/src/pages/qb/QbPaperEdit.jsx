import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import PrintButton from '../../components/PrintButton'
import { ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'
import MathText from '../../features/qb/MathText'

const EMPTY = { title: '', exam_name: '', duration_minutes: '', sets_count: '1', instructions: '', sections: [{ title: '', instruction: '', items: [] }] }

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
  const [v, setV] = useState(EMPTY)
  const [texts, setTexts] = useState({})              // question id -> text, for the questions shown in the sections
  const [search, setSearch] = useState('')
  const [target, setTarget] = useState(0)
  const [busy, setBusy] = useState(false)
  const found = useQuery({ queryKey: ['qb-library', 'questions', 'paper', search], queryFn: () => api.get('/question-bank/questions', { params: { q: search || undefined, per_page: 10 } }).then(r => r.data.data) })
  useEffect(() => {
    if (!paper.data) return
    const p = paper.data
    setV({ title: p.title, exam_name: p.exam_name ?? '', duration_minutes: p.duration_minutes ? String(p.duration_minutes) : '', sets_count: String(p.sets_count),
      instructions: p.instructions_json?.text ?? '', sections: p.sections.map(s => ({ title: s.title, instruction: s.instruction ?? '', items: s.items.map(i => ({ ...i, marks: String(i.marks) })) })) })
    p.sections.flatMap(s => s.items).forEach(i => api.get(`/question-bank/questions/${i.qb_question_id}`).then(r => setTexts(x => ({ ...x, [i.qb_question_id]: r.data.data.question_text }))).catch(() => {}))
  }, [paper.data])

  if (!isNew && paper.isPending) return <Loader type="page" />
  if (paper.isError) return <ErrorState onRetry={paper.refetch} />
  const final = paper.data?.status === 'final'
  const set = (patch) => setV(x => ({ ...x, ...patch }))
  const section = (i, patch) => set({ sections: v.sections.map((s, k) => (k === i ? { ...s, ...patch } : s)) })
  const used = new Set(v.sections.flatMap(s => s.items.map(i => i.qb_question_id)))
  const add = (q) => {
    setTexts(x => ({ ...x, [q.id]: q.question_text }))
    section(target, { items: [...v.sections[target].items, { qb_question_id: q.id, marks: String(Number(q.marks) || 1) }] })
  }
  const body = () => ({ title: v.title, exam_name: v.exam_name || null, duration_minutes: v.duration_minutes ? Number(v.duration_minutes) : null, sets_count: Number(v.sets_count),
    instructions_json: v.instructions ? { text: v.instructions } : null, sections: v.sections.map(s => ({ title: s.title, instruction: s.instruction || null, items: s.items.map(i => ({ qb_question_id: i.qb_question_id, marks: i.marks })) })) })
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
    try { await api.post(`/question-bank/papers/${id}/finalize`); toast(t('common.saved')); paper.refetch(); qc.invalidateQueries({ queryKey: ['qb-papers'] }) }
    catch (e) { toast(e.response?.data?.message, 'error') }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="qb-paper-edit">
      <PageHeader title={isNew ? t('qbpp.new') : v.title} actions={!isNew && <span data-status={paper.data.status} className="text-sm">{t(`qbpp.status.${paper.data.status}`)}</span>} />
      <Card className="grid gap-3 sm:grid-cols-2">
        <fieldset disabled={final} className="contents">
          <Input label={t('qbpp.title')} value={v.title} onChange={e => set({ title: e.target.value })} name="title" />
          <Input label={t('qbpp.exam_name')} value={v.exam_name} onChange={e => set({ exam_name: e.target.value })} name="exam_name" />
          <Input label={t('qbpp.duration')} ltr inputMode="numeric" value={v.duration_minutes} onChange={e => set({ duration_minutes: e.target.value })} name="duration_minutes" />
          <Select label={t('qbpp.sets')} options={[{ value: '1', label: t('qbpp.one_set') }, { value: '2', label: t('qbpp.two_sets') }]} value={v.sets_count} onChange={e => set({ sets_count: e.target.value })} name="sets_count" />
          <Textarea className="sm:col-span-2" label={t('qbpp.instructions')} rows={2} value={v.instructions} onChange={e => set({ instructions: e.target.value })} name="instructions" />
        </fieldset>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="flex flex-col gap-3">
          {v.sections.map((s, i) => (
            <Card key={i} className="flex flex-col gap-2" data-testid={`paper-section-${i}`}>
              <fieldset disabled={final} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-end gap-2">
                  <Input className="flex-1 min-w-48" label={t('qbpp.section_title')} value={s.title} onChange={e => section(i, { title: e.target.value })} name={`section-${i}-title`} />
                  {v.sections.length > 1 && <Button variant="secondary" onClick={() => set({ sections: v.sections.filter((_, k) => k !== i) })} aria-label={t('common.delete')}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>}
                </div>
                <Input label={t('qbpp.section_instruction')} value={s.instruction} onChange={e => section(i, { instruction: e.target.value })} />
                <ol className="flex flex-col gap-1">
                  {s.items.map((it, k) => (
                    <li key={it.qb_question_id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{k + 1}.</span>
                      <span className="flex-1 min-w-40 line-clamp-2"><MathText text={texts[it.qb_question_id] ?? `#${it.qb_question_id}`} /></span>
                      <Input className="w-20" ltr inputMode="decimal" aria-label={t('qbpp.marks')} value={it.marks} name={`marks-${it.qb_question_id}`}
                        onChange={e => section(i, { items: s.items.map((x, j) => (j === k ? { ...x, marks: e.target.value } : x)) })} />
                      <Button variant="secondary" onClick={() => section(i, { items: s.items.filter((_, j) => j !== k) })} aria-label={t('common.delete')}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>
                    </li>
                  ))}
                </ol>
              </fieldset>
            </Card>
          ))}
          {!final && <div><Button variant="secondary" onClick={() => set({ sections: [...v.sections, { title: '', instruction: '', items: [] }] })} data-action="add-section"><Plus aria-hidden="true" className="h-4 w-4" />{t('qbpp.add_section')}</Button></div>}
          <div className="flex flex-wrap justify-end gap-2">
            {!final && <Button onClick={save} loading={busy} data-action="save">{t('common.save')}</Button>}
            {!isNew && !final && <Button variant="secondary" onClick={finalize} data-action="finalize">{t('qbpp.finalize')}</Button>}
            {!isNew && final && ['A', ...(v.sets_count === '2' ? ['B'] : [])].flatMap(set => [
              <PrintButton key={set} url={`/question-bank/papers/${id}/pdf`} params={{ set }} filename={`paper-${id}-${set}.pdf`} label={t('qbpp.print_set', { set })} />,
              <PrintButton key={`${set}a`} url={`/question-bank/papers/${id}/pdf`} params={{ set, answers: 1 }} filename={`paper-${id}-${set}-answers.pdf`} label={t('qbpp.print_answers', { set })} />,
            ])}
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
