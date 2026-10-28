import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), patch: vi.fn() }, bindAuthStore: () => {} }))
const { default: api } = await import('../api/axios')
const { useAuthStore } = await import('../store/authStore')
const { default: QbAllQuestions } = await import('../pages/qb/QbAllQuestions')
const { default: QbQuestions } = await import('../pages/writer/QbQuestions')
const { selectionKey } = await import('../features/qb/keptSelection')

// D176 QBS.1: selected question ids survive a refresh (a remount here), per user; clear all and logout drop them; All Questions
// offers 25 / 50 / 75 / 100 per page.
const question = (id, extra = {}) => ({ id, qb_subject_id: 1, qb_question_type_id: 2, marks: '1.00', question_text: `প্রশ্ন ${id}?`, options: [], creative_parts: [], media: [], class_level_ids: [1], difficulty: 3, sources: [], unlocked: true, ...extra })
const page = (rows, perPage) => ({ data: rows, meta: { total: 60, current_page: 1, per_page: perPage, last_page: 3, facets: { question_types: [], source_types: [], years: [] } } })

function mount(Page, path) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Page /></MemoryRouter></QueryClientProvider>)
}

describe('kept question selections', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('locale', 'bn')
    vi.clearAllMocks()
    useAuthStore.setState({ user: { id: 7, role: 'admin' } })
    api.get.mockImplementation((path, config) => {
      if (path.endsWith('/curriculum')) return Promise.resolve({ data: { data: { class_levels: [], subjects: [] } } })
      if (path === '/question-bank/questions') return Promise.resolve({ data: page([question(5), question(4)], config.params.per_page) })
      const id = Number(path.split('/').pop())
      if (id === 9) return Promise.reject(new Error('gone'))
      return Promise.resolve({ data: { data: question(id) } })
    })
  })

  it('All Questions: a selection is kept after a refresh, then cleared by clear all', async () => {
    const first = mount(QbAllQuestions, '/admin/question-bank/all-questions')
    fireEvent.click(await screen.findByRole('checkbox', { name: /Q-.*000005/ }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem(selectionKey('all', 7)))).toEqual([5]))
    expect(localStorage.getItem(selectionKey('all', 7))).not.toContain('প্রশ্ন')   // ids only
    first.unmount()

    localStorage.setItem(selectionKey('all', 7), JSON.stringify([5, 12, 9]))      // 12 on another page, 9 no longer available
    mount(QbAllQuestions, '/admin/question-bank/all-questions')
    await waitFor(() => expect(screen.getByTestId('qb-create-paper')).toHaveTextContent('2'))
    expect(screen.getByRole('checkbox', { name: /Q-.*000005/ })).toBeChecked()
    expect(api.get).toHaveBeenCalledWith('/question-bank/questions/12')
    fireEvent.click(screen.getByRole('button', { name: 'সব বাদ' }))
    expect(screen.getByTestId('qb-create-paper')).toHaveTextContent('0')
    expect(localStorage.getItem(selectionKey('all', 7))).toBeNull()
  })

  it('All Questions: another user does not get the selection, and logout clears it', async () => {
    localStorage.setItem(selectionKey('all', 7), JSON.stringify([5]))
    useAuthStore.setState({ user: { id: 8, role: 'admin' } })
    mount(QbAllQuestions, '/admin/question-bank/all-questions')
    expect(await screen.findByRole('checkbox', { name: /Q-.*000005/ })).not.toBeChecked()
    useAuthStore.getState().clearAuth()
    expect(localStorage.getItem(selectionKey('all', 7))).toBeNull()
  })

  it('All Questions: 25 by default, 100 asked for and remembered', async () => {
    mount(QbAllQuestions, '/admin/question-bank/all-questions')
    await screen.findByRole('checkbox', { name: /Q-.*000005/ })
    expect(api.get).toHaveBeenCalledWith('/question-bank/questions', expect.objectContaining({ params: expect.objectContaining({ per_page: 25 }) }))
    const select = screen.getByLabelText('প্রতি পৃষ্ঠায়')
    expect([...select.options].map(o => o.value)).toEqual(['25', '50', '75', '100'])
    fireEvent.change(select, { target: { value: '100' } })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/question-bank/questions', expect.objectContaining({ params: expect.objectContaining({ per_page: 100 }) })))
    expect(localStorage.getItem('qb.all_questions.per_page')).toBe('100')
  })

  it('writer list: a reviewer\'s selection is kept after a refresh', async () => {
    useAuthStore.setState({ user: { id: 9, role: 'content_moderator' } })
    api.get.mockImplementation((path, config) => path === '/writer/questions'
      ? Promise.resolve({ data: page([question(1, { status: 'review', stimuli: [], items: [], occurrences: [] }), question(2, { status: 'review', stimuli: [], items: [], occurrences: [] })], config.params.per_page) })
      : Promise.resolve({ data: { data: path === '/writer/curriculum' ? { subjects: [], class_levels: [] } : [] } }))
    const first = mount(QbQuestions, '/writer/questions?status=review')
    fireEvent.click(await screen.findByRole('checkbox', { name: 'প্রশ্ন #2' }))
    first.unmount()
    mount(QbQuestions, '/writer/questions?status=review')
    expect(await screen.findByRole('checkbox', { name: 'প্রশ্ন #2' })).toBeChecked()
    expect(screen.getByRole('button', { name: /প্রকাশ করুন \(1\)/ })).toBeEnabled()
  })
})
