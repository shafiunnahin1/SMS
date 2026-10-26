import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import '../i18n'
import { fromQuestion, STRUCTURED_EMPTY, StructuredAnswers, StructuredEditor, StructuredPreview, toPayload } from '../features/qb/Structured'

function EditorHarness() {
  const form = useForm({ defaultValues: { structured: {
    ...STRUCTURED_EMPTY,
    mcqs: [{ prompt: 'Which?', options: [{ text: 'One' }, { text: 'Two' }, { text: 'Three' }], correct: '2', marks: '1' }],
  } } })
  return <>
    <output data-testid="correct-option">{form.watch('structured.mcqs.0.correct')}</output>
    <StructuredEditor structure="passage_mcq" {...form} />
  </>
}

function WrittenHarness() {
  const form = useForm({ defaultValues: { structured: {
    ...STRUCTURED_EMPTY,
    subs: [{ prompt: 'Why?', answer: 'Because of the story.', marks: '2' }],
  } } })
  return <StructuredEditor structure="passage_mcq" {...form} />
}

function AllPromptsHarness() {
  const form = useForm({ defaultValues: { structured: {
    ...STRUCTURED_EMPTY,
    gaps: [{ prompt: 'Gap question', answers: 'answer' }],
    pairs: [{ left: 'Match prompt', right: 'Match answer' }],
    steps: [{ text: 'Order step' }],
    subs: [{ prompt: 'Short question', answer: 'Short answer', marks: '2' }],
    mcqs: [{ prompt: 'MCQ prompt', options: [{ text: 'One' }, { text: 'Two' }], correct: '0' }],
    tfs: [{ prompt: 'True or false statement', correction: 'Correction' }],
    triples: [{ left: 'Column A', middle: 'Column B', right: 'Column C' }],
    multis: [{ prompt: 'Multi-field question', fields: 'Field', values: 'Value' }],
  } } })
  return <StructuredEditor structure="gap" {...form} />
}

function FlowChartEditorHarness() {
  const form = useForm({ defaultValues: { structured: {
    ...STRUCTURED_EMPTY,
    tables: [{ columns: '', rows: '1. Making life stressful | [Leading to financial ruin or debt] | [Creating unhappiness within families]', marks: '10' }],
  } } })
  return <>
    <output data-testid="flowchart-editor-data">{JSON.stringify(form.watch('structured.tables.0'))}</output>
    <StructuredEditor structure="passage" {...form} />
  </>
}

describe('structured passage MCQs', () => {
  it('uses a multiline answer area inside the numbered written-question card', () => {
    const { container } = render(<WrittenHarness />)
    const answer = container.querySelector('[name="structured.subs.0.answer"]')
    expect(answer.tagName).toBe('TEXTAREA')
    expect(answer.rows).toBe(3)
    expect(container.querySelector('[name="structured.subs.0.prompt"]').tagName).toBe('TEXTAREA')
    expect([...container.querySelector('[data-testid="qb-subs"]').children].some(row => row.className.includes('grid-cols-'))).toBe(true)
  })

  it('uses textareas for written prompts across structured item types', () => {
    const { container } = render(<AllPromptsHarness />)
    const prompts = [
      'structured.gaps.0.prompt', 'structured.pairs.0.left', 'structured.steps.0.text',
      'structured.subs.0.prompt', 'structured.mcqs.0.prompt', 'structured.tfs.0.prompt',
      'structured.triples.0.left', 'structured.triples.0.middle', 'structured.triples.0.right',
      'structured.multis.0.prompt',
    ]
    expect(prompts.map(name => container.querySelector(`[name="${name}"]`)?.tagName)).toEqual(prompts.map(() => 'TEXTAREA'))
  })

  it('adds and removes options while retaining at least two and tracking the correct choice', () => {
    const { container } = render(<EditorHarness />)
    expect(container.querySelectorAll('[data-testid^="mcq-option-0-"]')).toHaveLength(3)
    expect(container.querySelector('[name="structured.mcqs.0.prompt"]').tagName).toBe('TEXTAREA')
    expect(container.querySelector('[name="structured.mcqs.0.options.0.text"]').tagName).toBe('TEXTAREA')

    fireEvent.click(container.querySelector('[data-action="remove-mcq-option-0-0"]'))
    expect(container.querySelectorAll('[data-testid^="mcq-option-0-"]')).toHaveLength(2)
    expect(screen.getByTestId('correct-option')).toHaveTextContent('1')
    expect(container.querySelector('[data-action="remove-mcq-option-0-0"]')).toBeDisabled()

    fireEvent.click(container.querySelector('[data-action="add-mcq-option-0"]'))
    expect(container.querySelectorAll('[data-testid^="mcq-option-0-"]')).toHaveLength(3)
  })

  it('round-trips a variable option count and remaps the correct answer after blank options are omitted', () => {
    const source = { stimuli: [], items: [{ item_type: 'sub_mcq', prompt_text: 'Which?',
      prompt_json: { options: ['one', 'two', 'three'] }, answer_json: { correct: 2 } }] }
    const hydrated = fromQuestion(source)
    expect(hydrated.mcqs[0].options.map(option => option.text)).toEqual(['one', 'two', 'three'])
    const payload = toPayload('passage_mcq', { ...STRUCTURED_EMPTY, mcqs: [{ prompt: 'Which?',
      options: [{ text: '' }, { text: 'two' }, { text: 'three' }], correct: '2', marks: '1' }] })
    expect(payload.items[0].prompt_json.options).toEqual(['two', 'three'])
    expect(payload.items[0].answer_json.correct).toBe(1)
  })

  it('previews board-style A/B sections, lettered questions, and roman-numbered choices', () => {
    render(<StructuredPreview structure="passage_mcq" s={{ ...STRUCTURED_EMPTY,
      mcqs: [{ prompt: 'First?', options: [{ text: 'One' }, { text: 'Two' }], correct: '0' }],
      subs: [{ prompt: 'Explain.', answer: 'Because.', marks: '2' }],
    }} />)
    const preview = screen.getByTestId('qb-structured-preview')
    const text = preview.textContent
    expect(text).toContain('A.')
    expect(text).toContain('B.')
    expect(text).toContain('(a)')
    expect([...screen.getByTestId('qb-structured-preview').querySelectorAll('[data-option-label]')].map(option => option.dataset.optionLabel)).toEqual(['ক', 'খ'])
    expect(text.indexOf('A.')).toBeLessThan(text.indexOf('B.'))
  })

  it('renders a passage flow chart as linked blank boxes and a numbered answer key', () => {
    const chart = { columns: '', rows: '1. Making life stressful | [Leading to financial ruin or debt] | [Creating unhappiness within families]' }
    const structured = { ...STRUCTURED_EMPTY, tables: [chart] }
    const { rerender } = render(<StructuredPreview structure="passage" s={structured} showAnswers={false} />)

    const preview = screen.getByTestId('qb-flow-chart')
    expect(preview.textContent).toContain('1. Making life stressful')
    expect(preview.textContent).toContain('2.')
    expect(preview.textContent).toContain('3.')
    expect(preview.textContent).toContain('→')
    expect(preview).not.toHaveTextContent('Leading to financial ruin or debt')
    expect(preview).not.toHaveTextContent('Creating unhappiness within families')

    rerender(<StructuredAnswers s={structured} />)
    const answer = screen.getByTestId('qb-structured-answers')
    expect(answer).toHaveTextContent('উত্তর')
    expect(answer).toHaveTextContent('1. Making life stressful')
    expect(answer).toHaveTextContent('Leading to financial ruin or debt')
    expect(answer).toHaveTextContent('Creating unhappiness within families')
    expect(answer).not.toHaveTextContent('{"')
  })

  it('edits flowchart answers in separate numbered fields without exposing table syntax', () => {
    render(<FlowChartEditorHarness />)

    expect(screen.getByRole('textbox', { name: 'প্রশ্নে দেওয়া ১ নম্বরের ঘর' })).toHaveValue('1. Making life stressful')
    expect(screen.getByRole('textbox', { name: '২ নম্বরের ঘরের উত্তর' })).toHaveValue('Leading to financial ruin or debt')
    expect(screen.getByRole('textbox', { name: '৩ নম্বরের ঘরের উত্তর' })).toHaveValue('Creating unhappiness within families')
    expect(screen.queryByRole('textbox', { name: 'সারিগুলো' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'কলামের শিরোনাম' })).not.toBeInTheDocument()
    expect(screen.getByTestId('qb-flowchart-answer-fields-0').className).toContain('grid-cols-1')
    expect(screen.getByTestId('qb-flowchart-answer-fields-0').className).not.toContain('sm:grid-cols-2')
    expect(screen.getByTestId('qb-flowchart-answer-fields-0').firstElementChild.className).toContain('items-center')

    fireEvent.change(screen.getByRole('textbox', { name: '২ নম্বরের ঘরের উত্তর' }), { target: { value: 'Financial difficulty' } })
    expect(screen.getByTestId('flowchart-editor-data')).toHaveTextContent('[Financial difficulty]')

    fireEvent.click(screen.getByRole('button', { name: 'পরের ঘরের উত্তর যোগ করুন' }))
    expect(screen.getByRole('textbox', { name: '৪ নম্বরের ঘরের উত্তর' })).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: '৪ নম্বরের ঘর বাদ দিন' }))
    expect(screen.queryByRole('textbox', { name: '৪ নম্বরের ঘরের উত্তর' })).not.toBeInTheDocument()
  })
})