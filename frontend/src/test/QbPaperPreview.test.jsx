import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import QbPaperPreview from '../pages/qb/QbPaperPreview'

vi.mock('../api/axios', () => ({ default: { get: vi.fn() }, bindAuthStore: () => {} }))

const mcq = (no, text) => ({ no, marks: '1.00', subject: null, question: { question_text: text, media: [], answer_text: 'x', explanation_text: `why ${no}`,
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
})
