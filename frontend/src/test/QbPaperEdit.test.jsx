import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import QbPaperEdit from '../pages/qb/QbPaperEdit'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() }, bindAuthStore: () => {} }))

const paper = {
  id: 8,
  title: 'প্রশ্নপত্র ২',
  status: 'draft',
  total_marks: '1.00',
  sets_count: 1,
  duration_minutes: 2,
  sections: [{ title: 'সংক্ষিপ্ত প্রশ্ন', instruction: '', items: [{ qb_question_id: 140, marks: '1.00' }] }],
  subjects: [{ id: 3, name: 'গণিত' }],
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/admin/question-bank/papers/8']}><Routes><Route path="/admin/question-bank/papers/:id" element={<QbPaperEdit />} /></Routes></MemoryRouter></QueryClientProvider>)
}

describe('question paper detail layout (D135)', () => {
  beforeEach(() => {
    api.get.mockImplementation(path => {
      if (path === '/question-bank/papers/8') return Promise.resolve({ data: { data: paper } })
      if (path === '/question-bank/questions/140') return Promise.resolve({ data: { data: { id: 140, qb_subject_id: 3, qb_question_type_id: 2, question_text: 'ত্বরণ কাকে বলে?', unlocked: true, answer_text: 'বেগের পরিবর্তনের হার', explanation_text: 'সময়ের সাথে বেগের পরিবর্তন।', options: [] } } })
      if (path === '/question-bank/curriculum') return Promise.resolve({ data: { data: { subjects: [{ id: 3, code: 'MAT' }] } } })
      if (path === '/question-bank/question-types') return Promise.resolve({ data: { data: [{ id: 2, slug: 'short' }] } })
      if (path === '/question-bank/questions') return Promise.resolve({ data: { data: [] } })
      return Promise.resolve({ data: { data: [] } })
    })
  })
  afterEach(() => vi.clearAllMocks())

  it('shows a centered paper hero and full-width question card with purchased answer details', async () => {
    renderPage()
    expect(await screen.findByTestId('qb-paper-edit')).toHaveClass('max-w-6xl')
    expect(screen.getByRole('heading', { name: 'প্রশ্নপত্র ২' })).toBeInTheDocument()
    expect(screen.getByTestId('paper-primary-actions')).toHaveTextContent('প্রশ্ন যোগ করুন')
    expect(await screen.findByText('MAT-SHORT-000140')).toBeInTheDocument()
    expect(screen.getByTestId('paper-section-0')).toHaveAttribute('data-testid', 'paper-section-0')
    expect(await screen.findByTestId('paper-answer-140')).toHaveTextContent('বেগের পরিবর্তনের হার')
    await waitFor(() => expect(screen.getByTestId('paper-picker')).toBeInTheDocument())
  })

  it('lists the sets of a final paper and creates more sets with the chosen strategy (qbank subsets)', async () => {
    const final = { ...paper, status: 'final', sets_count: 2, sets: [{ number: 1, set: 'A', code: 'ক', strategy: 'both' }, { number: 2, set: 'B', code: 'খ', strategy: 'both' }] }
    api.get.mockImplementation(path => Promise.resolve({ data: { data: path === '/question-bank/papers/8' ? final : [] } }))
    api.post.mockResolvedValue({ data: { data: { ...final, sets_count: 4 } } })
    renderPage()
    const list = await screen.findByTestId('paper-set-list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(list).toHaveTextContent('সেট ক')
    expect(list).toHaveTextContent('মূল সেট')
    const create = screen.getByTestId('paper-create-sets')
    fireEvent.change(within(create).getByRole('combobox', { name: 'কতটি সেট' }), { target: { value: '2' } })
    fireEvent.change(within(create).getByRole('combobox', { name: /পদ্ধতি|কৌশল|Strategy/i }), { target: { value: 'options' } })
    fireEvent.click(within(create).getByRole('button', { name: /সেট তৈরি করুন/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/question-bank/papers/8/finalize', { count: 2, strategy: 'options' }))
  })
})
