import { useTranslation } from 'react-i18next'
import { useFieldArray } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import Button from '../../components/Button'
import { Input, Select, Textarea } from '../../components/FormField'
import MathText from './MathText'

// QB.4 (D65): the structured question types. The form keeps them in a writer-friendly shape (`structured`) and turns them into
// the API's stimuli + items: gap (a word box or passage + gaps with accepted answers), match (left / right pairs), order (the
// pieces in the right order), passage (a passage + sub-questions with answers), passage_mcq (a stimulus + MCQs).
export const STRUCTURED_EMPTY = { box: '', gaps: [], pairs: [], steps: [], subs: [], mcqs: [] }

/** API question -> form */
export function fromQuestion(q) {
  const items = q.items ?? []
  const of = (type) => items.filter(i => i.item_type === type)
  return {
    box: q.stimuli?.[0]?.content_text ?? '',
    gaps: of('gap').map(i => ({ prompt: i.prompt_text ?? '', answers: (i.answer_json?.answers ?? []).join(', ') })),
    pairs: of('match_pair').map(i => ({ left: i.prompt_text ?? '', right: i.answer_json?.right ?? '' })),
    steps: of('order_step').sort((a, b) => (a.answer_json?.position ?? 0) - (b.answer_json?.position ?? 0)).map(i => ({ text: i.prompt_text ?? '' })),
    subs: of('sub_question').map(i => ({ prompt: i.prompt_text ?? '', answer: i.answer_json?.answer_text ?? '' })),
    mcqs: of('sub_mcq').map(i => ({ prompt: i.prompt_text ?? '', options: [0, 1, 2, 3].map(k => i.prompt_json?.options?.[k] ?? ''), correct: String(i.answer_json?.correct ?? 0) })),
  }
}

/** form -> API { stimuli, items } for a structure (null = not a structured type: send nothing) */
export function toPayload(structure, s) {
  if (!structure) return {}
  const box = (label) => (s.box.trim() ? [{ label, content_text: s.box }] : [])
  const at = (stimuli) => (stimuli.length ? 0 : null)
  if (structure === 'gap') {
    const stimuli = box('word_box')
    return { stimuli, items: s.gaps.map(g => ({ item_type: 'gap', stimulus_index: at(stimuli), prompt_text: g.prompt, answer_json: { answers: g.answers.split(',').map(a => a.trim()).filter(Boolean) } })) }
  }
  if (structure === 'match') return { stimuli: [], items: s.pairs.map(p => ({ item_type: 'match_pair', prompt_text: p.left, answer_json: { right: p.right } })) }
  if (structure === 'order') return { stimuli: [], items: s.steps.map((st, i) => ({ item_type: 'order_step', prompt_text: st.text, answer_json: { position: i + 1 } })) }
  if (structure === 'passage') {
    const stimuli = box('passage')
    return { stimuli, items: s.subs.map(q => ({ item_type: 'sub_question', stimulus_index: at(stimuli), prompt_text: q.prompt, answer_json: { answer_text: q.answer } })) }
  }
  if (structure === 'passage_mcq') {
    const stimuli = box('stimulus')
    return { stimuli, items: s.mcqs.map(q => ({ item_type: 'sub_mcq', stimulus_index: at(stimuli), prompt_text: q.prompt,
      prompt_json: { options: q.options.filter(o => o.trim()) }, answer_json: { correct: Number(q.correct) } })) }
  }
  return {}
}

function Rows({ name, control, empty, render, addLabel, testid }) {
  const { t } = useTranslation()
  const rows = useFieldArray({ control, name })
  return (
    <div className="flex flex-col gap-2" data-testid={testid}>
      {rows.fields.map((f, i) => (
        <div key={f.id} className="flex flex-wrap items-end gap-2 rounded-token [border:1px_solid_var(--line)] p-2">
          <span className="text-sm font-medium w-6">{i + 1}.</span>
          {render(i)}
          <Button variant="secondary" onClick={() => rows.remove(i)} aria-label={t('common.delete')}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>
        </div>
      ))}
      <div><Button variant="secondary" onClick={() => rows.append(empty)} data-action={`add-${name.split('.').pop()}`}><Plus aria-hidden="true" className="h-4 w-4" />{addLabel}</Button></div>
    </div>
  )
}

/** The editor section for a structured type */
export function StructuredEditor({ structure, register, control, error }) {
  const { t } = useTranslation()
  if (!structure) return null
  const boxLabel = { gap: t('qb.word_box'), passage: t('qb.passage'), passage_mcq: t('qb.stimulus') }[structure]
  return (
    <fieldset className="sm:col-span-2 flex flex-col gap-3" data-testid="qb-structured">
      <legend className="font-semibold mb-1">{t(`qb.structure.${structure}`)}</legend>
      {boxLabel && <Textarea label={boxLabel} rows={structure === 'gap' ? 2 : 5} hint={structure === 'gap' ? t('qb.word_box_hint') : undefined} {...register('structured.box')} />}
      {structure === 'gap' && <Rows name="structured.gaps" control={control} empty={{ prompt: '', answers: '' }} addLabel={t('qb.add_gap')} testid="qb-gaps"
        render={i => <>
          <Input className="flex-1 min-w-48" label={t('qb.gap_sentence')} hint={t('qb.blank_hint')} {...register(`structured.gaps.${i}.prompt`)} />
          <Input className="flex-1 min-w-40" label={t('qb.gap_answers')} hint={t('qb.gap_answers_hint')} {...register(`structured.gaps.${i}.answers`)} />
        </>} />}
      {structure === 'match' && <Rows name="structured.pairs" control={control} empty={{ left: '', right: '' }} addLabel={t('qb.add_pair')} testid="qb-pairs"
        render={i => <>
          <Input className="flex-1 min-w-32" label={t('qb.left')} {...register(`structured.pairs.${i}.left`)} />
          <Input className="flex-1 min-w-32" label={t('qb.right')} {...register(`structured.pairs.${i}.right`)} />
        </>} />}
      {structure === 'order' && <>
        <p className="text-xs text-content-muted">{t('qb.order_hint')}</p>
        <Rows name="structured.steps" control={control} empty={{ text: '' }} addLabel={t('qb.add_step')} testid="qb-steps"
          render={i => <Input className="flex-1 min-w-48" label={t('qb.piece')} {...register(`structured.steps.${i}.text`)} />} />
      </>}
      {structure === 'passage' && <Rows name="structured.subs" control={control} empty={{ prompt: '', answer: '' }} addLabel={t('qb.add_sub')} testid="qb-subs"
        render={i => <>
          <Input className="flex-1 min-w-48" label={t('qb.sub_question')} {...register(`structured.subs.${i}.prompt`)} />
          <Input className="flex-1 min-w-40" label={t('qb.answer')} {...register(`structured.subs.${i}.answer`)} />
        </>} />}
      {structure === 'passage_mcq' && <Rows name="structured.mcqs" control={control} empty={{ prompt: '', options: ['', '', '', ''], correct: '0' }} addLabel={t('qb.add_sub')} testid="qb-mcqs"
        render={i => <div className="flex-1 grid gap-2 sm:grid-cols-2">
          <Input className="sm:col-span-2" label={t('qb.sub_question')} {...register(`structured.mcqs.${i}.prompt`)} />
          {[0, 1, 2, 3].map(k => <Input key={k} label={`${t('qb.option_text')} ${['ক', 'খ', 'গ', 'ঘ'][k]}`} {...register(`structured.mcqs.${i}.options.${k}`)} />)}
          <Select label={t('qb.correct')} options={[0, 1, 2, 3].map(k => ({ value: String(k), label: ['ক', 'খ', 'গ', 'ঘ'][k] }))} {...register(`structured.mcqs.${i}.correct`)} />
        </div>} />}
      {error && <p role="alert" className="text-xs font-medium text-content">{error}</p>}
    </fieldset>
  )
}

/** The preview of a structured type (the writer sees the answers) */
export function StructuredPreview({ structure, s }) {
  const { t } = useTranslation()
  if (!structure) return null
  return (
    <div className="flex flex-col gap-2" data-testid="qb-structured-preview">
      {s.box && <div className="rounded-token bg-surface-muted p-2 text-sm"><MathText text={s.box} /></div>}
      {structure === 'gap' && <ol className="flex flex-col gap-1">{s.gaps.map((g, i) => <li key={i}><MathText text={g.prompt} /> <span className="text-xs text-content-muted">[{g.answers}]</span></li>)}</ol>}
      {structure === 'match' && <ul className="flex flex-col gap-1 text-sm">{s.pairs.map((p, i) => <li key={i} className="flex flex-wrap gap-4"><MathText text={p.left} /><span aria-hidden="true">—</span><MathText text={p.right} /></li>)}</ul>}
      {structure === 'order' && <ol className="flex flex-col gap-1 list-decimal list-inside">{s.steps.map((st, i) => <li key={i}><MathText text={st.text} /></li>)}</ol>}
      {structure === 'passage' && <ol className="flex flex-col gap-1">{s.subs.map((q, i) => <li key={i}>{i + 1}. <MathText text={q.prompt} /> <span className="text-xs text-content-muted">— {q.answer}</span></li>)}</ol>}
      {structure === 'passage_mcq' && <ol className="flex flex-col gap-2">{s.mcqs.map((q, i) => <li key={i}>{i + 1}. <MathText text={q.prompt} />
        <ul className="flex flex-col gap-1 px-4">{q.options.filter(Boolean).map((o, k) => <li key={k}>{['ক', 'খ', 'গ', 'ঘ'][k]}. <MathText text={o} />{String(k) === String(q.correct) && <span className="text-xs text-content-muted"> ({t('qb.correct')})</span>}</li>)}</ul></li>)}</ol>}
    </div>
  )
}
