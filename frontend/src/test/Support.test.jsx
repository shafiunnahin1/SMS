import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import SupportTickets from '../pages/support/SupportTickets'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() }, bindAuthStore: () => {} }))

const ticket = { id: 4, ticket_no: 'TKT-2026-00004', subject: 'SMS not sent', category: 'sms', priority: 'high', status: 'pending_platform', institution: 'Alo School', overdue: true }
const detail = { ...ticket, messages: [{ id: 1, author_type: 'customer', author: 'Admin', body: 'Nothing went out', created_at: '2026-11-07T10:00:00+06:00' },
  { id: 2, author_type: 'platform', author: 'SA', body: 'Key is wrong', is_internal: true, created_at: '2026-11-07T11:00:00+06:00' }] }
const at = (mode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><SupportTickets mode={mode} /></MemoryRouter></QueryClientProvider>)

// D193 SUP.1: the institution opens a ticket; the platform sees the queue (overdue marked), internal notes and can send one
describe('support tickets (D193 SUP.1)', () => {
  beforeEach(() => {
    api.get.mockReset(); api.post.mockReset(); i18n.changeLanguage('en')
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url.endsWith('/4') ? detail : [ticket] } }))
    api.post.mockResolvedValue({ data: { data: detail } })
  })

  it('the institution opens a ticket', async () => {
    at('institution')
    fireEvent.click(await screen.findByText('New ticket'))
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Bill is wrong' } })
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'billing' } })
    fireEvent.change(screen.getByLabelText('Describe the problem'), { target: { value: 'Twice charged' } })
    fireEvent.click(screen.getByText('Send'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/support/tickets', { subject: 'Bill is wrong', category: 'billing', priority: 'normal', body: 'Twice charged' }))
  })

  it('the platform sees the queue and sends an internal note', async () => {
    at('super')
    expect((await screen.findAllByText(/first answer late/)).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Alo School').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByText('Open')[0])
    expect(await screen.findByText('Key is wrong')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Your reply'), { target: { value: 'Asked the gateway' } })
    fireEvent.click(screen.getByLabelText('Internal note (the institution never sees it)'))
    fireEvent.click(screen.getByText('Send'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/super/support/tickets/4/messages', { body: 'Asked the gateway', is_internal: true }))
  })
})
