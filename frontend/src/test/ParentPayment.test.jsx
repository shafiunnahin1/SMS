import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useInstitutionStore } from '../store/institutionStore'
import ParentFees from '../pages/parent/Fees'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const dues = { lines: [{ key: '5:1:2026-10', category: 'Tuition', period: '2026-10', amount: '500.00' }, { key: '5:1:2026-11', category: 'Tuition', period: '2026-11', amount: '500.00' }], total: '1000.00' }
let status
const serve = (options) => api.get.mockImplementation((u) => Promise.resolve({ data: { data:
  u === '/parent/children' ? [{ id: 11, name: 'Rafi' }] : u === '/parent/fees' ? dues : u === '/parent/fees/payment-options' ? options
  : u.startsWith('/parent/online-payments/') ? status : [] } }))

// D217 OPAY.2: with a gateway the parent ticks dues, pays, sees the QR and then the receipt; without one there is no Pay button
describe('parent online payment (D217 OPAY.2)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post']) api[f].mockReset()
    i18n.changeLanguage('en')
    useInstitutionStore.setState({ modules: ['fees', 'online_payment'] })
    status = { ref: 'FABC', status: 'initiated', flow: 'qr', amount: '500.00', qr_payload: 'FAKEQR|FABC|500.00', expires_at: new Date(Date.now() + 120000).toISOString(), receipt_no: null }
  })

  it('ticks a due, pays by QR and sees the receipt', async () => {
    serve([{ gateway: 'fakeqr', label: { bn: 'পরীক্ষামূলক QR', en: 'Test QR' }, mode: 'institution', flow: 'qr' }])
    api.post.mockResolvedValue({ data: { data: { flow: 'qr', ref: 'FABC', mode: 'institution', qr_payload: 'FAKEQR|FABC|500.00', expires_at: status.expires_at } } })
    wrap(<ParentFees />)
    const bar = await screen.findByTestId('pay-bar')
    const payBtn = bar.querySelector('[data-action=pay-fakeqr]')
    expect(payBtn).toBeDisabled()
    fireEvent.click(document.querySelector('[name="due-5:1:2026-11"]'))
    expect(bar).toHaveTextContent('1 selected')
    fireEvent.click(payBtn)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/fees/payment/fakeqr/create', { student_id: 11, dues: ['5:1:2026-11'] }))
    const panel = await screen.findByTestId('qr-panel')
    expect(panel.querySelector('svg')).not.toBeNull()
    expect(panel).toHaveTextContent('Time left: 0')
    expect(screen.queryByTestId('pay-bar')).toBeNull()

    status = { ...status, status: 'success', receipt_no: 'R-2026-0007', qr_payload: null, expires_at: null }
    await waitFor(() => expect(screen.getByTestId('pay-success')).toHaveTextContent('Receipt: R-2026-0007'), { timeout: 6000 })
    fireEvent.click(panel.querySelector('[data-action=done]'))
    await waitFor(() => expect(screen.queryByTestId('qr-panel')).toBeNull())
  }, 10000)

  it('no gateway: no checkbox and no Pay button', async () => {
    serve([])
    wrap(<ParentFees />)
    await screen.findByTestId('parent-dues')
    expect(screen.queryByTestId('pay-bar')).toBeNull()
    expect(document.querySelector('[type=checkbox]')).toBeNull()
  })
})
