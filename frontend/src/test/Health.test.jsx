import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import { useStaffDepartmentStore } from '../store/staffDepartmentStore'
import Health from '../pages/health/Health'
import TeacherHealth from '../pages/health/TeacherHealth'
import ChildHealth from '../pages/health/ChildHealth'
import { StaffHealth } from '../pages/staff/StaffCampus'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() }, bindAuthStore: () => {} }))
const at = (path, el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>{el}</MemoryRouter></QueryClientProvider>)
const rafi = { id: 7, name: 'Rafi', student_id: '2501010001' }
const record = { blood_group: 'B+', height_cm: '142.5', weight_kg: '38.0', vision_left: null, vision_right: null, medical_conditions: 'Peanut allergy', emergency_contact: 'Father', emergency_phone: '01700000000', doctor_name: null, doctor_phone: null, last_checkup_date: null, notes: null }
const data = (u) => u === '/health/reports' ? [{ id: 1, name: 'Class 8', students: 3, records: 2, batches: [{ id: 3, name: 'A' }, { id: 4, name: 'B' }] }]
  : u === '/health/reports/1' ? { students: 3, records: 2, missing: 1, blood_groups: { 'B+': 1, 'O+': 1 }, with_conditions: 1, no_blood_group: 1, rows: [{ ...rafi, has_record: true, blood_group: 'B+' }, { id: 8, name: 'Nila', student_id: '2501010003', has_record: false, blood_group: null }] }
  : u === '/students/7/health' ? { student: rafi, exists: true, updated_at: '2026-11-20 10:00', record }
  : u === '/health/my-students' ? [{ student: rafi, exists: true, batch: 'A', record: { blood_group: 'B+', medical_conditions: 'Peanut allergy', emergency_contact: 'Father', emergency_phone: '01700000000' } }]
  : u === '/parent/children' ? [{ id: 7, name: 'Rafi' }] : u === '/parent/children/7/health' ? { student: rafi, exists: true, updated_at: '2026-11-20 10:00', record } : []

// D235 HLT.2: a class's summary and students, one student's record saved by the admin, read-only staff, the teacher's emergency list,
// the parent's view
describe('health screens (D235)', () => {
  beforeEach(() => {
    api.get.mockReset(); api.put.mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {} })
    useStaffDepartmentStore.getState().clear()
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: data(u) } }))
    api.put.mockResolvedValue({ data: { data: {} } })
  })

  it('opens a class, a student, and saves the record', async () => {
    useAuthStore.setState({ user: { role: 'admin' } })
    at('/admin/health', <Health />)
    fireEvent.click(await screen.findByRole('button', { name: /Class 8/ }))
    expect(await screen.findByTestId('health-summary')).toHaveTextContent('No record1')
    const rows = await screen.findAllByTestId('health-student')
    expect(rows[1]).toHaveTextContent('No record')
    fireEvent.click(rows[0])
    const form = await screen.findByTestId('health-form')
    expect(form.querySelector('[name=medical_conditions]')).toHaveValue('Peanut allergy')
    fireEvent.change(form.querySelector('[name=weight_kg]'), { target: { value: '39' } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/students/7/health', expect.objectContaining({ weight_kg: '39', blood_group: 'B+', notes: null })))
  })

  it('read-only staff see the record without saving', async () => {
    useAuthStore.setState({ user: { role: 'institution_staff' } })
    useStaffDepartmentStore.getState().select({ id: 2, name: 'Clinic' }, ['staff.health.read'])
    at('/staff/health', <StaffHealth />)
    fireEvent.click(await screen.findByRole('button', { name: /Class 8/ }))
    fireEvent.click((await screen.findAllByTestId('health-student'))[0])
    const form = await screen.findByTestId('health-form')
    expect(form.querySelector('[name=weight_kg]')).toBeDisabled()
    expect(form.querySelector('[data-action=save-health]')).toBeNull()
  })

  it('the teacher sees the emergency list and the parent the record', async () => {
    useAuthStore.setState({ user: { role: 'teacher' } })
    const { unmount } = at('/teacher/health', <TeacherHealth />)
    const row = await screen.findByTestId('teacher-health-row')
    expect(row).toHaveTextContent('Peanut allergy')
    expect(row.querySelector('a[href="tel:01700000000"]')).not.toBeNull()
    unmount()
    useAuthStore.setState({ user: { role: 'parent' } })
    at('/parent/child/health', <ChildHealth />)
    expect(await screen.findByTestId('child-health-record')).toHaveTextContent('142.5')
  })
})
