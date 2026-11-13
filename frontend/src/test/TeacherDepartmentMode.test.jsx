import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import { useStaffDepartmentStore } from '../store/staffDepartmentStore'
import PeopleAccess from '../pages/admin/access/PeopleAccess'

vi.mock('../api/axios', async (orig) => {
  const real = (await orig()).default
  return { default: Object.assign(real, { get: vi.fn(), put: vi.fn(), post: vi.fn(), patch: vi.fn() }), bindAuthStore: (await orig()).bindAuthStore }
})
const header = () => api.interceptors.request.handlers.find(h => h)?.fulfilled({ headers: {} }).headers['X-Department-Id']

// D206 TDM.4: a teacher's request names the selected department only from the department pages (/staff/...), never from their own
// teacher pages; the admin's access screen shows a teacher's departments and duties under their switches
describe('teacher department mode on screen (D206 TDM.4)', () => {
  beforeEach(() => { api.get.mockReset(); i18n.changeLanguage('en'); useStaffDepartmentStore.getState().select({ id: 7, name: 'Office' }, ['staff.lead.read']) })
  afterEach(() => { useStaffDepartmentStore.getState().clear(); useAuthStore.setState({ role: null }); window.history.pushState({}, '', '/') })

  it('sends the department only from the department pages', () => {
    useAuthStore.setState({ role: 'teacher' })
    window.history.pushState({}, '', '/staff/leads')
    expect(header()).toBe('7')
    window.history.pushState({}, '', '/teacher/attendance')
    expect(header()).toBeUndefined()
    useAuthStore.setState({ role: 'institution_staff' })
    expect(header()).toBe('7')                                 // staff: always, as before
  })

  it('the access screen shows a teacher\'s departments under their switches', async () => {
    const teacher = { user_id: 11, name: 'Karim', role: 'teacher', is_active: true, teacher: { features: [], institution_off: [], overrides: {}, off: [] },
      memberships: [{ id: 5, department_id: 3, department: 'Front office', status: 'active', duties: [{ id: 8, code: 'LEADS', name: 'Leads desk', permission_keys: ['staff.lead.read'] }] }] }
    api.get.mockImplementation((url) => Promise.resolve({ data: url === '/admin/teacher-features' ? { data: { features: [], off: [] } }
      : url === '/teachers' ? { data: [{ id: 1, user_id: 11, name: 'Karim' }] } : url === '/admin/users/11/access' ? { data: teacher }
      : url === '/admin/departments' ? { data: [{ id: 3, name: 'Front office', status: 'active' }] } : { data: [] } }))
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><PeopleAccess /></MemoryRouter></QueryClientProvider>)
    const who = await screen.findByLabelText('Teacher or staff member')
    await waitFor(() => expect(who.querySelectorAll('option')).toHaveLength(2))
    fireEvent.change(who, { target: { value: '11' } })
    expect(await screen.findByTestId('access-teacher')).toBeInTheDocument()
    expect(screen.getByTestId('access-staff')).toHaveTextContent('Leads desk')
  })
})
