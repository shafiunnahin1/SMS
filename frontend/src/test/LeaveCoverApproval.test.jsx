import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import LeaveCoverApproval from '../features/substitution/LeaveCoverApproval'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), request: vi.fn() }, bindAuthStore: () => {} }))
const at = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const slot = (id, routine, date) => ({ id, leave_id: 4, version: '1', status: 'unassigned', routine_id: routine, occurrence_date: date, source_start_time: '09:00', source_end_time: '09:45', subject: 'Bangla', batch: 'A',
  original_teacher: 'Karim', substitute: null, source: 'a'.repeat(64) })

// D201 SUBM.1: the admin approves a Teacher's leave with a choice for every period (a substitute or an explicit gap), sends the
// scope digest the list was read with and a fresh Idempotency-Key, and sees which periods stayed open
describe('leave approval with substitutes (D201 SUBM.1)', () => {
  beforeEach(() => { api.get.mockReset(); api.request.mockReset(); i18n.changeLanguage('en') })

  it('sends every period choice with the scope', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: { data:
      url === '/hr/leaves' ? [{ id: 4, user_id: 9, status: 'pending' }, { id: 5, user_id: null, staff_id: 2, status: 'pending' }]
      : url === '/hr/leaves/4/substitution-slots' ? { leave: { id: 4, from_date: '2030-01-06', to_date: '2030-01-07' }, occurrence_scope: 'b'.repeat(64), slots: [slot(1, 11, '2030-01-06'), slot(2, 12, '2030-01-07')] }
      : [{ id: 7, name: 'Free teacher' }] } }))
    api.request.mockResolvedValue({ data: { data: { status: 'approved' }, cover_gaps: [{ routine_id: 11, occurrence_date: '2030-01-06', reason: 'target_busy' }] } })
    at(<LeaveCoverApproval />)
    await waitFor(() => expect(screen.getAllByRole('option', { name: 'Free teacher' })).toHaveLength(2))
    expect(screen.getAllByTestId('leave-cover-approval')).toHaveLength(1)                 // the staff member's leave has no panel
    fireEvent.change(screen.getAllByLabelText('Substitute teacher')[0], { target: { value: '7' } })
    fireEvent.click(screen.getByText('Approve with these choices'))
    await waitFor(() => expect(api.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'patch', url: '/hr/leaves/4/approve', data: {
      cover_choices: [{ routine_id: 11, occurrence_date: '2030-01-06', substitute_teacher_id: 7 }, { routine_id: 12, occurrence_date: '2030-01-07', substitute_teacher_id: null }],
      expected_versions: { occurrence_scope: 'b'.repeat(64) } } })))
    expect(api.request.mock.calls[0][0].headers['Idempotency-Key']).toBeTruthy()
    expect(await screen.findByTestId('cover-gaps')).toHaveTextContent('the teacher is busy then')
  })
})
