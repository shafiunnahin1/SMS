import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    screen.getByTestId('qb-create-paper').querySelector('[data-action="create-paper"]').click()   // a second click keeps it open
    expect(await screen.findByRole('textbox', { name: /প্রশ্নপত্রের নাম|নাম/ })).toBeInTheDocument()
  })

  it('filters language subjects by the active curriculum and keeps both filter families for mixed subjects', async () => {
    api.get.mockImplementation(path => {
      if (path.endsWith('/curriculum')) return Promise.resolve({ data: { data: {
        class_levels: [{ id: 7, name_bn: 'অষ্টম শ্রেণি', name_en: 'Class 8' }],
        subjects: [
          { id: 10, name_bn: 'বাংলা ১ম পত্র', name_en: 'Bangla 1st Paper', class_level_ids: [7], chapters: [] },
          { id: 11, name_bn: 'বিজ্ঞান', name_en: 'Science', class_level_ids: [7], chapters: [{ id: 12, name_bn: 'জীবজগৎ', name_en: 'Living World', class_level_ids: [], topics: [{ id: 13, name_bn: 'কোষ', name_en: 'Cell' }] }] },
        ],
        curriculum_versions: [
          { id: 20, qb_subject_id: 10, name_bn: '২০২৬', name_en: '2026', is_active: true, class_level_ids: [7], nodes: [
            { id: 30, kind: 'Part', name_bn: 'গদ্য', name_en: 'Prose', sort_order: 1, children: [
              { id: 31, kind: 'Lesson', name_bn: 'পাঠ ১', name_en: 'Lesson 1', parent_id: 30, sort_order: 1, children: [] },
            ] },
          ] },
          { id: 21, qb_subject_id: 10, name_bn: 'পুরনো', name_en: 'Old', is_active: false, class_level_ids: [7], nodes: [
            { id: 40, kind: 'Part', name_bn: 'পুরনো অংশ', name_en: 'Old Part', children: [] },
          ] },
        ],
      } } })
      return Promise.resolve({ data: { data: [], meta: { total: 0, current_page: 1, per_page: 16, last_page: 1, facets: { question_types: [], source_types: [], years: [] } } } })
    })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'শ্রেণি' }))
    fireEvent.click(await screen.findByText('অষ্টম শ্রেণি'))
    fireEvent.click(screen.getByTestId('qb-filter').querySelector('[data-filter="subject"] button'))
    fireEvent.click(await screen.findByText('বাংলা ১ম পত্র'))

    const filter = screen.getByTestId('qb-filter')
    expect(filter.querySelector('[data-filter="chapter"]')).toBeNull()
    expect(filter.querySelector('[data-filter="topic"]')).toBeNull()
    const curriculum = await screen.findByTestId('curriculum-picker')
    expect(curriculum).toHaveTextContent('গদ্য')
    expect(curriculum).not.toHaveTextContent('পুরনো অংশ')
    fireEvent.change(curriculum.querySelectorAll('select')[1], { target: { value: '30' } })
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/question-bank/questions', expect.objectContaining({
      params: expect.objectContaining({ curriculum_node_ids: ['30'] }),
    })))

    fireEvent.click(await screen.findByText('বিজ্ঞান'))
    expect(filter.querySelector('[data-filter="chapter"]')).toBeInTheDocument()
    expect(filter.querySelector('[data-filter="topic"]')).toBeInTheDocument()
    expect((await screen.findByTestId('curriculum-picker')).querySelector('[data-testid="curriculum-breadcrumb"]')).toBeNull()
  })
})
