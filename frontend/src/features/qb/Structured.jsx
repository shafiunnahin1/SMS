import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFieldArray, useWatch } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import Button from '../../components/Button'
import { Input, Select, Textarea } from '../../components/FormField'
import MathText from './MathText'

// QB.4 (D65) + D73 (QB.13): the structured question types. Since D73 any structured question mixes its parts: MCQs, written
// answers, gaps (with a base-word hint), true / false (with the correction), an information-transfer table, two- and three-column
// matching, multi-field answers and steps to order - each with its own marks. The form keeps one list per kind (a board paper
// groups them the same way: A - MCQ, B - questions, ...) and turns them into the API's stimuli + items in that order.
export const STRUCTURED_EMPTY = { box: '', gaps: [], pairs: [], steps: [], subs: [], mcqs: [], tfs: [], tables: [], triples: [], multis: [] }

// list name -> the item kind it holds, in the order the parts are sent and shown
const KINDS = [['mcqs', 'sub_mcq'], ['subs', 'sub_question'], ['gaps', 'gap'], ['tfs', 'true_false'], ['tables', 'table_fill'],
  ['triples', 'match_triple'], ['multis', 'multi_field'], ['pairs', 'match_pair'], ['steps', 'order_step']]
const DEFAULT_LIST = { gap: 'gaps', match: 'pairs', order: 'steps', passage: 'subs', passage_mcq: 'mcqs' }
const EMPTY_ROW = {
  mcqs: { prompt: '', options: ['', '', '', ''], correct: '0', marks: '' }, subs: { prompt: '', answer: '', marks: '' }, gaps: { prompt: '', answers: '', hint: '', marks: '' },
  tfs: { prompt: '', value: 'true', correction: '', marks: '' }, tables: { columns: '', rows: '', marks: '' }, triples: { left: '', middle: '', right: '', marks: '' },
  multis: { prompt: '', fields: '', values: '', marks: '' }, pairs: { left: '', right: '', marks: '' }, steps: { text: '' },
}
const LETTERS = ['ক', 'খ', 'গ', 'ঘ']
const csv = (v) => String(v ?? '').split(',').map(a => a.trim()).filter(Boolean)
const num = (v) => (v === '' || v == null ? undefined : Number(v))

/** A table typed as lines of cells split by "|"; a cell in [brackets] is one to fill, its answers inside (comma-separated) */
export function parseTable(columns, rows) {
  const answers = {}
  const grid = String(rows ?? '').split('\n').map(l => l.trim()).filter(Boolean).map((line, r) => line.split('|').map((cell, c) => {
    const m = cell.trim().match(/^\[(.*)\]$/)
    if (!m) return cell.trim()
    answers[`${r}-${c}`] = csv(m[1])
    return null
  }))
  return { table: { columns: csv(columns), rows: grid }, cells: answers }
}
function tableText(prompt, answer) {
  const rows = prompt?.table?.rows ?? []
  return rows.map((row, r) => row.map((cell, c) => (cell === null ? `[${(answer?.cells?.[`${r}-${c}`] ?? []).join(', ')}]` : cell)).join(' | ')).join('\n')
}

/** API question -> form */
export function fromQuestion(q) {
  const items = q.items ?? []
  const of = (type) => items.filter(i => i.item_type === type)
  const m = (i) => (i.marks != null && Number(i.marks) > 0 ? String(i.marks) : '')
  return {
    box: q.stimuli?.[0]?.content_text ?? '',
    gaps: of('gap').map(i => ({ prompt: i.prompt_text ?? '', answers: (i.answer_json?.answers ?? []).join(', '), hint: i.prompt_json?.hint ?? '', marks: m(i) })),
    pairs: of('match_pair').map(i => ({ left: i.prompt_text ?? '', right: i.answer_json?.right ?? '', marks: m(i) })),
    steps: of('order_step').sort((a, b) => (a.answer_json?.position ?? 0) - (b.answer_json?.position ?? 0)).map(i => ({ text: i.prompt_text ?? '' })),
    subs: of('sub_question').map(i => ({ prompt: i.prompt_text ?? '', answer: i.answer_json?.answer_text ?? '', marks: m(i) })),
    mcqs: of('sub_mcq').map(i => ({ prompt: i.prompt_text ?? '', options: [0, 1, 2, 3].map(k => i.prompt_json?.options?.[k] ?? ''), correct: String(i.answer_json?.correct ?? 0), marks: m(i) })),
    tfs: of('true_false').map(i => ({ prompt: i.prompt_text ?? '', value: String(i.answer_json?.value ?? true), correction: i.answer_json?.correction ?? '', marks: m(i) })),
    tables: of('table_fill').map(i => ({ columns: (i.prompt_json?.table?.columns ?? []).join(', '), rows: tableText(i.prompt_json, i.answer_json), marks: m(i) })),
    triples: of('match_triple').map(i => ({ left: i.prompt_text ?? '', middle: i.answer_json?.middle ?? '', right: i.answer_json?.right ?? '', marks: m(i) })),
    multis: of('multi_field').map(i => ({ prompt: i.prompt_text ?? '', fields: (i.prompt_json?.fields ?? []).join(', '), values: (i.answer_json?.values ?? []).join(', '), marks: m(i) })),
  }
}

/** form -> API { stimuli, items } for a structured type (null = not a structured type: send nothing) */
export function toPayload(structure, s) {
  if (!structure) return {}
  const label = { gap: 'word_box', passage: 'passage', passage_mcq: 'stimulus' }[structure] ?? 'stimulus'
  const stimuli = s.box?.trim() ? [{ label, content_text: s.box }] : []
  const at = stimuli.length ? 0 : null
  const build = {
    mcqs: (q) => ({ item_type: 'sub_mcq', stimulus_index: at, prompt_text: q.prompt, prompt_json: { options: q.options.filter(o => o.trim()) }, answer_json: { correct: Number(q.correct) } }),
    subs: (q) => ({ item_type: 'sub_question', stimulus_index: at, prompt_text: q.prompt, answer_json: { answer_text: q.answer } }),
    gaps: (g) => ({ item_type: 'gap', stimulus_index: at, prompt_text: g.prompt, prompt_json: g.hint?.trim() ? { hint: g.hint.trim() } : null, answer_json: { answers: csv(g.answers) } }),
    tfs: (x) => ({ item_type: 'true_false', stimulus_index: at, prompt_text: x.prompt, answer_json: { value: x.value === 'true', correction: x.correction || null } }),
    tables: (x) => { const p = parseTable(x.columns, x.rows); return { item_type: 'table_fill', stimulus_index: at, prompt_text: null, prompt_json: { table: p.table }, answer_json: { cells: p.cells } } },
    triples: (x) => ({ item_type: 'match_triple', prompt_text: x.left, answer_json: { middle: x.middle, right: x.right } }),
    multis: (x) => ({ item_type: 'multi_field', prompt_text: x.prompt, prompt_json: { fields: csv(x.fields) }, answer_json: { values: csv(x.values) } }),
    pairs: (p) => ({ item_type: 'match_pair', prompt_text: p.left, answer_json: { right: p.right } }),
    steps: (st, i) => ({ item_type: 'order_step', prompt_text: st.text, answer_json: { position: i + 1 } }),
  }
  const items = KINDS.flatMap(([list]) => (s[list] ?? []).map((row, i) => ({ ...build[list](row, i), ...(num(row.marks) !== undefined ? { marks: num(row.marks) } : {}) })))
  return { stimuli, items }
}

function Rows({ name, control, empty, render, addLabel, testid, register }) {
  const { t } = useTranslation()
  const rows = useFieldArray({ control, name })
  return (
    <div className="flex flex-col gap-2" data-testid={testid}>
      {rows.fields.map((f, i) => (
        <div key={f.id} className="flex flex-wrap items-end gap-2 rounded-token [border:1px_solid_var(--line)] p-2">
          <span className="text-sm font-medium w-6">{i + 1}.</span>
          {render(i)}
          {'marks' in empty && <Input className="w-20" label={t('qb.marks')} ltr inputMode="decimal" {...register(`${name}.${i}.marks`)} />}
          <Button variant="secondary" onClick={() => rows.remove(i)} aria-label={t('common.delete')}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>
        </div>
      ))}
      <div><Button variant="secondary" onClick={() => rows.append(empty)} data-action={`add-${name.split('.').pop()}`}><Plus aria-hidden="true" className="h-4 w-4" />{addLabel}</Button></div>
    </div>
  )
}

/** The editor section for a structured type: the type's own part first, any other kind added with "Add a part" */
export function StructuredEditor({ structure, register, control, error }) {
  const { t } = useTranslation()
  const s = useWatch({ control, name: 'structured' }) ?? STRUCTURED_EMPTY
  const [extra, setExtra] = useState([])
  if (!structure) return null
  const boxLabel = { gap: t('qb.word_box'), passage: t('qb.passage'), passage_mcq: t('qb.stimulus') }[structure] ?? t('qb.stimulus')
  const shown = KINDS.map(([l]) => l).filter(l => l === DEFAULT_LIST[structure] || (s[l]?.length ?? 0) > 0 || extra.includes(l))
  const rows = (list, render, testid) => (
    <section key={list} className="flex flex-col gap-1" data-part={list}>
      <h3 className="text-sm font-semibold">{t(`qbx.kinds.${list}`)}</h3>
      <Rows name={`structured.${list}`} control={control} register={register} empty={EMPTY_ROW[list]} addLabel={t(`qbx.add.${list}`)} testid={testid} render={render} />
    </section>
  )
  const part = {
    gaps: () => rows('gaps', i => <>
      <Input className="flex-1 min-w-48" label={t('qb.gap_sentence')} hint={t('qb.blank_hint')} {...register(`structured.gaps.${i}.prompt`)} />
      <Input className="w-32" label={t('qbx.hint')} {...register(`structured.gaps.${i}.hint`)} />
      <Input className="flex-1 min-w-40" label={t('qb.gap_answers')} hint={t('qb.gap_answers_hint')} {...register(`structured.gaps.${i}.answers`)} />
    </>, 'qb-gaps'),
    pairs: () => rows('pairs', i => <>
      <Input className="flex-1 min-w-32" label={t('qb.left')} {...register(`structured.pairs.${i}.left`)} />
      <Input className="flex-1 min-w-32" label={t('qb.right')} {...register(`structured.pairs.${i}.right`)} />
    </>, 'qb-pairs'),
    steps: () => <div key="steps"><p className="text-xs text-content-muted">{t('qb.order_hint')}</p>
      {rows('steps', i => <Input className="flex-1 min-w-48" label={t('qb.piece')} {...register(`structured.steps.${i}.text`)} />, 'qb-steps')}</div>,
    subs: () => rows('subs', i => <>
      <Input className="flex-1 min-w-48" label={t('qb.sub_question')} {...register(`structured.subs.${i}.prompt`)} />
      <Input className="flex-1 min-w-40" label={t('qb.answer')} {...register(`structured.subs.${i}.answer`)} />
    </>, 'qb-subs'),
    mcqs: () => rows('mcqs', i => <div className="flex-1 grid gap-2 sm:grid-cols-2">
      <Input className="sm:col-span-2" label={t('qb.sub_question')} {...register(`structured.mcqs.${i}.prompt`)} />
      {[0, 1, 2, 3].map(k => <Input key={k} label={`${t('qb.option_text')} ${LETTERS[k]}`} {...register(`structured.mcqs.${i}.options.${k}`)} />)}
      <Select label={t('qb.correct')} options={[0, 1, 2, 3].map(k => ({ value: String(k), label: LETTERS[k] }))} {...register(`structured.mcqs.${i}.correct`)} />
    </div>, 'qb-mcqs'),
    tfs: () => rows('tfs', i => <>
      <Input className="flex-1 min-w-48" label={t('qbx.statement')} {...register(`structured.tfs.${i}.prompt`)} />
      <Select className="w-28" label={t('qbx.is')} options={[{ value: 'true', label: t('qb.true') }, { value: 'false', label: t('qb.false') }]} {...register(`structured.tfs.${i}.value`)} />
      <Input className="flex-1 min-w-40" label={t('qbx.correction')} {...register(`structured.tfs.${i}.correction`)} />
    </>, 'qb-tfs'),
    tables: () => rows('tables', i => <div className="flex-1 grid gap-2">
      <Input label={t('qbx.columns')} hint={t('qbx.columns_hint')} {...register(`structured.tables.${i}.columns`)} />
      <Textarea label={t('qbx.rows')} hint={t('qbx.rows_hint')} rows={4} {...register(`structured.tables.${i}.rows`)} />
    </div>, 'qb-tables'),
    triples: () => rows('triples', i => <>
      <Input className="flex-1 min-w-32" label={t('qbx.col_a')} {...register(`structured.triples.${i}.left`)} />
      <Input className="flex-1 min-w-32" label={t('qbx.col_b')} {...register(`structured.triples.${i}.middle`)} />
      <Input className="flex-1 min-w-32" label={t('qbx.col_c')} {...register(`structured.triples.${i}.right`)} />
    </>, 'qb-triples'),
    multis: () => rows('multis', i => <>
      <Input className="flex-1 min-w-32" label={t('qbx.item')} {...register(`structured.multis.${i}.prompt`)} />
      <Input className="flex-1 min-w-40" label={t('qbx.fields')} hint={t('qbx.comma_hint')} {...register(`structured.multis.${i}.fields`)} />
      <Input className="flex-1 min-w-40" label={t('qbx.values')} hint={t('qbx.comma_hint')} {...register(`structured.multis.${i}.values`)} />
    </>, 'qb-multis'),
  }
  const addable = KINDS.map(([l]) => l).filter(l => !shown.includes(l))
  return (
    <fieldset className="sm:col-span-2 flex flex-col gap-3" data-testid="qb-structured">
      <legend className="font-semibold mb-1">{t(`qb.structure.${structure}`)}</legend>
      <Textarea label={boxLabel} rows={structure === 'gap' ? 2 : 5} hint={structure === 'gap' ? t('qb.word_box_hint') : undefined} {...register('structured.box')} />
      {shown.map(l => part[l]())}
      {addable.length > 0 && (
        <Select label={t('qbx.add_part')} value="" data-action="add-part" onChange={e => e.target.value && setExtra([...extra, e.target.value])}
          options={[{ value: '', label: t('qb.pick') }, ...addable.map(l => ({ value: l, label: t(`qbx.kinds.${l}`) }))]} />
      )}
      {error && <p role="alert" className="text-xs font-medium text-content">{error}</p>}
    </fieldset>
  )
}

/** The preview of a structured type (the writer sees the answers) */
export function StructuredPreview({ structure, s, media = [], onImageClick }) {
  const { t } = useTranslation()
  if (!structure) return null
  const muted = 'text-xs text-content-muted'
  const head = (l) => <h4 className="text-sm font-semibold">{t(`qbx.kinds.${l}`)}</h4>
  const has = (l) => (s[l]?.length ?? 0) > 0
  const rich = (text, field) => <MathText text={text} media={media} onImageClick={onImageClick ? attrs => onImageClick(field, attrs, media.find(item => String(item.id) === attrs.media)?.url) : undefined} />
  return (
    <div className="flex flex-col gap-2" data-testid="qb-structured-preview">
      {s.box && <div className="rounded-token bg-surface-muted p-2 text-sm">{rich(s.box, 'structured.box')}</div>}
      {has('mcqs') && <div>{structure !== 'passage_mcq' && head('mcqs')}<ol className="flex flex-col gap-2">{s.mcqs.map((q, i) => <li key={i}>{i + 1}. {rich(q.prompt, `structured.mcqs.${i}.prompt`)}
        <ul className="flex flex-col gap-1 px-4">{q.options.filter(Boolean).map((o, k) => <li key={k}>{LETTERS[k]}. {rich(o, `structured.mcqs.${i}.options.${k}`)}{String(k) === String(q.correct) && <span className={muted}> ({t('qb.correct')})</span>}</li>)}</ul></li>)}</ol></div>}
      {has('subs') && <div>{structure !== 'passage' && head('subs')}<ol className="flex flex-col gap-1">{s.subs.map((q, i) => <li key={i}>{i + 1}. {rich(q.prompt, `structured.subs.${i}.prompt`)} <span className={muted}>— {rich(q.answer, `structured.subs.${i}.answer`)}</span></li>)}</ol></div>}
      {has('gaps') && <div>{structure !== 'gap' && head('gaps')}<ol className="flex flex-col gap-1">{s.gaps.map((g, i) => <li key={i}>{rich(g.prompt, `structured.gaps.${i}.prompt`)}{g.hint && <span> ({g.hint})</span>} <span className={muted}>[{g.answers}]</span></li>)}</ol></div>}
      {has('tfs') && <div>{head('tfs')}<ol className="flex flex-col gap-1">{s.tfs.map((x, i) => <li key={i}>{i + 1}. {rich(x.prompt, `structured.tfs.${i}.prompt`)} <span className={muted}>— {t(x.value === 'true' ? 'qb.true' : 'qb.false')}{x.correction ? `: ${x.correction}` : ''}</span></li>)}</ol></div>}
      {has('tables') && <div>{head('tables')}{s.tables.map((x, i) => { const p = parseTable(x.columns, x.rows); return (
        <table key={i} className="my-1 border-collapse text-sm"><tbody>
          {p.table.columns.length > 0 && <tr>{p.table.columns.map((c, k) => <th key={k} className="px-2 py-1 [border:1px_solid_var(--line)]">{c}</th>)}</tr>}
          {p.table.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c} className="px-2 py-1 [border:1px_solid_var(--line)]">{cell ?? <span className={muted}>[{(p.cells[`${r}-${c}`] ?? []).join(', ')}]</span>}</td>)}</tr>)}
        </tbody></table>) })}</div>}
      {has('triples') && <div>{head('triples')}<ul className="flex flex-col gap-1 text-sm">{s.triples.map((x, i) => <li key={i} className="flex flex-wrap gap-3">{rich(x.left, `structured.triples.${i}.left`)}<span aria-hidden="true">—</span>{rich(x.middle, `structured.triples.${i}.middle`)}<span aria-hidden="true">—</span>{rich(x.right, `structured.triples.${i}.right`)}</li>)}</ul></div>}
      {has('multis') && <div>{head('multis')}<ol className="flex flex-col gap-1">{s.multis.map((x, i) => <li key={i}>{i + 1}. {rich(x.prompt, `structured.multis.${i}.prompt`)} <span className={muted}>— {csv(x.fields).map((f, k) => `${f}: ${csv(x.values)[k] ?? ''}`).join('; ')}</span></li>)}</ol></div>}
      {has('pairs') && <div>{structure !== 'match' && head('pairs')}<ul className="flex flex-col gap-1 text-sm">{s.pairs.map((p, i) => <li key={i} className="flex flex-wrap gap-4">{rich(p.left, `structured.pairs.${i}.left`)}<span aria-hidden="true">—</span>{rich(p.right, `structured.pairs.${i}.right`)}</li>)}</ul></div>}
      {has('steps') && <div>{structure !== 'order' && head('steps')}<ol className="flex flex-col gap-1 list-decimal list-inside">{s.steps.map((st, i) => <li key={i}>{rich(st.text, `structured.steps.${i}.text`)}</li>)}</ol></div>}
    </div>
  )
}
