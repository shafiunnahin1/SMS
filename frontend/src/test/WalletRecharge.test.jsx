import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import WalletRecharge from '../pages/wallet/WalletRecharge'
import WalletRecharges from '../pages/super/WalletRecharges'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)

// D218 WAL.1: the admin files a manual top-up with the receipt; the Super Admin approves one and cannot reject without a reason
describe('wallet top-up (D218 WAL.1)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {}, openConfirm: (c) => c.onConfirm() })
    api.post.mockResolvedValue({ data: { data: {} } })
  })

  it('shows where to send and files a request with the receipt', async () => {
    api.get.mockResolvedValue({ data: { data: { instructions: 'bKash: 01700000000', methods: ['bkash', 'bank'], min: '1.00', balance: '25.00',
      requests: [{ id: 3, amount: '50.00', method: 'bank', trx_reference: 'DBBL-1', status: 'rejected', decision_note: 'unclear', created_at: '2026-11-14T10:00:00Z' }] } } })
    wrap(<WalletRecharge />)
    expect(await screen.findByTestId('instructions')).toHaveTextContent('bKash: 01700000000')
    expect(screen.getByTestId('requests')).toHaveTextContent('Not accepted')
    expect(screen.getByTestId('requests')).toHaveTextContent('Reason: unclear')
    const form = screen.getByTestId('recharge-form')
    fireEvent.change(form.querySelector('[name=amount]'), { target: { value: '1' } })
    fireEvent.change(form.querySelector('[name=trx_reference]'), { target: { value: 'BK9XA1' } })
    const file = new File(['x'], 'slip.png', { type: 'image/png' })
    fireEvent.change(form.querySelector('[name=receipt]'), { target: { files: [file] } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/wallet/recharge-requests', expect.any(FormData)))
    const fd = api.post.mock.calls[0][1]
    expect([fd.get('amount'), fd.get('method'), fd.get('trx_reference'), fd.get('receipt').name]).toEqual(['1', 'bkash', 'BK9XA1', 'slip.png'])
  })

  it('the Super Admin approves; reject needs a reason', async () => {
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/super/wallet/instructions' ? { instructions: '' }
      : [{ id: 7, amount: '1.00', method: 'bkash', trx_reference: 'BK9XA1', status: 'pending', has_receipt: true, institution: { id: 1, name: 'Demo School' }, created_at: '2026-11-14T10:00:00Z' }] } }))
    wrap(<WalletRecharges />)
    const queue = await screen.findByTestId('queue')
    expect(queue).toHaveTextContent('Demo School')
    expect(queue.querySelector('[data-action=reject]')).toBeDisabled()
    fireEvent.click(queue.querySelector('[data-action=approve]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/super/wallet/recharge-requests/7/approve'))
    fireEvent.change(queue.querySelector('[name=reason-7]'), { target: { value: 'unclear' } })
    fireEvent.click(queue.querySelector('[data-action=reject]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/super/wallet/recharge-requests/7/reject', { reason: 'unclear' }))
  })
})
