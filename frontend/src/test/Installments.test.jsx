import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import Installments from '../pages/fees/Installments'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() }, bindAuthStore: () => {} }))
const at = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Installments /></MemoryRouter></QueryClientProvider>)
const plan = { id: 4, due_key: '7:2:once', total_amount: '900.00', installments: 3, category: 'Admission',
  items: [{ id: 41, installment_no: 1, amount: '300.00', due_date: '2026-11-15', status: 'paid' }, { id: 42, installment_no: 2, amount: '300.00', due_date: '2026-12-15', status: 'pending' }] }

// D211 INST.2: pick a student, make installments of one due (a due already in a plan cannot be chosen again), pay an unpaid one;
// the overdue tab pays from the list
describe('fee installments (D211 INST.2)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ openConfirm: (c) => c.onConfirm() })
  })

  it('makes a plan and pays an installment', async () => {
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/students' ? [{ id: 7, name: 'Rafi', student_id: 'C-7' }]
      : u === '/fees/dues' ? { lines: [{ key: '7:2:once', category: 'Admission', period: 'once', amount: '600.00' }, { key: '7:1:2026-11', category: 'Monthly', period: '2026-11', amount: '500.00' }] }
      : [plan] } }))
    api.post.mockResolvedValue({ data: { data: { receipt_no: 'RCP-2026-00001' } } })
    at()
    fireEvent.change(screen.getByTestId('inst-find').querySelector('[name=q]'), { target: { value: 'Raf' } })
    fireEvent.click(await screen.findByText('Rafi', { exact: false }))
    const form = await screen.findByTestId('inst-form')
    await waitFor(() => expect(form.querySelector('[name=due_key] option[value="7:1:2026-11"]')).not.toBeNull())
    expect(form.querySelector('[name=due_key] option[value="7:2:once"]').textContent).toContain('in installments')
    fireEvent.change(form.querySelector('[name=due_key]'), { target: { value: '7:1:2026-11' } })
    fireEvent.change(form.querySelector('[name=installments]'), { target: { value: '2' } })
    fireEvent.change(form.querySelector('[name=first_due_date]'), { target: { value: '2026-12-01' } })
    fireEvent.click(form.querySelector('[data-action=create]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/fees/installments/plan', { student_id: 7, due_key: '7:1:2026-11', installments: 2, first_due_date: '2026-12-01' }))
    const pays = screen.getAllByText('Take installment')
    expect(pays).toHaveLength(1)   // only the unpaid one
    fireEvent.click(pays[0])
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/fees/installments/42/pay', { payment_method: 'cash' }))
  })

  it('lists overdue installments', async () => {
    api.get.mockResolvedValue({ data: { data: [{ id: 42, installment_no: 2, amount: '300.00', due_date: '2026-12-15', status: 'overdue', category: 'Admission', student: { name: 'Rafi', student_id: 'C-7' } }] } })
    at()
    fireEvent.click(screen.getByText('Overdue'))
    expect(await screen.findByTestId('overdue-list')).toHaveTextContent('Rafi')
    expect(api.get).toHaveBeenCalledWith('/fees/installments/overdue')
  })
})
