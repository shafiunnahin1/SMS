import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '../i18n'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import QbQuestionEdit from '../pages/writer/QbQuestionEdit'
import { toPayload } from '../features/qb/Structured'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() }, bindAuthStore: () => {} }))

const question = {
  id: 6, qb_question_type_id: 1, qb_subject_id: 1, qb_chapter_id: null, qb_topic_id: null, difficulty: 3, marks: '1.00',
  language: 'und', content_mode: 'mixed', question_text: '<img data-qmx-media="42" data-qmx-width="55" data-qmx-align="right">',
  answer_text: '', explanation_text: '', status: 'draft', review_note: null, created_by: 1, class_level_ids: [], options: [],
  creative_parts: [], occurrences: [], media: [{ id: 42, url: '/private/42.png' }], stimuli: [], items: [],
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/writer/questions/6']}><Routes><Route path="/writer/questions/:id" element={<QbQuestionEdit />} /></Routes></MemoryRouter></QueryClientProvider>)
}

describe('writer question picture editor', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { role: 'super_admin' }, role: 'super_admin' })
    api.get.mockImplementation(url => Promise.resolve({ data: url === '/writer/curriculum'
      ? { data: { class_levels: [], subjects: [] } }
      : url === '/writer/question-types'
        ? { data: [{ id: 1, slug: 'short', name_bn: 'সংক্ষিপ্ত প্রশ্ন', name_en: 'Short', family: 'short', structure: null }] }
        : url === '/writer/questions/6/revisions' ? { data: [] } : { data: question } }))
  })
  afterEach(() => vi.clearAllMocks())

  it('opens the picture settings dialog from the ribbon and from the live preview image', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'প্রিভিউ' })).toBeInTheDocument()
    fireEvent.focus(screen.getByRole('textbox', { name: 'প্রশ্ন' }))
    fireEvent.click(screen.getByTestId('qb-ribbon').querySelector('[data-action="picture"]'))
    expect(await screen.findByTestId('qb-picture-dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('ছবি বাছাই করুন')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'বাতিল' }))

    fireEvent.click(screen.getByRole('button', { name: 'ছবির সেটিংস খুলুন' }))
    expect(await screen.findByTestId('qb-picture-dialog')).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'ছবির প্রস্থ' })).toHaveValue('55')
    expect(screen.getByRole('combobox', { name: 'ছবির সারিবদ্ধতা' })).toHaveValue('right')
  })

  it('marks the question classes without deriving a separate class from its subject', async () => {
    api.get.mockImplementation(url => Promise.resolve({ data: url === '/writer/curriculum'
      ? { data: { class_levels: [
        { id: 1, name_bn: 'প্লে' }, { id: 2, name_bn: 'নার্সারি' }, { id: 3, name_bn: 'কেজি' }, { id: 4, name_bn: 'অষ্টম শ্রেণি' },
      ], subjects: [{ id: 1, name_bn: 'আমার বই', class_level_ids: [1, 2, 3], chapters: [] }] } }
      : url === '/writer/question-types'
        ? { data: [{ id: 1, slug: 'short', name_bn: 'সংক্ষিপ্ত প্রশ্ন', name_en: 'Short', family: 'short', structure: null }] }
        : url === '/writer/questions/6/revisions' ? { data: [] } : { data: { ...question, class_level_ids: [4] } } }))
    renderPage()
    expect(await screen.findByTestId('qb-sections')).toBeInTheDocument()
    expect(screen.queryByTestId('qb-primary-class')).not.toBeInTheDocument()
    expect(screen.getByLabelText('অষ্টম শ্রেণি')).toBeChecked()
    expect(screen.getByTestId('qb-sections').querySelector('input[name="class_level_ids"][value="1"]')).not.toBeChecked()
  })

  it('inserts an inline labeled blank and exposes its matching answer field', async () => {
    api.get.mockImplementation(url => Promise.resolve({ data: url === '/writer/curriculum'
      ? { data: { class_levels: [], subjects: [] } }
      : url === '/writer/question-types'
        ? { data: [{ id: 1, slug: 'gap', name_bn: 'শূন্যস্থান', name_en: 'Gap fill', family: 'fill_gap', structure: 'gap' }] }
        : url === '/writer/questions/6/revisions' ? { data: [] }
          : { data: { ...question, question_text: 'Water is essential for life.', items: [] } } }))
    renderPage()
    expect(await screen.findByTestId('qb-gaps')).toBeInTheDocument()
    const passage = screen.getByRole('textbox', { name: 'প্রশ্ন' })
    passage.setSelectionRange(9, 9)
    fireEvent.click(screen.getByTestId('qb-gaps').querySelector('[data-action="add-gap-blank"]'))
    expect(passage).toHaveValue('Water is (a) — essential for life.')
    const answers = screen.getByTestId('qb-gaps').querySelector('[name="structured.gaps.0.answers"]')
    expect(answers).toBeInTheDocument()
    fireEvent.change(answers, { target: { value: 'water, H₂O' } })
    fireEvent.change(screen.getByTestId('qb-gaps').querySelector('[name="structured.gaps.0.marks"]'), { target: { value: '2' } })
    fireEvent.change(screen.getByTestId('qb-gaps').querySelector('[name="structured.gaps.0.hint"]'), { target: { value: 'water source' } })
    expect(screen.getByTestId('qb-preview')).toHaveTextContent('(a) —')
    expect(screen.getByTestId('qb-gap-passage-preview')).toHaveTextContent('(a) — (water source)')
    expect(screen.getByTestId('qb-structured-preview')).toHaveTextContent('উত্তর(a)')
    expect(screen.getByTestId('qb-preview')).toHaveTextContent('water, H₂O')
    expect(screen.getByTestId('qb-preview')).not.toHaveTextContent('মূল শব্দ (ঐচ্ছিক)')
    expect(screen.getByTestId('qb-preview')).toHaveTextContent('2')
    const payload = toPayload('gap', { box: '', gaps: [{ prompt: '', answers: 'water, H₂O', hint: 'H₂O', marks: '2' }] })
    expect(payload.items[0]).toMatchObject({ item_type: 'gap', prompt_text: null, prompt_json: { hint: 'H₂O' }, answer_json: { answers: ['water', 'H₂O'] }, marks: 2 })
  })

  it('hydrates saved gaps and keeps answer order when a blank moves or is removed', async () => {
    api.get.mockImplementation(url => Promise.resolve({ data: url === '/writer/curriculum'
      ? { data: { class_levels: [], subjects: [] } }
      : url === '/writer/question-types'
        ? { data: [{ id: 1, slug: 'gap', name_bn: 'শূন্যস্থান', name_en: 'Gap fill', family: 'fill_gap', structure: 'gap' }] }
        : url === '/writer/questions/6/revisions' ? { data: [] }
          : { data: { ...question, question_text: 'A (a) _____ B (b) _____.', items: [
            { item_type: 'gap', prompt_text: null, answer_json: { answers: ['first'] }, prompt_json: null, marks: '1.00' },
            { item_type: 'gap', prompt_text: null, answer_json: { answers: ['second'] }, prompt_json: null, marks: '2.00' },
          ] } } }))
    renderPage()
    const box = await screen.findByTestId('qb-gaps')
    const passage = screen.getByRole('textbox', { name: 'প্রশ্ন' })
    expect(passage).toHaveValue('A (a) _____ B (b) _____.')
    const answers = () => [...box.querySelectorAll('input[name$=".answers"]')]
    expect(answers().map(input => input.value)).toEqual(['first', 'second'])
    fireEvent.click(screen.getByRole('button', { name: 'Move blank 2 up' }))
    expect(answers().map(input => input.value)).toEqual(['second', 'first'])
    const firstRowButtons = box.querySelector('[data-gap-index="0"]').querySelectorAll('button')
    fireEvent.click(firstRowButtons[firstRowButtons.length - 1])
    expect(answers().map(input => input.value)).toEqual(['first'])
    expect(passage).toHaveValue('A  B (a) —.')
  })

  it('inserts a table in the focused word box from the ribbon', async () => {
    api.get.mockImplementation(url => Promise.resolve({ data: url === '/writer/curriculum'
      ? { data: { class_levels: [], subjects: [] } }
      : url === '/writer/question-types'
        ? { data: [{ id: 1, slug: 'gap', name_bn: 'শূন্যস্থান', name_en: 'Gap fill', family: 'fill_gap', structure: 'gap' }] }
        : url === '/writer/questions/6/revisions' ? { data: [] }
          : { data: { ...question, question_text: 'A (a) _____', items: [] } } }))
    renderPage()
    await screen.findByTestId('qb-gaps')
    const wordBox = screen.getByRole('textbox', { name: 'শব্দতালিকা (ঐচ্ছিক)' })
    fireEvent.focus(wordBox)
    wordBox.setSelectionRange(0, 0)
    fireEvent.click(screen.getByTestId('qb-ribbon').querySelector('[data-action="table"]'))
    const dialog = await screen.findByTestId('table-dialog')
    fireEvent.click(dialog.querySelector('[data-action="table-insert"]'))
    expect(wordBox.value).toContain('<table')
    expect(screen.getByTestId('qb-preview').querySelector('[data-testid="qb-structured-preview"] table')).toBeInTheDocument()
  })

  it('opens the table editor when its word-box preview table is clicked', async () => {
    const sourceTable = '<table class="qmx-table qmx-table-grid"><tbody><tr><th>শব্দ ১</th><th>শব্দ ২</th></tr><tr><td>water</td><td>air</td></tr></tbody></table>'
    api.get.mockImplementation(url => Promise.resolve({ data: url === '/writer/curriculum'
      ? { data: { class_levels: [], subjects: [] } }
      : url === '/writer/question-types'
        ? { data: [{ id: 1, slug: 'gap', name_bn: 'শূন্যস্থান', name_en: 'Gap fill', family: 'fill_gap', structure: 'gap' }] }
        : url === '/writer/questions/6/revisions' ? { data: [] }
          : { data: { ...question, question_text: 'Choose a word (a) —', stimuli: [{ label: 'word_box', content_text: sourceTable }], items: [
            { item_type: 'gap', prompt_json: { hint: 'root' }, answer_json: { answers: ['water'] }, prompt_text: null, marks: '1.00' },
          ] } } }))
    renderPage()

    const table = await screen.findByRole('table', { name: 'টেবিল' })
    fireEvent.click(table)
    const dialog = await screen.findByTestId('table-dialog')
    expect(dialog.querySelector('input[name="rows"]')).toHaveValue('2')
    expect(dialog.querySelector('input[name="cols"]')).toHaveValue('2')
    fireEvent.change(screen.getByTestId('table-cell-1-0'), { target: { value: 'river' } })
    fireEvent.click(dialog.querySelector('[data-action="table-insert"]'))

    expect(screen.getByRole('textbox', { name: 'শব্দতালিকা (ঐচ্ছিক)' }).value).toContain('river')
  })
})
