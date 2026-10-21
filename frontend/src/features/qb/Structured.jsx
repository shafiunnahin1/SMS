import { Fragment, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useFieldArray, useWatch } from 'react-hook-form'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
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
  mcqs: { prompt: '', options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }], correct: '0', marks: '' }, subs: { prompt: '', answer: '', marks: '' }, gaps: { prompt: '', answers: '', hint: '', marks: '' },
  tfs: { prompt: '', value: 'true', correction: '', marks: '' }, tables: { columns: '', rows: '', marks: '' }, triples: { left: '', middle: '', right: '', marks: '' },
  multis: { prompt: '', fields: '', values: '', marks: '' }, pairs: { left: '', right: '', marks: '' }, steps: { text: '' },
}
const csv = (v) => String(v ?? '').split(',').map(a => a.trim()).filter(Boolean)
const num = (v) => (v === '' || v == null ? undefined : Number(v))
const gapLabel = (index) => String.fromCharCode(97 + index)
const gapToken = (index) => `(${gapLabel(index)}) —`
const GAP_TOKEN_PATTERN = /\([a-z]+\)\s*(?:_+|—)/gi

const alphabeticLabel = (index) => {
  let value = index + 1
  let label = ''
  while (value > 0) {
    value -= 1
    label = String.fromCharCode(97 + value % 26) + label
    value = Math.floor(value / 26)
  }
  return label
}

export const romanOptionLabel = (index) => {
  let value = index + 1
  let label = ''
  for (const [number, numeral] of [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']]) {
    while (value >= number) {
      label += numeral
      value -= number
    }
  }
  return label
}

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
export function isFlowChartTable(item) {
  const parsed = parseTable(item.columns, item.rows)
  return parsed.table.columns.length === 0 && parsed.table.rows.length === 1 && parsed.table.rows[0].length >= 3
}
function flowChartValues(item) {
  const parsed = parseTable(item.columns, item.rows)
  return (parsed.table.rows[0] ?? []).map((cell, index) => cell ?? (parsed.cells[`0-${index}`] ?? []).join(', '))
}
function flowChartEditorValues(item) {
  const values = flowChartValues(item)
  return values.length >= 3 ? values : ['', '', '']
}
function serializeFlowChart(values) {
  return values.map((value, index) => index === 0 ? String(value ?? '').trim() : `[${String(value ?? '').trim()}]`).join(' | ')
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
    mcqs: of('sub_mcq').map(i => ({ prompt: i.prompt_text ?? '', options: (i.prompt_json?.options?.length ? i.prompt_json.options : ['', '', '', '']).map(text => ({ text: text ?? '' })), correct: String(i.answer_json?.correct ?? 0), marks: m(i) })),
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
    mcqs: (q) => {
      const options = q.options.map((option, index) => ({ text: option.text.trim(), index })).filter(option => option.text)
      return { item_type: 'sub_mcq', stimulus_index: at, prompt_text: q.prompt, prompt_json: { options: options.map(option => option.text) },
        answer_json: { correct: options.findIndex(option => option.index === Number(q.correct)) } }
    },
    subs: (q) => ({ item_type: 'sub_question', stimulus_index: at, prompt_text: q.prompt, answer_json: { answer_text: q.answer } }),
    gaps: (g) => ({ item_type: 'gap', stimulus_index: at, prompt_text: g.prompt || null, prompt_json: g.hint?.trim() ? { hint: g.hint.trim() } : null, answer_json: { answers: csv(g.answers) } }),
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

function Rows({ name, control, empty, render, addLabel, testid, register, compact = false }) {
  const { t } = useTranslation()
  const rows = useFieldArray({ control, name })
  return (
    <div className="flex flex-col gap-2" data-testid={testid}>
      {rows.fields.map((f, i) => compact ? (
        <div key={f.id} className="grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)] gap-2 rounded-token bg-surface-muted/30 p-3 [border:1px_solid_var(--line)]">
          <span className="pt-2 text-sm font-semibold text-content-muted">{i + 1}.</span>
          <div className="flex min-w-0 flex-col gap-3">
            {render(i)}
            <div className="flex flex-wrap items-end justify-end gap-2 border-t border-line pt-2">
              {'marks' in empty && <Input className="w-24" label={t('qb.marks')} ltr inputMode="decimal" {...register(`${name}.${i}.marks`)} />}
              <Button type="button" variant="secondary" title={t('common.delete')} aria-label={t('common.delete')} onClick={() => rows.remove(i)}>
                <X aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div key={f.id} className="flex flex-wrap items-end gap-2 rounded-token [border:1px_solid_var(--line)] p-2">
          <span className="text-sm font-medium w-6">{i + 1}.</span>
          {render(i)}
          {'marks' in empty && <Input className="w-20" label={t('qb.marks')} ltr inputMode="decimal" {...register(`${name}.${i}.marks`)} />}
          <Button type="button" variant="secondary" title={t('common.delete')} onClick={() => rows.remove(i)} aria-label={t('common.delete')}><X aria-hidden="true" className="h-4 w-4" /></Button>
        </div>
      ))}
      <div><Button type="button" variant="secondary" onClick={() => rows.append(compact ? { ...empty, options: empty.options.map(option => ({ ...option })) } : empty)} data-action={`add-${name.split('.').pop()}`}><Plus aria-hidden="true" className="h-4 w-4" />{addLabel}</Button></div>
    </div>
  )
}

function McqOptions({ index, control, register, getValues, setValue }) {
  const { t } = useTranslation()
  const optionsName = `structured.mcqs.${index}.options`
  const correctName = `structured.mcqs.${index}.correct`
  const options = useFieldArray({ control, name: optionsName })
  const removeOption = (optionIndex) => {
    if (options.fields.length <= 2) return
    const correct = Number(getValues(correctName) ?? 0)
    options.remove(optionIndex)
    const nextCorrect = correct === optionIndex ? Math.min(optionIndex, options.fields.length - 2) : correct > optionIndex ? correct - 1 : correct
    setValue(correctName, String(nextCorrect), { shouldDirty: true })
  }
  return <div className="flex min-w-0 flex-col gap-3">
    <Textarea className="min-w-0" rows={2} label={t('qb.sub_question')} {...register(`structured.mcqs.${index}.prompt`)} />
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">{t('qb.options')}</legend>
      {options.fields.map((field, optionIndex) => {
        const correctLabel = `${t('qb.correct')} (${romanOptionLabel(optionIndex)})`
        const removeLabel = `${t('common.delete')} (${romanOptionLabel(optionIndex)})`
        return <div key={field.id} className="grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_2rem_2.5rem] items-center gap-2 rounded-token bg-surface px-2 py-1.5 [border:1px_solid_var(--line)]">
          <span dir="ltr" className="text-center text-sm font-semibold text-content-muted">({romanOptionLabel(optionIndex)})</span>
          <Textarea className="min-w-0" rows={2} aria-label={`${t('qb.option_text')} (${romanOptionLabel(optionIndex)})`}
            data-testid={`mcq-option-${index}-${optionIndex}`} {...register(`${optionsName}.${optionIndex}.text`)} />
          <label title={correctLabel} className="flex h-10 w-8 cursor-pointer items-center justify-center rounded-token hover:bg-primary-soft">
            <input type="radio" value={String(optionIndex)} aria-label={correctLabel} className="h-4 w-4 accent-[var(--color-primary)]" {...register(correctName)} />
          </label>
          <Button type="button" variant="secondary" className="h-10 w-10 !p-0" title={removeLabel} data-action={`remove-mcq-option-${index}-${optionIndex}`}
            disabled={options.fields.length <= 2} aria-label={removeLabel} onClick={() => removeOption(optionIndex)}>
            <X aria-hidden="true" className="h-4 w-4 shrink-0" />
          </Button>
        </div>
      })}
      <div className="flex justify-start">
        <Button type="button" variant="secondary" data-action={`add-mcq-option-${index}`} onClick={() => options.append({ text: '' })}>
          <Plus aria-hidden="true" className="h-4 w-4" />{t('qb.add_option')}
        </Button>
      </div>
    </fieldset>
  </div>
}

/** The editor section for a structured type: the type's own part first, any other kind added with "Add a part" */
export function StructuredEditor({ structure, register, control, error, getValues, setValue, onFieldFocus }) {
  const { t, i18n } = useTranslation()
  const s = useWatch({ control, name: 'structured' }) ?? STRUCTURED_EMPTY
  const gapArray = useFieldArray({ control, name: 'structured.gaps' })
  const [extra, setExtra] = useState([])
  const passageRef = useRef(null)
  if (!structure) return null
  const boxLabel = { gap: t('qb.word_box'), passage: t('qb.passage'), passage_mcq: t('qb.stimulus') }[structure] ?? t('qb.stimulus')
  const passageField = structure === 'gap' ? register('question_text', { required: t('super.required') }) : {}
  const shown = KINDS.map(([l]) => l).filter(l => l === DEFAULT_LIST[structure] || (s[l]?.length ?? 0) > 0 || extra.includes(l))
  const rows = (list, render, testid, compact = false) => (
    <section key={list} className="flex flex-col gap-1" data-part={list}>
      <h3 className="text-sm font-semibold">{t(`qbx.kinds.${list}`)}</h3>
      <Rows name={`structured.${list}`} control={control} register={register} empty={EMPTY_ROW[list]} addLabel={t(`qbx.add.${list}`)} testid={testid} render={render} compact={compact} />
    </section>
  )
  const part = {
    gaps: () => <div key="gaps" className="flex flex-col gap-2" data-testid="qb-gaps">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-sm font-medium" htmlFor="qb-gap-passage">{t('qb.question')}</label>
        <Button type="button" variant="secondary" data-action="add-gap-blank" onClick={() => {
          const area = passageRef.current
          const text = getValues('question_text') ?? ''
          const start = area?.selectionStart ?? text.length
          const end = area?.selectionEnd ?? start
          const token = `${start > 0 && !/\s$/.test(text.slice(0, start)) ? ' ' : ''}${gapToken(s.gaps.length)}${end < text.length && !/^\s/.test(text.slice(end)) ? ' ' : ''}`
          const next = `${text.slice(0, start)}${token}${text.slice(end)}`
          setValue('question_text', next, { shouldDirty: true })
          gapArray.append({ ...EMPTY_ROW.gaps })
          requestAnimationFrame(() => { area?.focus(); area?.setSelectionRange(start + token.length, start + token.length) })
        }}><Plus aria-hidden="true" className="h-4 w-4" />{t('qbx.add.gaps')}</Button>
      </div>
      <Textarea id="qb-gap-passage" rows={5} dir="auto" {...passageField} onFocus={onFieldFocus} onSelect={onFieldFocus} ref={el => { passageRef.current = el; passageField.ref(el) }} />
      <div className="flex flex-col gap-2">
        {s.gaps.map((g, i) => <div key={i} className="grid gap-2 rounded-token [border:1px_solid_var(--line)] p-2 sm:grid-cols-2" data-gap-index={i}>
          <strong className="text-sm">({gapLabel(i)}) —</strong>
          {g.prompt && <Textarea className="sm:col-span-2" rows={2} label={t('qb.gap_sentence')} hint={t('qb.blank_hint')} {...register(`structured.gaps.${i}.prompt`)} />}
          <Input label={t('qb.gap_answers')} hint={t('qb.gap_answers_hint')} {...register(`structured.gaps.${i}.answers`)} />
          <Input label={t('qbx.hint')} {...register(`structured.gaps.${i}.hint`)} />
          <Input label={t('qb.marks')} ltr inputMode="decimal" {...register(`structured.gaps.${i}.marks`)} />
          <div className="flex gap-1">
            <Button type="button" variant="secondary" disabled={i === 0} aria-label={`Move blank ${i + 1} up`} onClick={() => {
              gapArray.move(i, i - 1)
              let index = 0
              setValue('question_text', getValues('question_text').replace(GAP_TOKEN_PATTERN, () => gapToken(index++)), { shouldDirty: true })
            }}><ArrowUp aria-hidden="true" className="h-4 w-4" /></Button>
            <Button type="button" variant="secondary" disabled={i === s.gaps.length - 1} aria-label={`Move blank ${i + 1} down`} onClick={() => {
              gapArray.move(i, i + 1)
              let index = 0
              setValue('question_text', getValues('question_text').replace(GAP_TOKEN_PATTERN, () => gapToken(index++)), { shouldDirty: true })
            }}><ArrowDown aria-hidden="true" className="h-4 w-4" /></Button>
          </div>
          <Button type="button" variant="secondary" aria-label={t('common.delete')} onClick={() => {
            const pattern = GAP_TOKEN_PATTERN
            let current = 0
            let next = 0
            const updated = getValues('question_text').replace(pattern, () => current++ === i ? '' : gapToken(next++))
            setValue('question_text', updated, { shouldDirty: true })
            gapArray.remove(i)
          }}><X aria-hidden="true" className="h-4 w-4" /></Button>
        </div>)}
      </div>
    </div>,
    pairs: () => rows('pairs', i => <div className="flex min-w-0 flex-col gap-3">
      <Textarea rows={2} label={t('qb.left')} {...register(`structured.pairs.${i}.left`)} />
      <Textarea rows={2} label={t('qb.right')} {...register(`structured.pairs.${i}.right`)} />
    </div>, 'qb-pairs'),
    steps: () => <div key="steps"><p className="text-xs text-content-muted">{t('qb.order_hint')}</p>
      {rows('steps', i => <Textarea className="w-full min-w-0" rows={2} label={t('qb.piece')} {...register(`structured.steps.${i}.text`)} />, 'qb-steps')}</div>,
    subs: () => rows('subs', i => <div className="flex min-w-0 flex-col gap-3">
      <Textarea className="min-w-0" rows={2} label={t('qb.sub_question')} {...register(`structured.subs.${i}.prompt`)} />
      <Textarea className="min-w-0" rows={3} label={t('qb.answer')} {...register(`structured.subs.${i}.answer`)} />
    </div>, 'qb-subs', true),
    mcqs: () => rows('mcqs', i => <McqOptions index={i} control={control} register={register} getValues={getValues} setValue={setValue} />, 'qb-mcqs', true),
    tfs: () => rows('tfs', i => <div className="flex min-w-0 flex-col gap-3">
      <Textarea rows={2} label={t('qbx.statement')} {...register(`structured.tfs.${i}.prompt`)} />
      <Select className="w-28" label={t('qbx.is')} options={[{ value: 'true', label: t('qb.true') }, { value: 'false', label: t('qb.false') }]} {...register(`structured.tfs.${i}.value`)} />
      <Textarea rows={2} label={t('qbx.correction')} {...register(`structured.tfs.${i}.correction`)} />
    </div>, 'qb-tfs'),
    tables: () => rows('tables', i => {
      const item = s.tables[i]
      const flowChart = structure === 'passage' && !String(item.columns ?? '').trim() && (!String(item.rows ?? '').trim() || isFlowChartTable(item))
      if (!flowChart) return <div className="flex-1 grid gap-2">
        <Input label={t('qbx.columns')} hint={t('qbx.columns_hint')} {...register(`structured.tables.${i}.columns`)} />
        <Textarea label={t('qbx.rows')} hint={t('qbx.rows_hint')} rows={4} {...register(`structured.tables.${i}.rows`)} />
      </div>
      const formatNumber = number => new Intl.NumberFormat(i18n.language).format(number)
      const values = flowChartEditorValues(item)
      const updateCell = (cellIndex, value) => {
        const next = [...values]
        next[cellIndex] = value
        setValue(`structured.tables.${i}.columns`, '', { shouldDirty: true })
        setValue(`structured.tables.${i}.rows`, serializeFlowChart(next), { shouldDirty: true })
      }
      const updateAnswerCount = change => {
        const next = [...values]
        change(next)
        setValue(`structured.tables.${i}.columns`, '', { shouldDirty: true })
        setValue(`structured.tables.${i}.rows`, serializeFlowChart(next), { shouldDirty: true })
      }
      return <div className="flex min-w-0 flex-col gap-3" data-testid={`qb-flowchart-editor-${i}`}>
        <Input dir="auto" label={t('qbx.flowchart_start')} value={values[0]} onChange={event => updateCell(0, event.target.value)} />
        <div className="grid min-w-0 grid-cols-1 gap-3" data-testid={`qb-flowchart-answer-fields-${i}`}>
          {values.slice(1).map((value, answerIndex) => <div key={answerIndex} className="flex min-w-0 items-center gap-2">
            <Textarea className="min-w-0 flex-1" dir="auto" rows={2} label={t('qbx.flowchart_answer', { n: formatNumber(answerIndex + 2) })}
              hint={t('qbx.flowchart_hint')} value={value} onChange={event => updateCell(answerIndex + 1, event.target.value)} />
            <Button type="button" variant="secondary" title={t('qbx.flowchart_remove', { n: formatNumber(answerIndex + 2) })}
              aria-label={t('qbx.flowchart_remove', { n: formatNumber(answerIndex + 2) })} disabled={values.length <= 3}
              onClick={() => updateAnswerCount(next => next.splice(answerIndex + 1, 1))}>
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>)}
        </div>
        <div><Button type="button" variant="secondary" data-action={`add-flowchart-answer-${i}`} onClick={() => updateAnswerCount(next => next.push(''))}>
          <Plus aria-hidden="true" className="h-4 w-4" />{t('qbx.flowchart_add_answer')}
        </Button></div>
      </div>
    }, 'qb-tables'),
    triples: () => rows('triples', i => <div className="flex min-w-0 flex-col gap-3">
      <Textarea rows={2} label={t('qbx.col_a')} {...register(`structured.triples.${i}.left`)} />
      <Textarea rows={2} label={t('qbx.col_b')} {...register(`structured.triples.${i}.middle`)} />
      <Textarea rows={2} label={t('qbx.col_c')} {...register(`structured.triples.${i}.right`)} />
    </div>, 'qb-triples'),
    multis: () => rows('multis', i => <div className="flex min-w-0 flex-col gap-3">
      <Textarea rows={2} label={t('qbx.item')} {...register(`structured.multis.${i}.prompt`)} />
      <Input className="flex-1 min-w-40" label={t('qbx.fields')} hint={t('qbx.comma_hint')} {...register(`structured.multis.${i}.fields`)} />
      <Input className="flex-1 min-w-40" label={t('qbx.values')} hint={t('qbx.comma_hint')} {...register(`structured.multis.${i}.values`)} />
    </div>, 'qb-multis'),
  }
  const addable = KINDS.map(([l]) => l).filter(l => !shown.includes(l))
  return (
    <fieldset className="sm:col-span-2 flex flex-col gap-3" data-testid="qb-structured">
      <legend className="font-semibold mb-1">{t(`qb.structure.${structure}`)}</legend>
      <Textarea label={boxLabel} rows={structure === 'gap' ? 2 : 5} hint={structure === 'gap' ? t('qb.word_box_hint') : undefined} {...register('structured.box')}
        onFocus={onFieldFocus} onSelect={onFieldFocus} />
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
export function StructuredPreview({ structure, s, questionText = '', media = [], onImageClick, onTableClick, showAnswers = true, sectionTitles = {} }) {
  const { t } = useTranslation()
  if (!structure) return null
  const muted = 'text-xs text-content-muted'
  const has = (l) => (s[l]?.length ?? 0) > 0
  const groupedKinds = KINDS.map(([kind]) => kind).filter(kind => has(kind) && !(structure === 'gap' && kind === 'gaps'))
  const onlyFlowChart = groupedKinds.length === 1 && s.tables.length === 1 && isFlowChartTable(s.tables[0])
  const head = (l) => <h4 className="text-sm font-semibold">{alphabeticLabel(groupedKinds.indexOf(l)).toUpperCase()}. {sectionTitles[l] ?? t(`qbx.kinds.${l}`)}</h4>
  const rich = (text, field) => <MathText text={text} media={media} onImageClick={onImageClick ? attrs => onImageClick(field, attrs, media.find(item => String(item.id) === attrs.media)?.url) : undefined}
    onTableClick={onTableClick ? index => onTableClick(field, index) : undefined} />
  const inlineGapPassage = () => {
    const nodes = []
    const pattern = GAP_TOKEN_PATTERN
    let cursor = 0
    let index = 0
    let match
    while ((match = pattern.exec(questionText)) !== null) {
      if (match.index > cursor) nodes.push(<span key={`text-${index}`}>{rich(questionText.slice(cursor, match.index), 'question_text')}</span>)
      const hint = s.gaps[index]?.hint?.trim()
      nodes.push(<span key={`blank-${index}`}><strong>{match[0].replace(/_+/g, ' ').trim()} <span className="inline-block w-16 border-b-2 border-current align-baseline" aria-label="blank" /></strong>{hint && <span className="text-content-muted"> ({hint})</span>}</span>)
      cursor = match.index + match[0].length
      index += 1
    }
    if (cursor < questionText.length) nodes.push(<span key="text-tail">{rich(questionText.slice(cursor), 'question_text')}</span>)
    return nodes
  }
  return (
    <div className="flex flex-col gap-2" data-testid="qb-structured-preview">
      {s.box && <div className="rounded-token bg-surface-muted p-2 text-sm">{rich(s.box, 'structured.box')}</div>}
      {structure === 'gap' && questionText && <div className="text-base" data-testid="qb-gap-passage-preview">{inlineGapPassage()}</div>}
      {has('mcqs') && <div>{head('mcqs')}<ol className="flex flex-col gap-2 list-none">{s.mcqs.map((q, i) => <li key={i}><span className="font-medium">({alphabeticLabel(i)})</span> {rich(q.prompt, `structured.mcqs.${i}.prompt`)}
        <ul className="flex flex-col gap-1 ps-4">{q.options.map((option, k) => option.text.trim() && <li key={k}><span className="font-medium">({romanOptionLabel(k)})</span> {rich(option.text, `structured.mcqs.${i}.options.${k}.text`)}{showAnswers && String(k) === String(q.correct) && <span className={muted}> ({t('qb.correct')})</span>}</li>)}</ul></li>)}</ol></div>}
      {has('subs') && <div>{head('subs')}<ol className="flex flex-col gap-1 list-none">{s.subs.map((q, i) => <li key={i}><span className="font-medium">({alphabeticLabel(i)})</span> {rich(q.prompt, `structured.subs.${i}.prompt`)} {showAnswers && <span className={muted}>— {rich(q.answer, `structured.subs.${i}.answer`)}</span>}</li>)}</ol></div>}
      {has('gaps') && (structure !== 'gap' || showAnswers) && <div>{structure === 'gap' ? <h4 className="text-sm font-semibold">{t('qb.answer')}</h4> : head('gaps')}<ol className="flex flex-col gap-1 list-none">{s.gaps.map((g, i) => <li key={i}>
        {structure === 'gap' ? <><strong>({gapLabel(i)}) <span className="inline-block w-16 border-b-2 border-current align-baseline" aria-label="blank" /></strong>{g.prompt && <> {rich(g.prompt, `structured.gaps.${i}.prompt`)}</>}</> : rich(g.prompt, `structured.gaps.${i}.prompt`)}
        {showAnswers && <span className={muted}>[{g.answers || '—'}{g.marks ? ` · ${g.marks} ${t('qb.marks')}` : ''}]</span>}
      </li>)}</ol></div>}
      {has('tfs') && <div>{head('tfs')}<ol className="flex flex-col gap-1 list-none">{s.tfs.map((x, i) => <li key={i}><span className="font-medium">({alphabeticLabel(i)})</span> {rich(x.prompt, `structured.tfs.${i}.prompt`)} {showAnswers && <span className={muted}>— {t(x.value === 'true' ? 'qb.true' : 'qb.false')}{x.correction ? `: ${x.correction}` : ''}</span>}</li>)}</ol></div>}
      {has('tables') && <div>{!onlyFlowChart && head('tables')}{s.tables.map((x, i) => { const p = parseTable(x.columns, x.rows); return isFlowChartTable(x) ? (
        <div key={i} className="grid w-full min-w-0 items-stretch gap-1 pb-1" dir="ltr" data-testid="qb-flow-chart"
          style={{ gridTemplateColumns: p.table.rows[0].flatMap((_, index) => [index === 0 ? '1.75fr' : '1fr', ...(index < p.table.rows[0].length - 1 ? ['auto'] : [])]).join(' ') }}>
          {p.table.rows[0].map((cell, index) => <Fragment key={index}>
            <div className="flex min-h-16 min-w-0 items-center justify-center rounded-token px-1 py-2 text-center text-xs [border:1px_solid_var(--line)]">
              {cell ?? <div className="flex w-full flex-col items-center gap-1"><span className="font-semibold">{index + 1}.</span><span className="min-h-5 w-full border-b border-current" /></div>}
            </div>
            {index < p.table.rows[0].length - 1 && <span className="self-center" aria-hidden="true">→</span>}
          </Fragment>)}
        </div>
      ) : (
        <table key={i} className="my-1 border-collapse text-sm"><tbody>
          {p.table.columns.length > 0 && <tr>{p.table.columns.map((c, k) => <th key={k} className="px-2 py-1 [border:1px_solid_var(--line)]">{c}</th>)}</tr>}
          {p.table.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c} className="px-2 py-1 [border:1px_solid_var(--line)]">{cell ?? <span className={muted}>{showAnswers ? `[${(p.cells[`${r}-${c}`] ?? []).join(', ')}]` : '________'}</span>}</td>)}</tr>)}
        </tbody></table>) })}</div>}
      {has('triples') && <div>{head('triples')}<ul className="flex flex-col gap-1 text-sm">{s.triples.map((x, i) => <li key={i} className="flex flex-wrap gap-3"><span className="font-medium">({alphabeticLabel(i)})</span>{rich(x.left, `structured.triples.${i}.left`)}<span aria-hidden="true">—</span>{showAnswers ? rich(x.middle, `structured.triples.${i}.middle`) : '________'}<span aria-hidden="true">—</span>{showAnswers ? rich(x.right, `structured.triples.${i}.right`) : '________'}</li>)}</ul></div>}
      {has('multis') && <div>{head('multis')}<ol className="flex flex-col gap-1 list-none">{s.multis.map((x, i) => <li key={i}><span className="font-medium">({alphabeticLabel(i)})</span> {rich(x.prompt, `structured.multis.${i}.prompt`)} {showAnswers && <span className={muted}>— {csv(x.fields).map((f, k) => `${f}: ${csv(x.values)[k] ?? ''}`).join('; ')}</span>}</li>)}</ol></div>}
      {has('pairs') && <div>{head('pairs')}<ul className="flex flex-col gap-1 text-sm">{s.pairs.map((p, i) => <li key={i} className="flex flex-wrap gap-4"><span className="font-medium">({alphabeticLabel(i)})</span>{rich(p.left, `structured.pairs.${i}.left`)}<span aria-hidden="true">—</span>{showAnswers ? rich(p.right, `structured.pairs.${i}.right`) : '________'}</li>)}</ul></div>}
      {has('steps') && <div>{head('steps')}<ol className="flex flex-col gap-1 list-none">{[...s.steps].sort((a, b) => showAnswers ? 0 : a.text.localeCompare(b.text)).map((st, i) => <li key={i}><span className="font-medium">({alphabeticLabel(i)})</span> {rich(st.text, `structured.steps.${i}.text`)}</li>)}</ol></div>}
    </div>
  )
}

/** Read-only answer key for the writer's structured question list. */
export function StructuredAnswers({ s, media = [], sectionTitles = {} }) {
  const { t } = useTranslation()
  const groups = KINDS.map(([kind]) => kind).filter(kind => (s[kind]?.length ?? 0) > 0)
  const title = kind => `${alphabeticLabel(groups.indexOf(kind)).toUpperCase()}. ${sectionTitles[kind] ?? t(`qbx.kinds.${kind}`)}`
  const rich = text => <MathText text={text} media={media} />
  const onlyFlowChart = groups.length === 1 && s.tables.length === 1 && isFlowChartTable(s.tables[0])
  const flowChartAnswers = item => <ol className="list-decimal ps-6">{flowChartValues(item).map((value, index) => <li key={index}>{value ? rich(value) : '—'}</li>)}</ol>
  const list = (kind, values) => <section key={kind} className="flex flex-col gap-1" data-answer-part={kind}>
    <h4 className="font-semibold">{title(kind)}</h4>
    <ol className="flex flex-col gap-1 list-none ps-2">{values.map((value, index) => <li key={index}><span className="font-medium">({alphabeticLabel(index)})</span> {value}</li>)}</ol>
  </section>
  return <div className="flex flex-col gap-3" data-testid="qb-structured-answers">
    {s.mcqs.length > 0 && list('mcqs', s.mcqs.map(question => {
      const correct = question.options[Number(question.correct)]?.text
      return correct ? <><span className="font-medium">({romanOptionLabel(Number(question.correct))})</span> {rich(correct)}</> : '—'
    }))}
    {s.subs.length > 0 && list('subs', s.subs.map(question => question.answer ? rich(question.answer) : '—'))}
    {s.gaps.length > 0 && list('gaps', s.gaps.map(gap => gap.answers ? gap.answers.split(',').map(answer => answer.trim()).filter(Boolean).join(', ') : '—'))}
    {s.tfs.length > 0 && list('tfs', s.tfs.map(item => <>{t(item.value === 'true' ? 'qb.true' : 'qb.false')}{item.correction && <> — {rich(item.correction)}</>}</>))}
    {s.tables.some(item => !isFlowChartTable(item)) && list('tables', s.tables.filter(item => !isFlowChartTable(item)).map(item => {
      const parsed = parseTable(item.columns, item.rows)
      return <table className="border-collapse text-sm"><tbody>
        {parsed.table.columns.length > 0 && <tr>{parsed.table.columns.map((column, columnIndex) => <th key={columnIndex} className="px-2 py-1 text-start [border:1px_solid_var(--line)]">{column}</th>)}</tr>}
        {parsed.table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) => <td key={columnIndex} className="px-2 py-1 [border:1px_solid_var(--line)]">{cell ?? (parsed.cells[`${rowIndex}-${columnIndex}`] ?? []).join(', ')}</td>)}</tr>)}
      </tbody></table>
    }))}
    {s.tables.some(isFlowChartTable) && (onlyFlowChart
      ? <section className="flex flex-col gap-1" data-answer-part="flowchart"><h4 className="font-semibold">{t('qb.answer')}</h4>{flowChartAnswers(s.tables.find(isFlowChartTable))}</section>
      : list('tables', s.tables.filter(isFlowChartTable).map(flowChartAnswers)))}
    {s.triples.length > 0 && list('triples', s.triples.map(item => <>{rich(item.left)} — {rich(item.middle)} — {rich(item.right)}</>))}
    {s.multis.length > 0 && list('multis', s.multis.map(item => csv(item.fields).map((field, index) => `${field}: ${csv(item.values)[index] ?? '—'}`).join('; ')))}
    {s.pairs.length > 0 && list('pairs', s.pairs.map(item => <>{rich(item.left)} — {rich(item.right)}</>))}
    {s.steps.length > 0 && list('steps', [...s.steps].map(item => rich(item.text)))}
  </div>
}
