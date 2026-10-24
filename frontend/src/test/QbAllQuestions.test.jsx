import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import QbAllQuestions from '../pages/qb/QbAllQuestions'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() }, bindAuthStore: () => {} }))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/admin/question-bank/all-questions']}><QbAllQuestions /></MemoryRouter></QueryClientProvider>)
}

describe('question bank all questions design', () => {
  beforeEach(() => {
    api.get.mockImplementation(path => Promise.resolve({ data: path.endsWith('/curriculum')
      ? { data: { class_levels: [{ id: 1, name_bn: 'অষ্টম শ্রেণি', name_en: 'Class 8' }], subjects: [] } }
      : { data: [5, 4].map((id, index) => ({ id, qb_subject_id: 1, qb_question_type_id: 2, marks: '1.00', question_text: `প্রশ্ন ${id}?`, options: [], creative_parts: [], media: [], class_level_ids: [1], difficulty: 3, sources: [], unlocked: index === 0 })), meta: { total: 2, current_page: 1, per_page: 16, last_page: 1, facets: { question_types: [], source_types: [], years: [] } } } }))
  })
  afterEach(() => vi.clearAllMocks())

  it('offers buying locked questions and only allows purchased questions to be selected', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('qb-filter')).toBeInTheDocument())
    expect(screen.getByTestId('qb-all-questions').querySelector(':scope > .grid')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'প্রশ্ন খুঁজুন' })).toBeInTheDocument()
    expect(screen.getByTestId('qb-create-paper')).toHaveClass('fixed')
    expect(screen.getByTestId('qb-create-paper')).toHaveTextContent('প্রশ্নপত্র তৈরি')
    expect(screen.getByRole('button', { name: 'কিনুন' })).toHaveAttribute('data-action', 'buy')
    const [selectAll, purchased, locked] = screen.getAllByRole('checkbox')
    expect(purchased).toBeEnabled()
    expect(locked).toBeDisabled()
    selectAll.click()
    expect(screen.getByTestId('qb-create-paper')).toHaveTextContent('1')
  })

  it('opens the paper name field when a new paper is created from the picked questions', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('qb-filter')).toBeInTheDocument())
    screen.getAllByRole('checkbox')[1].click()
    screen.getByTestId('qb-create-paper').querySelector('[data-action="create-paper"]').click()
    expect(await screen.findByRole('textbox', { name: /প্রশ্নপত্রের নাম|নাম/ })).toBeInTheDocument()
  })
})
