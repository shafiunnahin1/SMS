import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import QbPractice from '../pages/student/QbPractice'
import { buildNav } from '../nav/menu'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))

const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const tree = { my_class_level_id: 9, subjects: [{ id: 3, name_bn: 'গণিত', name_en: 'Maths', class_level_ids: [9], chapters: [{ id: 7, name_bn: 'অধ্যায় ১', name_en: 'Ch 1', topics: [] }] }] }
const q = { id: 11, question_text: '2+2?', options: [{ label: 'ক', content_text: '4' }, { label: 'খ', content_text: '5' }] }

// D165 ST.4: start a round, answer, submit once - then the result, the right option and the explanation; the summary is listed
describe('student practice (D165)', () => {
  afterEach(() => vi.clearAllMocks())

  it('runs a round and shows the marked result', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/student/qb/curriculum' ? tree
      : { summary: [{ qb_subject_id: 3, qb_chapter_id: 7, rounds: 2, total: 20, correct: 15, percent: 75 }], latest: [] } } }))
    api.post.mockImplementation((url) => Promise.resolve({ data: { data: url === '/student/qb/practice' ? { id: 5, questions: [q] }
      : { id: 5, total: 1, correct: 1, results: [{ question_id: 11, chosen: 'ক', is_right: true, question: { ...q, options: [{ label: 'ক', content_text: '4', is_correct: true }, { label: 'খ', content_text: '5', is_correct: false }], explanation_text: 'EXPLAINED' } }] } } }))
    const { container } = wrap(<QbPractice />)
    await screen.findByTestId('qb-practice')
    expect((await screen.findByTestId('practice-summary')).textContent).toMatch(/75/)
    fireEvent.change(container.querySelector('[name="subject"]'), { target: { value: '3' } })
    fireEvent.change(container.querySelector('[name="chapter"]'), { target: { value: '7' } })
    fireEvent.click(container.querySelector('[data-action="start"]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/student/qb/practice', { qb_subject_id: 3, qb_chapter_id: 7, count: 10 }))
    const round = await screen.findByTestId('practice-round')
    expect(round.textContent).not.toMatch(/EXPLAINED|✓/)
    fireEvent.click(round.querySelector('input[value="ক"]'))
    fireEvent.click(round.querySelector('[data-action="submit"]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/student/qb/practice/5/submit', { answers: { 11: 'ক' } }))
    await screen.findByTestId('practice-result')
    expect(round.textContent).toMatch(/EXPLAINED/)
    expect(round.textContent).toMatch(/✓/)
    expect(buildNav('student', { modules: ['question_bank'] }).map(i => i.path)).toContain('/student/practice')
  })
})
