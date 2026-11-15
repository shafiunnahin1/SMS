import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import TeacherPayouts from '../pages/payouts/TeacherPayouts'
import MyPayouts from '../pages/payouts/MyPayouts'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const rows = [
  { id: 1, teacher: { id: 5, name: 'Rahim' }, batch: { id: 2, name: 'Physics' }, month: '2026-10', classes_taken: 3, collection_base: '0.00', amount: '750.00', status: 'draft', paid_at: null, note: null },
  { id: 2, teacher: { id: 6, name: 'Karim' }, batch: { id: 2, name: 'Physics' }, month: '2026-10', classes_taken: 0, collection_base: '1600.50', amount: '200.06', status: 'approved', paid_at: null, note: null },
]

// D223 TPO.2: the payouts screen - calculate, change a draft with a reason, approve, pay; the teacher's own read-only list
describe('teacher payouts (D223)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {}, openConfirm: (c) => c.onConfirm() })
    api.get.mockResolvedValue({ data: { data: rows, meta: { total: '950.06' } } })
    api.post.mockResolvedValue({ data: { data: rows, meta: { total: '950.06' } } })
    api.put.mockResolvedValue({ data: { data: rows[0] } })
  })

  it('calculates, edits a draft, approves and pays', async () => {
    wrap(<TeacherPayouts />)
    const list = await screen.findByTestId('payout-list')
    expect(screen.getByTestId('payouts-total')).toHaveTextContent('950.06')
    const [draft, approved] = within(list).getAllByTestId('payout')
    expect(draft).toHaveTextContent('3 classes')
    fireEvent.click(screen.getByRole('button', { name: 'Calculate' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/teacher-payouts/generate', { month: expect.stringMatching(/^\d{4}-\d{2}$/) }))
    fireEvent.change(draft.querySelector('[name=amount-1]'), { target: { value: '800' } })
    fireEvent.change(draft.querySelector('[name=note-1]'), { target: { value: 'September short' } })
    fireEvent.click(draft.querySelector('[data-action=save]'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/teacher-payouts/1', { amount: '800', note: 'September short' }))
    fireEvent.click(draft.querySelector('[data-action=approve]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/teacher-payouts/1/approve'))
    fireEvent.change(approved.querySelector('[name=method-2]'), { target: { value: 'bkash' } })
    fireEvent.click(approved.querySelector('[data-action=pay]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/teacher-payouts/2/pay', { method: 'bkash', date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }))
  })

  it('shows the teacher their own payouts', async () => {
    api.get.mockResolvedValue({ data: { data: [{ ...rows[1], status: 'paid', paid_at: '2026-11-10T06:00:00Z' }] } })
    wrap(<MyPayouts />)
    expect(await screen.findByTestId('my-payout')).toHaveTextContent('Paid')
    expect(api.get).toHaveBeenCalledWith('/teacher/payouts')
  })
})
