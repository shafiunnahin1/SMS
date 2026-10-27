import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'

vi.mock('../api/axios', () => ({ bindAuthStore: vi.fn(), default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))
const { default: api } = await import('../api/axios')
const { useAuthStore } = await import('../store/authStore')
const { default: QbQuestions } = await import('../pages/writer/QbQuestions')

// D174 QBR.1: a moderator publishes or returns several questions in review at once (each through its own endpoint), and the
// question list shows 25 / 50 / 75 / 100 per page, remembered in this browser.
const row = (id, status) => ({ id, status, qb_question_type_id: 1, qb_subject_id: 1, question_text: `Q${id}?`, options: [], stimuli: [], creative_parts: [], items: [], occurrences: [] })
const rows = [row(1, 'review'), row(2, 'review'), row(3, 'published')]

function renderPage(path = '/writer/questions?status=review') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><QbQuestions /></MemoryRouter></QueryClientProvider>)
}

describe('moderator bulk review and per-page choice', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('locale', 'bn')
    vi.clearAllMocks()
    useAuthStore.setState({ user: { id: 9, role: 'content_moderator' } })
    api.get.mockImplementation((path, config) => {
      if (path === '/writer/questions') return Promise.resolve({ data: { data: rows, meta: { current_page: 1, per_page: config.params.per_page, last_page: 4, total: 80, facets: { question_types: [], source_types: [], years: [] } } } })
      if (path === '/writer/curriculum') return Promise.resolve({ data: { data: { subjects: [], class_levels: [] } } })
      return Promise.resolve({ data: { data: [] } })
    })
    api.post.mockResolvedValue({ data: { data: {} } })
  })

  it('publishes every selected question in review, never a published one', async () => {
    renderPage()
    fireEvent.click(await screen.findByRole('checkbox', { name: 'সব বাছাই' }))
    expect(screen.queryByRole('checkbox', { name: 'প্রশ্ন #3' })).toBeNull()
    expect(screen.queryByRole('button', { name: /যাচাইয়ে পাঠান/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /প্রকাশ করুন \(2\)/ }))
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    expect(api.post).toHaveBeenCalledWith('/writer/questions/1/publish', undefined)
    expect(api.post).toHaveBeenCalledWith('/writer/questions/2/publish', undefined)
  })

  it('returns the selected questions with one reason and reports failures', async () => {
    api.post.mockImplementation(path => path.includes('/2/') ? Promise.reject(new Error('no')) : Promise.resolve({ data: {} }))
    renderPage()
    fireEvent.click(await screen.findByRole('checkbox', { name: 'প্রশ্ন #1' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'প্রশ্ন #2' }))
    const back = screen.getByRole('button', { name: /ফেরত পাঠান \(2\)/ })
    expect(back).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/ফেরতের কারণ/), { target: { value: 'বানান ঠিক করুন' } })
    fireEvent.click(back)
    expect(await screen.findByRole('alert')).toHaveTextContent('1টি প্রশ্নে কাজটি হয়নি')
    expect(api.post).toHaveBeenCalledWith('/writer/questions/1/reject', { reason: 'বানান ঠিক করুন' })
    expect(screen.getByRole('checkbox', { name: 'প্রশ্ন #2' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'প্রশ্ন #1' })).not.toBeChecked()
  })

  it('asks for 25 by default and remembers 100', async () => {
    renderPage()
    await screen.findByText('Q1?')
    expect(api.get).toHaveBeenCalledWith('/writer/questions', expect.objectContaining({ params: expect.objectContaining({ per_page: 25 }) }))
    const select = screen.getByLabelText('প্রতি পৃষ্ঠায়')
    expect([...select.options].map(o => o.value)).toEqual(['25', '50', '75', '100'])
    fireEvent.change(select, { target: { value: '100' } })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/writer/questions', expect.objectContaining({ params: expect.objectContaining({ per_page: 100 }) })))
    expect(localStorage.getItem('qb.questions.per_page')).toBe('100')
  })
})
