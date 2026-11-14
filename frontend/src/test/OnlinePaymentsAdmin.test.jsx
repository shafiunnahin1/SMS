import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import OnlinePayments from '../pages/payments/OnlinePayments'
import PaymentSettings from '../pages/payments/PaymentSettings'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const late = { id: 4, institution: { id: 1, name: 'Demo School' }, ref: 'FLATE', gateway: 'fakeqr', channel: 'banglaqr', amount: '500.00', status: 'review', failure_reason: 'late_payment', initiated_at: '2026-11-14T10:00:00Z' }
const wrong = { ...late, id: 5, ref: 'FWRONG', failure_reason: 'amount_mismatch' }

// D217 OPAY.3: the Super Admin's review queue (accept only a late payment), the institution's read-only list, the admin's switch
describe('online payments admin (D217 OPAY.3)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put', 'delete']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {}, openConfirm: (c) => c.onConfirm() })
    api.post.mockResolvedValue({ data: { data: {} } })
    api.put.mockResolvedValue({ data: { data: {} } })
  })

  it('the Super Admin accepts a late payment; a wrong amount can only be refunded', async () => {
    api.get.mockResolvedValue({ data: { data: [late, wrong] } })
    wrap(<OnlinePayments mode="super" />)
    const list = await screen.findByTestId('payment-list')
    expect(api.get).toHaveBeenCalledWith('/super/online-payments', { params: { status: 'review' } })
    expect(list).toHaveTextContent('Paid after the time was over')
    expect(list).toHaveTextContent('A different amount was paid')
    expect(list.querySelectorAll('[data-action=accept]')).toHaveLength(1)
    expect(list.querySelectorAll('[data-action=refund]')).toHaveLength(2)
    fireEvent.click(list.querySelector('[data-action=accept]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/super/online-payments/4/resolve', { action: 'accept_as_paid' }))
  })

  it('the institution list is read only', async () => {
    api.get.mockResolvedValue({ data: { data: [{ ...late, institution: undefined, student: { id: 11, name: 'Rafi', student_id: 'S-1' } }] } })
    wrap(<OnlinePayments />)
    const list = await screen.findByTestId('payment-list')
    expect(api.get).toHaveBeenCalledWith('/admin/payments', { params: {} })
    expect(list).toHaveTextContent('Rafi')
    expect(list.querySelector('[data-action=accept]')).toBeNull()
    expect(list.querySelector('[data-action=refund]')).toBeNull()
  })

  it('the admin switches the test gateway on with the password, then off', async () => {
    const base = { available_gateways: [{ key: 'fakeqr', label: { bn: 'পরীক্ষামূলক QR', en: 'Test QR' }, flow: 'qr', sandbox_toggle: false, credential_fields: [] }], effective_mode: { fakeqr: null }, real_gateways: false }
    let rows = []
    api.get.mockImplementation(() => Promise.resolve({ data: { data: { ...base, gateways: rows } } }))
    wrap(<PaymentSettings />)
    expect(await screen.findByTestId('state-fakeqr')).toHaveTextContent('Off')
    fireEvent.change(document.querySelector('[name=password-fakeqr]'), { target: { value: 'Secret#123' } })
    rows = [{ gateway: 'fakeqr', status: 'active' }]
    fireEvent.click(document.querySelector('[data-action=on]'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/settings/payments/gateways/fakeqr', { password: 'Secret#123', credentials: {} }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/settings/payments/gateways/fakeqr/test'))
    await waitFor(() => expect(screen.getByTestId('state-fakeqr')).toHaveTextContent('On: parents see the Pay button'))
    api.delete.mockResolvedValue({ data: { data: {} } })
    fireEvent.click(document.querySelector('[data-action=off]'))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/admin/settings/payments/gateways/fakeqr'))
  })
})
