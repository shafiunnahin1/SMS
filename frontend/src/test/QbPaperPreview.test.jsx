import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import QbPaperPreview from '../pages/qb/QbPaperPreview'
import { downloadPaperJpg, downloadPaperPdf } from '../features/qb/paperImage'

vi.mock('../features/qb/paperImage', () => ({ downloadPaperJpg: vi.fn(() => Promise.resolve()), downloadPaperPdf: vi.fn(() => Promise.resolve()) }))
vi.mock('../api/axios', () => ({ default: { get: vi.fn() }, bindAuthStore: () => {} }))

const mcq = (no, text) => ({ no, marks: '1.00', subject: null, question: { id: 100 + no, question_text: text, media: [], answer_text: 'x', explanation_text: `why ${no}`,
  options: [{ label: 'ক', content_text: 'one', is_correct: true }, { label: 'খ', content_text: 'two', is_correct: false }] } })
const PAPER = { id: 7, title: 'Weekly test', exam_name: '', duration_minutes: 30, total_marks: '3.00', instructions: 'Read carefully', set: 'A', set_code: 'A', sets_count: 2,
  institution: 'Demo School', answers: true, media: [], answer_key: [],
  sections: [{ title: 'MCQ', instruction: null, items: [mcq(1, 'First?'), mcq(2, 'Second?')] }, { title: 'Written', instruction: null, items: [mcq(3, 'Third?')] }] }

function renderPage() {
  api.get.mockResolvedValue({ data: { data: PAPER } })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/admin/question-bank/papers/7/preview?set=A']}>
    <Routes><Route path="/admin/question-bank/papers/:id/preview" element={<QbPaperPreview />} /></Routes></MemoryRouter></QueryClientProvider>)
}

describe('D133 paper print preview', () => {
  it('loads the set with answers and shows the header, answers and explanations as qbank', async () => {
    window.localStorage.clear()
    renderPage()
    const paper = await screen.findByTestId('qb-paper')
    expect(api.get).toHaveBeenCalledWith('/question-bank/papers/7/pdf', { params: { set: 'A', answers: 1, format: 'json' } })
    expect(within(paper).getByText('Demo School')).toBeInTheDocument()
    expect(screen.getByTestId('qb-paper-set')).toHaveTextContent('A')
    expect(screen.getByTestId('qb-paper-instructions')).toHaveTextContent('Read carefully')
    expect(screen.getAllByTestId('qb-paper-correct')).toHaveLength(3)
    expect(screen.getAllByTestId('qb-paper-explanation')).toHaveLength(3)
    expect(within(paper).getAllByText('ক)').length).toBeGreaterThan(0)
  })

  it('customizes the paper: visibility, language, numbering, section order, text box', async () => {
    window.localStorage.clear()
    renderPage()
    await screen.findByTestId('qb-paper')
    fireEvent.click(screen.getByRole('switch', { name: 'Answer' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Explanation' }))
    expect(screen.queryAllByTestId('qb-paper-correct')).toHaveLength(0)
    expect(screen.queryAllByTestId('qb-paper-explanation')).toHaveLength(0)

    fireEvent.click(screen.getByRole('switch', { name: 'ভাষা / Language' }))
    expect(within(screen.getByTestId('qb-paper')).getAllByText('a)').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('switch', { name: 'নতুন সিরিয়াল' }))
    const sections = () => screen.getAllByTestId('qb-paper-section')
    expect(within(sections()[1]).getByText('1.')).toBeInTheDocument()

    fireEvent.click(within(screen.getByTestId('section-order')).getAllByRole('button', { name: 'নিচে' })[0])
    expect(within(sections()[0]).getByText('Written')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Add Text Box/ }))
    expect(screen.getAllByTestId('qb-text-box')).toHaveLength(1)
    expect(JSON.parse(window.localStorage.getItem('qb-paper-preview'))).toMatchObject({ language: 'en', restartNumbers: true, show: { answer: false, explanation: false } })
  })

  it('edits a question for this paper only and keeps the edit with the paper and set', async () => {
    window.localStorage.clear()
    renderPage()
    await screen.findByTestId('qb-paper')
    fireEvent.click(screen.getAllByRole('button', { name: /নং প্রশ্ন সম্পাদনা/ })[0])
    const editor = screen.getByTestId('qb-question-editor')
    fireEvent.change(within(editor).getByRole('textbox', { name: 'প্রশ্ন' }), { target: { value: 'Changed?' } })
    fireEvent.change(within(editor).getByRole('textbox', { name: 'অপশন ক' }), { target: { value: 'uno' } })
    fireEvent.click(within(editor).getByRole('button', { name: 'এই পত্রে রাখুন' }))
    const first = screen.getAllByTestId('qb-paper-question')[0]
    expect(first).toHaveAttribute('data-edited', 'yes')
    expect(within(first).getByText('Changed?')).toBeInTheDocument()
    expect(within(first).getByText('uno')).toBeInTheDocument()
    expect(within(first).getByTestId('qb-paper-correct')).toBeInTheDocument()   // the right option is still marked
    expect(PAPER.sections[0].items[0].question.question_text).toBe('First?')    // the loaded question itself is untouched
    expect(JSON.parse(window.localStorage.getItem('qb-paper-preview:7:A')).edits[101]).toMatchObject({ question_text: 'Changed?', options: ['uno', 'two'] })

    fireEvent.click(screen.getAllByRole('button', { name: /নং প্রশ্ন সম্পাদনা/ })[0])
    fireEvent.click(screen.getByRole('button', { name: 'মূল প্রশ্নে ফিরুন' }))
    expect(within(screen.getAllByTestId('qb-paper-question')[0]).getByText('First?')).toBeInTheDocument()
  })

  it('drops a text box into the gap after a question', async () => {
    window.localStorage.clear()
    renderPage()
    await screen.findByTestId('qb-paper')
    fireEvent.click(screen.getByRole('button', { name: /Add Text Box/ }))
    expect(screen.getByTestId('qb-text-box')).toHaveAttribute('data-anchor', 'top')
    fireEvent.pointerDown(screen.getByLabelText('টেনে সরান'))
    fireEvent.pointerMove(screen.getByTestId('qb-paper'), { clientY: 5 })
    expect(screen.getByTestId('qb-drop-gap')).toBeInTheDocument()
    fireEvent.pointerUp(screen.getByTestId('qb-paper'), { clientY: 5 })
    const box = screen.getByTestId('qb-text-box')
    expect(box).toHaveAttribute('data-anchor', '103')       // after the last question whose middle is above the pointer
    expect(box.previousElementSibling).toHaveAttribute('data-qid', '103')
    expect(screen.queryByTestId('qb-drop-gap')).toBeNull()
  })

  it('drops a box between header lines and switches its wrap like Word', async () => {
    window.localStorage.clear()
    renderPage()
    const paper = await screen.findByTestId('qb-paper')
    const rect = (top, height = 20) => () => ({ top, height, bottom: top + height, left: 0, right: 600, width: 600, x: 0, y: top, toJSON() {} })
    paper.querySelectorAll('[data-gap]').forEach(el => { el.getBoundingClientRect = rect(1000) })
    paper.querySelector('[data-gap="h-institution"]').getBoundingClientRect = rect(100)
    paper.getBoundingClientRect = rect(0, 1200)
    fireEvent.click(screen.getByRole('button', { name: /Add Text Box/ }))
    fireEvent.pointerDown(screen.getByLabelText('টেনে সরান'), { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(window, { clientX: 500, clientY: 130 })
    expect(screen.getByTestId('qb-drag-ghost').style.display).toBe('block')
    fireEvent.pointerUp(window, { clientX: 500, clientY: 130 })
    const box = screen.getByTestId('qb-text-box')
    expect(box).toHaveAttribute('data-anchor', 'h-institution')      // under the institution name, inside the header
    expect(box.previousElementSibling).toHaveAttribute('data-line', 'institution')

    const wrap = screen.getByRole('combobox', { name: /Wrap Text/ })
    fireEvent.change(wrap, { target: { value: 'square' } })
    expect(screen.getByTestId('qb-text-box')).toHaveAttribute('data-wrap', 'square')
    expect(screen.getByTestId('qb-text-box').style.float).toBe('inline-end')   // dropped on the right half

    fireEvent.change(wrap, { target: { value: 'front' } })
    const free = screen.getByTestId('qb-text-box')
    expect(free).toHaveAttribute('data-anchor', 'free')
    expect(free.style.position).toBe('absolute')
    free.getBoundingClientRect = rect(0, 40)
    fireEvent.pointerDown(screen.getByLabelText('টেনে সরান'), { clientX: 5, clientY: 5 })
    fireEvent.pointerMove(window, { clientX: 305, clientY: 405 })
    expect(free.style.left).toBe('300px')                              // moves with the pointer, anywhere on the page
    fireEvent.pointerUp(window, { clientX: 305, clientY: 405 })
    expect(JSON.parse(window.localStorage.getItem('qb-paper-preview:7:A')).boxes[0]).toMatchObject({ wrap: 'front', x: 300, y: 400 })
  })

  it('aligns the text of the picked box left, center, right or justified', async () => {
    window.localStorage.clear()
    renderPage()
    await screen.findByTestId('qb-paper')
    fireEvent.click(screen.getByRole('button', { name: /Add Text Box/ }))
    const body = within(screen.getByTestId('qb-text-box')).getByLabelText('লেখার বাক্স')
    expect(body.style.textAlign).toBe('left')
    for (const [name, value] of [['মাঝে', 'center'], ['ডানে', 'right'], ['জাস্টিফাই', 'justify'], ['বামে', 'left']]) {
      fireEvent.click(screen.getByRole('button', { name }))
      expect(body.style.textAlign).toBe(value)
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
    }
    fireEvent.click(screen.getByRole('button', { name: 'মাঝে' }))
    expect(JSON.parse(window.localStorage.getItem('qb-paper-preview:7:A')).boxes[0].align).toBe('center')
  })

  it('saves the paper as a JPG named after the paper and set', async () => {
    window.localStorage.clear()
    renderPage()
    const paper = await screen.findByTestId('qb-paper')
    fireEvent.click(screen.getByRole('button', { name: 'ইমেজ' }))
    expect(downloadPaperJpg).toHaveBeenCalledWith(paper, 'paper-7-A.jpg')
  })

  it('downloads a PDF file from the PDF button and opens the print dialog only from the print button', async () => {
    window.localStorage.clear()
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    renderPage()
    const paper = await screen.findByTestId('qb-paper')
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }))
    expect(downloadPaperPdf).toHaveBeenCalledWith(paper, 'paper-7-A.pdf')
    expect(print).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'প্রিন্ট' }))
    expect(print).toHaveBeenCalledTimes(1)
    print.mockRestore()
  })
})
