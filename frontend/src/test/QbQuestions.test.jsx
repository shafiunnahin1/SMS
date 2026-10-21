import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import QbQuestions from '../pages/writer/QbQuestions'

vi.mock('../api/axios', () => ({ default: { get: vi.fn() }, bindAuthStore: () => {} }))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/writer/questions']}><QbQuestions /></MemoryRouter></QueryClientProvider>)
}

describe('writer question list cards', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { role: 'content_writer' }, role: 'content_writer' })
    api.get.mockImplementation((url) => Promise.resolve({ data:
      url === '/writer/curriculum' ? {
        data: {
          class_levels: [{ id: 1, name_bn: 'নবম শ্রেণি' }],
          subjects: [{ id: 3, name_bn: 'পদার্থবিজ্ঞান', class_level_ids: [1], chapters: [{ id: 4, name_bn: 'গতি', number: 2, topics: [{ id: 5, name_bn: 'বেগ' }] }] }],
        },
      } : url === '/writer/question-types' ? { data: [{ id: 2, name_bn: 'বহুনির্বাচনি' }] } : {
        data: [{ id: 7, qb_question_type_id: 2, qb_subject_id: 3, qb_chapter_id: 4, qb_topic_id: 5, marks: '1.00', difficulty: 2, question_text: '<p>বেগের একক কী?</p>', status: 'draft', author: 'লেখক' }],
        meta: { current_page: 1, last_page: 1, total: 1, per_page: 16 },
      },
    }))
  })
  afterEach(() => vi.clearAllMocks())

  it('shows qbank-style question cards beside the search filter and keeps search behavior', async () => {
    renderPage()

    expect(await screen.findByTestId('qb-question-filter')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'প্রশ্ন খুঁজুন' })).toBeInTheDocument()
    expect(await screen.findByText('প্রশ্ন #7')).toBeInTheDocument()
    expect(screen.getByTestId('qb-questions').querySelector('[data-question="7"]')).toBeInTheDocument()
    expect(screen.getByTestId('qb-questions')).toHaveTextContent('বেগের একক কী?')
    expect(screen.getByTestId('qb-questions')).toHaveTextContent('প্রশ্ন #7')
    expect(await screen.findByText('বহুনির্বাচনি')).toBeInTheDocument()
    expect(screen.getByTestId('qb-questions')).toHaveTextContent('পদার্থবিজ্ঞান')
    expect(screen.getByTestId('qb-questions')).toHaveTextContent('অধ্যায় 2 — গতি')
    expect(screen.getByTestId('qb-questions')).toHaveTextContent('শ্রেণি: নবম শ্রেণি')
    expect(screen.getByTestId('qb-questions')).toHaveTextContent('নম্বর: 1.00')

    fireEvent.change(screen.getByRole('textbox', { name: 'খুঁজুন' }), { target: { value: 'বেগ' } })
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/writer/questions', expect.objectContaining({
      params: expect.objectContaining({ q: 'বেগ', page: 1 }),
    })))
  })
})
