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
const { filterKey, pruneIds, readFilters } = await import('../features/qb/keptSelection')

// D177 QBK.1: the question filters and the page come back after a reload (a remount here), per user; reset and logout clear them;
// a kept id the curriculum no longer offers is dropped
const EMPTY = { q: '', class_level_ids: [], subject_ids: [], chapter_ids: [], topic_ids: [], curriculum_node_ids: [], question_type_ids: [], source_types: [], years: [] }
const page = (n) => ({ data: [], meta: { total: 90, current_page: n, per_page: 25, last_page: 4, facets: { question_types: [], source_types: [], years: [] } } })

function mount(Page, path) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Page /></MemoryRouter></QueryClientProvider>)
}

describe('kept question filters (D177)', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('locale', 'bn')
    vi.clearAllMocks()
    useAuthStore.setState({ user: { id: 7, role: 'admin' } })
    api.get.mockImplementation((path, config) => {
      if (path.endsWith('/curriculum')) return Promise.resolve({ data: { data: { class_levels: [{ id: 1, name_bn: 'অষ্টম শ্রেণি', name_en: 'Class 8' }], subjects: [] } } })
      return Promise.resolve({ data: page(config?.params?.page ?? 1) })
    })
  })

  it('reads only the known shape and trims ids that are no longer offered', () => {
    localStorage.setItem('k', JSON.stringify({ filters: { q: 'বেগ', class_level_ids: [1, 9], bogus: [1], years: 'x' }, page: 3 }))
    expect(readFilters('k', EMPTY)).toEqual({ filters: { ...EMPTY, q: 'বেগ', class_level_ids: [1, 9] }, page: 3 })
    expect(readFilters('missing', EMPTY)).toEqual({ filters: EMPTY, page: 1 })
    expect(pruneIds({ ...EMPTY, class_level_ids: [1, 9] }, { class_level_ids: new Set(['1']) }).class_level_ids).toEqual([1])
  })

  it('All Questions: search, class and page come back after a reload; a removed class is dropped; reset and logout clear them', async () => {
    const first = mount(QbAllQuestions, '/admin/question-bank/all-questions')
    fireEvent.change(await screen.findByRole('textbox', { name: 'খুঁজুন' }), { target: { value: 'বেগ' } })
    await waitFor(() => expect(JSON.parse(localStorage.getItem(filterKey('all', 7))).filters.q).toBe('বেগ'))
    first.unmount()

    const kept = JSON.parse(localStorage.getItem(filterKey('all', 7)))
    localStorage.setItem(filterKey('all', 7), JSON.stringify({ filters: { ...kept.filters, class_level_ids: [1, 99] }, page: 3 }))
    mount(QbAllQuestions, '/admin/question-bank/all-questions')
    expect(await screen.findByRole('textbox', { name: 'খুঁজুন' })).toHaveValue('বেগ')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/question-bank/questions', expect.objectContaining({ params: expect.objectContaining({ q: 'বেগ', page: 3, class_level_ids: [1] }) })))
    fireEvent.click(screen.getByRole('button', { name: 'ফিল্টার মুছুন' }))
    await waitFor(() => expect(localStorage.getItem(filterKey('all', 7))).toBeNull())

    localStorage.setItem(filterKey('all', 7), JSON.stringify({ filters: { ...EMPTY, q: 'x' }, page: 2 }))
    useAuthStore.getState().clearAuth()
    expect(localStorage.getItem(filterKey('all', 7))).toBeNull()
  })

  it('writer list: another user does not get the filters, the status tab stays in the address', async () => {
    localStorage.setItem(filterKey('writer', 7), JSON.stringify({ filters: { ...EMPTY, q: 'mine' }, page: 2 }))
    useAuthStore.setState({ user: { id: 8, role: 'content_moderator' } })
    api.get.mockImplementation(path => Promise.resolve({ data: path === '/writer/questions' ? page(1) : { data: path === '/writer/curriculum' ? { subjects: [], class_levels: [] } : [] } }))
    mount(QbQuestions, '/writer/questions?status=review')
    expect(await screen.findByRole('textbox', { name: 'খুঁজুন' })).toHaveValue('')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/writer/questions', expect.objectContaining({ params: expect.objectContaining({ status: 'review', page: 1 }) })))
  })
})
