import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import AiPlatform from '../pages/super/AiPlatform'
import { buildNav } from '../nav/menu'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))

const page = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <MemoryRouter><AiPlatform /></MemoryRouter></QueryClientProvider>)

const day = (date, n) => ({ date, questions: n, direct: 0, composed: n, not_found: 1, thumbs_down: 0, reviewed: 0, free_reveals: 2 })

// D164 AI-P1.5: the Super Admin sets the free answers a day and the daily question limit (empty = none) and reads the usage counts
describe('AI assistant platform page (D164)', () => {
  afterEach(() => vi.clearAllMocks())

  it('saves the settings and shows the report for the chosen period', async () => {
    api.get.mockImplementation((url, cfg) => Promise.resolve({ data: { data: url === '/super/ai-settings'
      ? { free_answers_per_day: 20, daily_question_limit: null }
      : { days: [day('2026-10-24', 3), day('2026-10-25', 5)].slice(0, cfg?.params?.days === 30 ? 1 : 2), unreviewed: 4, bank: 9 } } }))
    api.put.mockResolvedValue({ data: { data: { free_answers_per_day: 10, daily_question_limit: 50 } } })
    const { container } = page()
    const form = await screen.findByTestId('ai-settings')
    expect(form.querySelector('[name="free_answers_per_day"]').value).toBe('20')
    expect(form.querySelector('[name="daily_question_limit"]').value).toBe('')
    expect((await screen.findByTestId('ai-totals')).textContent).toMatch(/8/)          // 3 + 5 questions
    expect(screen.getByTestId('ai-days').textContent).toMatch(/2026-10-25/)
    fireEvent.change(form.querySelector('[name="free_answers_per_day"]'), { target: { value: '10' } })
    fireEvent.change(form.querySelector('[name="daily_question_limit"]'), { target: { value: '50' } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/super/ai-settings', { free_answers_per_day: 10, daily_question_limit: 50, student_free_answers_per_day: 20 }))
    fireEvent.change(form.querySelector('[name="daily_question_limit"]'), { target: { value: '' } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.put).toHaveBeenLastCalledWith('/super/ai-settings', { free_answers_per_day: 10, daily_question_limit: null, student_free_answers_per_day: 20 }))
    fireEvent.click(container.querySelector('[data-days="30"]'))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/super/ai-report', { params: { days: 30 } }))
  })

  it('is in the Super Admin menu only', () => {
    const paths = (role) => buildNav(role).flatMap(i => i.children ?? [i]).map(i => i.path)
    expect(paths('super_admin')).toContain('/super-admin/ai')
    for (const role of ['admin', 'teacher', 'content_writer']) expect(paths(role)).not.toContain('/super-admin/ai')
  })
})
