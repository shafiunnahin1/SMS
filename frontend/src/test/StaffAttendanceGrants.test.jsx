import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import { useStaffDepartmentStore } from '../store/staffDepartmentStore'
import AttendanceGrants from '../features/attendance/AttendanceGrants'
import { StaffAttendance } from '../pages/staff/StaffStudents'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))

const wrap = (ui) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)

// D169 (4) STW.5: the head / class teacher gives and revokes a staff member's attendance grant; the staff attendance page lists only
// granted batches plus the staff member's own batches as a teacher (D101), and needs the attendance keys in the selected department.
describe('staff attendance grants (D169 STW.5)', () => {
  beforeEach(() => { vi.clearAllMocks(); useStaffDepartmentStore.getState().clear(); i18n.changeLanguage('en') })

  it('gives and revokes a grant', async () => {
    api.get.mockResolvedValue({ data: { data: { batch: { id: 3, name: 'A' }, grants: [{ id: 7, user: { id: 11, name: 'Rina' } }],
      staff: [{ id: 11, name: 'Rina' }, { id: 12, name: 'Karim' }] } } })
    api.post.mockResolvedValue({ data: { data: { id: 8 } } })
    api.delete.mockResolvedValue({ data: {} })
    wrap(<AttendanceGrants batchId={3} />)
    expect(await screen.findByText('Rina')).toBeInTheDocument()
    const select = screen.getByLabelText('Staff member')
    expect([...select.querySelectorAll('option')].map(o => o.textContent)).not.toContain('Rina')   // already granted
    fireEvent.change(select, { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Give access' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/batches/3/attendance-grants', { user_id: 12 }))
    fireEvent.click(screen.getByRole('button', { name: "Revoke Rina's access" }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/attendance-grants/7'))
  })

  it('the staff page needs the keys, then lists granted and own batches once each', async () => {
    useAuthStore.setState({ role: 'institution_staff' })
    useStaffDepartmentStore.getState().select({ id: 1, name: 'Office' }, ['staff.attendance.index'])
    const { unmount } = wrap(<StaffAttendance />)
    expect(screen.getByText('This department does not allow this work')).toBeInTheDocument()
    unmount()
    useStaffDepartmentStore.getState().select({ id: 1, name: 'Office' }, ['staff.attendance.index', 'staff.attendance.store'])
    api.get.mockImplementation((url) => url === '/staff/attendance-batches' ? Promise.resolve({ data: { data: [{ id: 3, name: 'A', program: { name: 'Class 8' } }] } })
      : url === '/teacher/batches' ? Promise.resolve({ data: { data: [{ id: 3, name: 'A', program: { name: 'Class 8' } }, { id: 4, name: 'B', program: { name: 'Class 8' } }] } })
        : Promise.resolve({ data: { data: { batch: { id: 3 }, rows: [], saved: { count: 0 }, holiday: null } } }))
    wrap(<StaffAttendance />)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/staff/attendance-batches'))
    const options = await screen.findAllByRole('option')
    expect(options.map(o => o.textContent).filter(x => x.includes('Class 8'))).toEqual(['Class 8 — A', 'Class 8 — B'])
    expect(api.get).not.toHaveBeenCalledWith('/batches')   // never the institution's whole batch list
  })
})
