import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import { useStaffDepartmentStore } from '../store/staffDepartmentStore'
import CoverDesk from '../pages/substitution/CoverDesk'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), request: vi.fn() }, bindAuthStore: () => {} }))
const at = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><CoverDesk /></MemoryRouter></QueryClientProvider>)
const base = { leave_id: 4, version: '3', occurrence_date: '2030-01-06', source_start_time: '09:00', source_end_time: '09:45', subject: 'Bangla', batch: 'A',
  applicant: 'Karim', original_teacher: 'Karim', substitute: null, source: 'a'.repeat(64), latest_event: 'leave_approved', reason_code: null }
const slots = [{ ...base, id: 1, status: 'unassigned' }, { ...base, id: 2, status: 'offered', substitute: { id: 7, name: 'Free' } }, { ...base, id: 3, status: 'cancelled', latest_event: 'source_invalidated' }]
const as = (role, permissions = []) => { useAuthStore.setState({ role }); useStaffDepartmentStore.setState({ department: role === 'institution_staff' ? 5 : null, permissions }) }

// D204 GAP.1: on the cover screen a department staff member sees only the actions their duty keys allow; the admin sees all of them
describe('staff cover buttons follow the duty keys (D204 GAP.1)', () => {
  beforeEach(() => {
    api.get.mockReset(); i18n.changeLanguage('en')
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/hr/substitution-slots' ? { total: 3, slots } : [{ id: 7, name: 'Free teacher' }] } }))
  })
  afterEach(() => as(null))

  it('read-only key: the list, no action', async () => {
    as('institution_staff', ['staff.leave_substitution.read'])
    at()
    expect(await screen.findAllByTestId('cover-slot')).toHaveLength(3)
    for (const b of ['Offer', 'Withdraw offer', 'Reopen']) expect(screen.queryByText(b)).toBeNull()
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/candidates'))
  })

  it('each key brings only its own button', async () => {
    as('institution_staff', ['staff.leave_substitution.read', 'staff.leave_substitution.clear_offer'])
    at()
    expect(await screen.findByText('Withdraw offer')).toBeInTheDocument()
    expect(screen.queryByText('Offer')).toBeNull()
    expect(screen.queryByText('Reopen')).toBeNull()
  })

  it('the admin sees every action', async () => {
    as('admin')
    at()
    expect(await screen.findByText('Withdraw offer')).toBeInTheDocument()
    expect(screen.getAllByText('Offer').length).toBeGreaterThan(0)
    expect(screen.getByText('Reopen')).toBeInTheDocument()
  })
})
