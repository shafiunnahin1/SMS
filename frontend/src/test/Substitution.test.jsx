import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import CoverDesk from '../pages/substitution/CoverDesk'
import MyCovers from '../pages/substitution/MyCovers'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), request: vi.fn() }, bindAuthStore: () => {} }))
const at = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const slot = { id: 9, leave_id: 4, version: '3', status: 'unassigned', occurrence_date: '2030-01-06', source_start_time: '09:00', source_end_time: '09:45', subject: 'Bangla', batch: 'A',
  applicant: 'Karim', original_teacher: 'Karim', substitute: null, source: 'a'.repeat(64), latest_event: 'leave_approved', reason_code: null }

// D200 SUBL.5: the admin offers a free teacher; the teacher accepts an offer - each action sends a fresh Idempotency-Key and the
// version + source digest the list was read with
describe('substitution screens (D200 SUBL.5)', () => {
  beforeEach(() => { api.get.mockReset(); api.request.mockReset(); i18n.changeLanguage('en') })

  it('the admin offers a free teacher', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/hr/substitution-slots' ? { total: 1, slots: [slot] } : [{ id: 7, name: 'Free teacher' }] } }))
    api.request.mockResolvedValue({ data: { data: {} } })
    at(<CoverDesk />)
    await screen.findByRole('option', { name: 'Free teacher' })
    fireEvent.change(screen.getByLabelText('Substitute teacher'), { target: { value: '7' } })
    fireEvent.click(screen.getByText('Offer'))
    await waitFor(() => expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'put', url: '/hr/leaves/4/substitution-slots/9/offer',
      data: { substitute_teacher_id: '7', expected_versions: { slot: '3', source: 'a'.repeat(64) } } })))
    expect(api.request.mock.calls[0][0].headers['Idempotency-Key']).toBeTruthy()
  })

  it('the teacher accepts an offer', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/teacher/substitution-offers' ? [{ ...slot, status: 'offered', substitute: { id: 7, name: 'Me' } }] : [] } }))
    api.request.mockResolvedValue({ data: { data: {} } })
    at(<MyCovers />)
    fireEvent.click(await screen.findByText('Accept'))
    await waitFor(() => expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'patch', url: '/hr/leaves/4/substitution-slots/9/accept', data: { expected_versions: { slot: '3', source: 'a'.repeat(64) } } })))
    expect(screen.getByText('Waiting for an answer')).toBeInTheDocument()
  })
})
