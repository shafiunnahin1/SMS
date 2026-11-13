import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import SmsEventSwitches from '../pages/admin/settings/SmsEventSwitches'
import SmsCenter from '../pages/admin/sms/SmsCenter'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() }, bindAuthStore: () => {} }))
const at = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const credits = { balance: '10.00', spent_this_month: '0.00', sent_this_month: 0, rate: '0.25', transactions: [] }
const row = (id, status) => ({ id, to_phone: `0171100000${id}`, message: `msg ${id}`, status, segments: 1, encoding: 'gsm', fallback_used: false, sent_at: null, event_key: 'fee_paid' })

// D208 SMSC.3: the per-event switch saves one event at a time; a pending SMS shows Send (admin/accountant), staff only read
describe('SMS control (D208 SMSC.3)', () => {
  beforeEach(() => { for (const f of ['get', 'post', 'put']) api[f].mockReset(); i18n.changeLanguage('en') })

  it('changes one event mode', async () => {
    const data = { events: { attendance_absent: 'auto', fee_paid: 'auto' }, defaults: {}, transactional: ['fee_paid'] }
    api.get.mockResolvedValue({ data: { data } })
    api.put.mockResolvedValue({ data: { data: { ...data, events: { ...data.events, attendance_absent: 'manual' } } } })
    at(<SmsEventSwitches />)
    const sel = await screen.findByLabelText('Absence')
    expect(screen.getByText('Receipt/salary SMS: sent even if the guardian turned SMS off')).toBeInTheDocument()
    fireEvent.change(sel, { target: { value: 'manual' } })
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/settings/sms-events', { events: { attendance_absent: 'manual' } }))
  })

  it('sends a pending SMS and hides the buttons from staff', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: url === '/sms-logs' ? { data: [row(1, 'pending'), row(2, 'sent')], meta: { next_cursor: null } } : { data: credits } }))
    api.post.mockResolvedValue({ data: { data: { sent: 1, failed: 0, skipped: 0 } } })
    useAuthStore.setState({ user: { role: 'accountant' } })
    const { unmount } = at(<SmsCenter />)
    fireEvent.click(await screen.findByText('Send'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/sms-logs/1/send'))
    fireEvent.click(screen.getByText('Send all waiting (1)'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/sms-logs/send-pending', { ids: [1] }))
    unmount()
    useAuthStore.setState({ user: { role: 'institution_staff' } })
    at(<SmsCenter />)
    expect(await screen.findByText('msg 1')).toBeInTheDocument()
    expect(screen.queryByText('Send')).toBeNull()
  })
})
