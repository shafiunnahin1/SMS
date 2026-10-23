import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'

vi.mock('../api/axios', () => ({ bindAuthStore: vi.fn(), default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))
const { default: api } = await import('../api/axios')
const { useAuthStore } = await import('../store/authStore')
const { default: QbQuestions } = await import('../pages/writer/QbQuestions')

const rows = [
  { id: 1, status: 'draft', qb_question_type_id: 1, qb_subject_id: 1, question_text: 'Draft one?', options: [], stimuli: [], creative_parts: [], items: [], occurrences: [] },
  { id: 2, status: 'rejected', qb_question_type_id: 1, qb_subject_id: 1, question_text: 'Draft two?', options: [], stimuli: [], creative_parts: [], items: [], occurrences: [] },
  { id: 3, status: 'published', qb_question_type_id: 1, qb_subject_id: 1, question_text: 'Published?', options: [], stimuli: [], creative_parts: [], items: [], occurrences: [] },
]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/writer/questions']}><QbQuestions /></MemoryRouter></QueryClientProvider>)
}

describe('writer question bulk review submission', () => {
  beforeEach(() => {
    localStorage.setItem('locale', 'bn')
    useAuthStore.setState({ user: { id: 7, role: 'content_writer' } })
    api.get.mockImplementation(path => {
      if (path === '/writer/questions') return Promise.resolve({ data: { data: rows, meta: { current_page: 1, per_page: 16, last_page: 1, total: 3, facets: { question_types: [{ id: 1, name_bn: 'সংক্ষিপ্ত', name_en: 'Short' }], source_types: [], years: [] } } } })
      if (path === '/writer/curriculum') return Promise.resolve({ data: { data: { subjects: [{ id: 1, name_bn: 'গণিত', name_en: 'Math', chapters: [] }], class_levels: [] } } })
      if (path === '/writer/question-types') return Promise.resolve({ data: { data: [{ id: 1, slug: 'short', name_bn: 'সংক্ষিপ্ত', name_en: 'Short' }] } })
      return Promise.resolve({ data: { data: [] } })
    })
    api.post.mockResolvedValue({ data: { data: {} } })
  })

  it('submits all selected draft and rejected questions without touching published', async () => {
    renderPage()
    const toolbar = await screen.findByTestId('qb-bulk-toolbar')
    expect(toolbar).toHaveClass('sticky', 'top-0', 'z-20')
    fireEvent.click(await screen.findByRole('checkbox', { name: 'সব বাছাই' }))
    fireEvent.click(screen.getByRole('button', { name: /যাচাইয়ে পাঠান \(2\)/ }))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    expect(api.post).toHaveBeenCalledWith('/writer/questions/1/submit')
    expect(api.post).toHaveBeenCalledWith('/writer/questions/2/submit')
  })

  it('shows partial failure and keeps failed selections', async () => {
    api.post.mockImplementation(path => path.endsWith('/1/submit') ? Promise.resolve({ data: {} }) : Promise.reject(new Error('failed')))
    renderPage()
    fireEvent.click(await screen.findByRole('checkbox', { name: 'সব বাছাই' }))
    fireEvent.click(screen.getByRole('button', { name: /যাচাইয়ে পাঠান \(2\)/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('1টি প্রশ্ন যাচাইয়ে পাঠানো যায়নি')
    expect(screen.getByRole('checkbox', { name: 'প্রশ্ন #2' })).toBeChecked()
  })
})
