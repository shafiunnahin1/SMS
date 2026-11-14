import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import StudentWallet from '../pages/wallet/StudentWallet'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const data = { balance: '121.00', min: '1.00', methods: ['bkash', 'bank'], instructions: 'bKash 017...', bkash: true,
  transactions: [{ id: 2, type: 'recharge', amount: '120.00', balance_after: '121.00', created_at: '2026-11-14T10:00:00Z' }], requests: [] }

// D218 WAL.3: the student sees the balance and history and starts a bKash top-up
describe('student wallet (D218 WAL.3)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {} })
  })

  it('shows the balance and history and starts bKash', async () => {
    api.get.mockResolvedValue({ data: { data } })
    api.post.mockResolvedValue({ data: { data: { bkash_url: 'https://sandbox.bkash.test/pay/PAY7', ref: 'UW1R', amount: '50.00' } } })
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    wrap(<StudentWallet />)
    expect(await screen.findByTestId('wallet-balance')).toHaveTextContent('121')
    expect(screen.getByTestId('ledger')).toHaveTextContent('Top-up')
    const box = screen.getByTestId('bkash-topup')
    fireEvent.change(box.querySelector('[name=bkash_amount]'), { target: { value: '50' } })
    fireEvent.click(box.querySelector('[data-action=bkash]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/student/wallet/bkash', { amount: '50' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://sandbox.bkash.test/pay/PAY7'))
    vi.unstubAllGlobals()
  })

  it('without bKash only the manual top-up is offered', async () => {
    api.get.mockResolvedValue({ data: { data: { ...data, bkash: false } } })
    wrap(<StudentWallet />)
    await screen.findByTestId('recharge-form')
    expect(screen.queryByTestId('bkash-topup')).toBeNull()
  })
})
