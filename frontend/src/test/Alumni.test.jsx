import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import { useStaffDepartmentStore } from '../store/staffDepartmentStore'
import Alumni from '../pages/alumni/Alumni'
import { StaffAlumni } from '../pages/staff/StaffCampus'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const at = (path, el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>{el}</MemoryRouter></QueryClientProvider>)
const rafi = { id: 1, student_id: 7, name: 'Rafi', graduation_year: 2025, last_class: 'Class 10', current_institution: 'BUET', current_profession: 'Student', email: 'r@example.test', phone: '01711111111', address: null, achievements: null, is_verified: false }
const data = (u) => u === '/alumni' ? [rafi] : u === '/alumni/candidates' ? [{ id: 8, name: 'Nila', student_id: '2501010002', last_class: 'Class 10', status: 'completed', graduation_year: 2026 }, { id: 9, name: 'Tara', student_id: '2501010003', last_class: 'Class 10', status: 'transferred', graduation_year: 2026 }]
  : u === '/alumni/stats' ? { total: 1, years: [{ year: 2025, total: 1, verified: 0 }] } : u === '/alumni/settings' ? { directory: false } : []

// D243 ALM.2: list, verify, delete; add from ended enrollments (many) and by hand; counts and the admin's directory switch; read-only staff
describe('alumni screen (D243)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put', 'patch', 'delete']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {}, openConfirm: (c) => c.onConfirm() })
    useStaffDepartmentStore.getState().clear()
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: data(u) } }))
    for (const f of ['post', 'put', 'patch', 'delete']) api[f].mockResolvedValue({ data: { data: {} } })
    useAuthStore.setState({ user: { id: 1, role: 'admin' } })
  })

  it('verifies and deletes from the list, adds from ended enrollments and by hand', async () => {
    at('/admin/alumni', <Alumni />)
    const row = await screen.findByTestId('alumnus')
    expect(row).toHaveTextContent('Not verified')
    fireEvent.click(row.querySelector('[data-action=verify]'))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/alumni/1/verify', { verified: true }))
    fireEvent.click(row.querySelector('[data-action=delete]'))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/alumni/1'))
    fireEvent.click(screen.getByRole('tab', { name: 'Add' }))
    await screen.findByTestId('candidates')
    fireEvent.click(document.querySelector('[data-candidate="9"]'))
    fireEvent.click(document.querySelector('[data-action=add-picked]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/alumni/from-students', { student_ids: [9] }))
    const form = screen.getByTestId('alumnus-form')
    fireEvent.change(form.querySelector('[name=name]'), { target: { value: 'Karim Old' } })
    fireEvent.change(form.querySelector('[name=graduation_year]'), { target: { value: '1998' } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/alumni', expect.objectContaining({ name: 'Karim Old', graduation_year: '1998', phone: null })))
  })

  it('shows the counts and the admin switches the public directory on', async () => {
    at('/admin/alumni', <Alumni />)
    await screen.findByTestId('alumnus')
    fireEvent.click(screen.getByRole('tab', { name: 'Counts' }))
    expect(await screen.findByTestId('alumni-total')).toHaveTextContent('1 alumni in all')
    const box = (await screen.findByTestId('directory-switch')).querySelector('[name=directory]')
    await waitFor(() => expect(box).not.toBeNull())
    fireEvent.click(box)
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/alumni/settings', { directory: true }))
  })

  it('read-only staff see the list and counts only', async () => {
    useAuthStore.setState({ user: { id: 60, role: 'institution_staff' } })
    useStaffDepartmentStore.getState().select({ id: 2, name: 'Office' }, ['staff.alumni.read'])
    at('/staff/alumni', <StaffAlumni />)
    await screen.findByTestId('alumnus')
    expect(document.querySelector('[data-action=verify], [data-action=delete], [data-action=edit]')).toBeNull()
    expect(screen.queryByRole('tab', { name: 'Add' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Counts' }))
    await screen.findByTestId('alumni-total')
    expect(screen.queryByTestId('directory-switch')).toBeNull()
  })
})
