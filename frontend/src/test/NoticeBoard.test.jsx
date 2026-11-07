import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import NoticeBoard from '../pages/notices/NoticeBoard'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() }, bindAuthStore: () => {} }))

const notice = { id: 4, title: 'Exam routine', content: 'Exams start Sunday.', target: 'all', published_at: '2026-11-01T09:00:00+06:00',
  require_ack: true, ack_deadline: '2026-11-10', read_at: null, acknowledged_at: null }
const at = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><NoticeBoard /></MemoryRouter></QueryClientProvider>)

// D193 NTC.1: the reader's notice board - empty state, opening marks read, the acknowledgement is sent once.
describe('notice board (D193 NTC.1)', () => {
  beforeEach(() => { api.get.mockReset(); api.post.mockReset(); i18n.changeLanguage('en') })

  it('shows the empty state', async () => {
    api.get.mockResolvedValue({ data: { data: [] } })
    at()
    expect(await screen.findByText('No notices yet')).toBeInTheDocument()
  })

  it('opens a notice (marks it read) and acknowledges it', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/notices' ? [notice] : notice } }))
    api.post.mockResolvedValue({ data: { data: { ...notice, acknowledged_at: '2026-11-02T10:00:00+06:00' } } })
    at()
    fireEvent.click(await screen.findByText('Exam routine'))
    expect(await screen.findByText('Exams start Sunday.')).toBeInTheDocument()
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/notices/4'))
    fireEvent.click(screen.getByText('I have read this'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/notices/4/ack'))
  })
})
