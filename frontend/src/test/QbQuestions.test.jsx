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
    api.get.mockResolvedValue({ data: {
      data: [{ id: 7, question_text: '<p>বেগের একক কী?</p>', status: 'draft', author: 'লেখক' }],
      meta: { current_page: 1, last_page: 1, total: 1, per_page: 16 },
    } })
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

    fireEvent.change(screen.getByRole('textbox', { name: 'খুঁজুন' }), { target: { value: 'বেগ' } })
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/writer/questions', expect.objectContaining({
      params: expect.objectContaining({ q: 'বেগ', page: 1 }),
    })))
  })
})
