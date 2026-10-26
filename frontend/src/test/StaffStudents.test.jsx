import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useStaffDepartmentStore } from '../store/staffDepartmentStore'
import { StaffStudents, StaffStudentProfile } from '../pages/staff/StaffStudents'
import { buildNav } from '../nav/menu'

vi.mock('../api/axios', () => ({ default: { get: vi.fn() }, bindAuthStore: () => {} }))

const student = { id: 5, student_id: '2026000005', name: 'Rahim', guardian_phone: '01711000001', father_name: 'Karim', mother_name: 'Rahima',
  gender: 'male', date_of_birth: '2012-03-04', address: 'Dhaka', blood_group: 'A+', religion: 'Islam', studying_at: null, admission_date: '2026-01-01',
  photo_url: null, status: 'active', roll_no: 7, batch: { id: 2, name: 'A' }, enrollments: [{ id: 9, batch: { id: 2, name: 'A' }, program: { id: 1, name: 'Class 8' }, roll_no: 7, is_primary: true }] }

const at = (path) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/staff/students" element={<StaffStudents />} />
    <Route path="/staff/students/:id" element={<StaffStudentProfile />} />
  </Routes></MemoryRouter></QueryClientProvider>)

// D169 STW.2: the staff student view is read only, needs the selected department's key, shows the full core profile
// (date of birth, address, blood group, religion, guardian phone) and no edit / delete / consent / fee-override.
describe('staff student view (D169 STW.2)', () => {
  beforeEach(() => { api.get.mockReset(); useStaffDepartmentStore.getState().clear(); i18n.changeLanguage('en') })

  it('asks for a department, then for the key, before any request', () => {
    at('/staff/students')
    expect(screen.getByText('Choose a department first')).toBeInTheDocument()
    useStaffDepartmentStore.getState().select({ id: 3, name: 'Accounts' }, ['staff.fee.collect'])
    at('/staff/students')
    expect(screen.getAllByText('This department does not allow this work').length).toBeGreaterThan(0)
    expect(api.get).not.toHaveBeenCalled()
  })

  it('lists and searches students, and opens the read-only profile', async () => {
    useStaffDepartmentStore.getState().select({ id: 1, name: 'Office' }, ['staff.student.index', 'staff.student.show'])
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/students' ? [student] : student } }))
    at('/staff/students')
    expect((await screen.findAllByText('Rahim')).length).toBeGreaterThan(0)
    fireEvent.change(screen.getByLabelText(/Name, ID or phone|নাম, আইডি বা ফোন/), { target: { value: 'Rah' } })
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/students', { params: { q: 'Rah', per_page: 50 } }))

    at('/staff/students/5')
    const profile = await screen.findByTestId('staff-student-profile')
    for (const v of ['01711000001', '2012-03-04', 'Dhaka', 'A+', 'Islam', 'Karim']) expect(profile).toHaveTextContent(v)
    expect(screen.getByTestId('staff-student-enrollments')).toHaveTextContent('Class 8')
    expect(profile.querySelectorAll('button')).toHaveLength(0)   // no edit, delete, consent or enrollment actions
    expect(profile.textContent).not.toMatch(/fee|ফি/i)
  })

  it('the menu shows Students only when the selected department holds the key, in Bengali too', async () => {
    const paths = (keys) => buildNav('institution_staff', { modules: ['students', 'ai_assistant'], release: 'R3', staffKeys: keys }).map(i => i.path)
    expect(paths([])).not.toContain('/staff/students')
    expect(paths(['staff.student.index'])).toContain('/staff/students')
    await i18n.changeLanguage('bn')
    at('/staff/students')
    expect(screen.getByText('আগে একটি বিভাগ বাছুন')).toBeInTheDocument()
  })
})
