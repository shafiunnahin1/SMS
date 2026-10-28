import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import QbPaperPreview from '../pages/qb/QbPaperPreview'

vi.mock('../features/qb/paperImage', () => ({ downloadPaperJpg: vi.fn(() => Promise.resolve()), downloadPaperPdf: vi.fn(() => Promise.resolve()), paperDimensions: vi.fn(() => ({ width: 210, height: 297, widthPt: 595.28, heightPt: 841.89 })) }))
vi.mock('../api/axios', () => ({ default: { get: vi.fn() }, bindAuthStore: () => {} }))

// D171 STIM.1: a stimulus MCQ group prints its stimulus once and takes no number; its children are numbered MCQs with their choices
const child = (no, prompt, options, correct) => ({ no, item_type: 'sub_mcq', prompt_text: prompt, prompt_json: { options }, marks: '1.00', answer_json: { correct } })
const PAPER = { id: 8, title: 'Stimulus test', exam_name: '', duration_minutes: 30, total_marks: '3.00', instructions: null, set: 'B', set_code: 'B', sets_count: 2,
  institution: 'Demo School', answers: true, media: [], answer_key: [],
  sections: [{ title: 'MCQ', instruction: null, items: [
    { no: 1, marks: '1.00', subject: null, question: { id: 1, question_text: 'Plain?', media: [], options: [{ label: 'ক', content_text: 'a', is_correct: true }] } },
    { no: null, marks: '2.00', subject: null, question: { id: 2, question_text: 'Read the passage.', media: [], options: [], stimuli: [{ id: 9, content_text: 'STIMULUS-TEXT' }],
      items: [child(2, 'CHILD-ONE', ['Village', 'Town'], 0), child(3, 'CHILD-TWO', ['Rice', 'Jute'], 1)] } },
  ] }] }

describe('D171 stimulus MCQ group in the paper preview', () => {
  it('shows the stimulus once and numbers each child as an MCQ', async () => {
    window.localStorage.clear()
    api.get.mockResolvedValue({ data: { data: PAPER } })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/admin/question-bank/papers/8/preview?set=B']}>
      <Routes><Route path="/admin/question-bank/papers/:id/preview" element={<QbPaperPreview />} /></Routes></MemoryRouter></QueryClientProvider>)
    const paper = await screen.findByTestId('qb-paper')
    expect(screen.getAllByTestId('qb-paper-stimulus')).toHaveLength(1)
    const kids = screen.getAllByTestId('qb-paper-child')
    expect(kids).toHaveLength(2)
    expect(within(kids[0]).getByText(/^(2|২)\.$/)).toBeInTheDocument()
    expect(within(kids[1]).getByText(/^(3|৩)\.$/)).toBeInTheDocument()
    expect(within(paper).queryByText(/^(4|৪)\.$/)).toBeNull()
    expect(within(kids[1]).getAllByTestId('qb-paper-correct')).toHaveLength(1)
  })
})
