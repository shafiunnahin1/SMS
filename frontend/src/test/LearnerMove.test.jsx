import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import LearnerProfile from '../pages/learner/LearnerProfile'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))

const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)

// D165 ST.5: an institution's student sees the program's class (read-only), picks a batch and moves purchases to their own account
describe('institution student profile and move (D165)', () => {
  afterEach(() => vi.clearAllMocks())

  it('shows the class read-only and moves purchases with a mobile code', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/learner/profile'
      ? { qb_class_level_id: 9, class_level: { id: 9, name_bn: 'নবম শ্রেণি', name_en: 'Class 9' }, class_editable: false, qb_exam_batch_id: null, batches: [] } : [] } }))
    api.post.mockImplementation((url) => Promise.resolve({ data: { data: url === '/learner/move' ? { phone: '018******11' } : { moved: 2, login_host: 'learn.schoolapp.com' } } }))
    const { container } = wrap(<LearnerProfile />)
    const box = await screen.findByTestId('learner-move')
    expect(container.querySelector('[name="qb_class_level_id"]')).toBeNull()
    expect(container.textContent).toMatch(/নবম শ্রেণি|Class 9/)
    fireEvent.change(box.querySelector('[name="phone"]'), { target: { value: '01811111111' } })
    fireEvent.change(box.querySelector('[name="password"]'), { target: { value: 'Own-pass-2026' } })
    fireEvent.change(box.querySelector('[name="password_confirmation"]'), { target: { value: 'Own-pass-2026' } })
    fireEvent.click(box.querySelector('[name="accept_terms"]'))
    fireEvent.click(box.querySelector('[data-action="move-start"]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/learner/move', { phone: '01811111111', password: 'Own-pass-2026', password_confirmation: 'Own-pass-2026', accept_terms: true }))
    fireEvent.change(await waitFor(() => { const c = box.querySelector('[name="code"]'); expect(c).not.toBeNull(); return c }), { target: { value: '123456' } })
    fireEvent.click(box.querySelector('[data-action="move-verify"]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/learner/move/verify', { code: '123456' }))
    expect((await screen.findByTestId('learner-move-done')).textContent).toMatch(/learn\.schoolapp\.com/)
  })
})
