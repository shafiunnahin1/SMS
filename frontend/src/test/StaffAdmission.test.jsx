import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useStaffDepartmentStore } from '../store/staffDepartmentStore'
import { StaffStudentAdd, StaffStudents } from '../pages/staff/StaffStudents'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() }, bindAuthStore: () => {} }))

const at = (path) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/staff/students" element={<StaffStudents />} />
    <Route path="/staff/students/new" element={<StaffStudentAdd />} />
  </Routes></MemoryRouter></QueryClientProvider>)

// D169 STW.3: staff admission needs staff.student.store in the selected department; it has no guardian-consent boxes and sends no
// consent; when the staff batch list is refused (a teacher's own batches only) the form still admits, without a batch.
describe('staff admission (D169 STW.3)', () => {
  beforeEach(() => { vi.clearAllMocks(); useStaffDepartmentStore.getState().clear(); i18n.changeLanguage('en') })

  it('needs the key in the selected department', () => {
    useStaffDepartmentStore.getState().select({ id: 1, name: 'Office' }, ['staff.student.index'])
    at('/staff/students/new')
    expect(screen.getByText('This department does not allow this work')).toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
  })

  it('admits without consent boxes, and without a batch when the batch list is refused', async () => {
    useStaffDepartmentStore.getState().select({ id: 1, name: 'Office' }, ['staff.student.index', 'staff.student.store'])
    api.get.mockImplementation((url) => url === '/batches' ? Promise.reject(Object.assign(new Error('403'), { response: { status: 403 } }))
      : Promise.resolve({ data: { data: [] } }))
    api.post.mockResolvedValue({ data: { data: { id: 5, student_id: '2026000005' } } })
    at('/staff/students/new')
    expect(await screen.findByTestId('staff-no-batch')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).toBeNull()   // no guardian-consent boxes
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Rahim' } })
    fireEvent.change(screen.getByLabelText('Guardian phone'), { target: { value: '01711000001' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/students')
    const sent = body instanceof FormData ? Object.fromEntries(body.entries()) : body
    expect(sent.name).toBe('Rahim')
    for (const k of ['consent_data', 'consent_sms', 'fee_override']) expect(sent[k]).toBeUndefined()
  })

  it('shows the admit button on the list only with the key, in Bengali too', async () => {
    api.get.mockResolvedValue({ data: { data: [] } })
    useStaffDepartmentStore.getState().select({ id: 1, name: 'Office' }, ['staff.student.index'])
    const { unmount } = at('/staff/students')
    await screen.findByTestId('staff-students')
    expect(screen.queryByRole('button', { name: 'New admission' })).toBeNull()
    unmount()
    await i18n.changeLanguage('bn')
    useStaffDepartmentStore.getState().select({ id: 1, name: 'Office' }, ['staff.student.index', 'staff.student.store'])
    at('/staff/students')
    expect(await screen.findByRole('button', { name: 'নতুন ভর্তি' })).toBeInTheDocument()
  })
})
