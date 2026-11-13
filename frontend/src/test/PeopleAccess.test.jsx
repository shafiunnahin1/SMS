import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import PeopleAccess from '../pages/admin/access/PeopleAccess'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }, bindAuthStore: () => {} }))
const at = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><PeopleAccess /></MemoryRouter></QueryClientProvider>)
const teacher = { user_id: 11, name: 'Karim', role: 'teacher', is_active: true, teacher: { features: [], institution_off: ['notices'], overrides: { ai_assistant: 'blocked' }, off: ['ai_assistant', 'notices'] } }
const staff = { user_id: 21, name: 'Office', role: 'institution_staff', is_active: true,
  memberships: [{ id: 5, department_id: 3, department: 'Front office', status: 'active', duties: [{ id: 8, code: 'LEADS', name: 'Leads desk', permission_keys: ['staff.lead.read'] }] }] }
const routes = (url) => Promise.resolve({ data: url === '/admin/teacher-features' ? { data: { features: [], off: ['notices'] } }
  : url === '/teachers' ? { data: [{ id: 1, user_id: 11, name: 'Karim' }] } : url === '/admin/staff' ? { data: [{ id: 21, name: 'Office', is_active: true }] }
  : url === '/admin/users/11/access' ? { data: teacher } : url === '/admin/users/21/access' ? { data: staff }
  : url === '/admin/departments' ? { data: [{ id: 3, name: 'Front office', status: 'active' }, { id: 4, name: 'Accounts', status: 'active' }] }
  : url === '/admin/departments/3/duties' ? { data: [{ id: 8, name: 'Leads desk', status: 'active' }, { id: 9, name: 'Fee desk', status: 'active' }] } : { data: [] } })

// D205 PERM.3: the institution-wide teacher switches, one teacher's exceptions, one staff member's departments and duties
describe('access per person (D205 PERM.3)', () => {
  beforeEach(() => { for (const f of ['get', 'post', 'put', 'patch']) api[f].mockReset(); i18n.changeLanguage('en'); api.get.mockImplementation(routes); for (const f of ['post', 'put', 'patch']) api[f].mockResolvedValue({ data: { data: {} } }) })

  it('switches a feature off for every teacher', async () => {
    at()
    const box = await screen.findByLabelText('Attendance')
    expect(screen.getByLabelText('Notices')).not.toBeChecked()
    fireEvent.click(box)
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/teacher-features', { off: ['notices', 'attendance'] }))
  })

  it('sets and clears one teacher\'s exception', async () => {
    at()
    const who = await screen.findByLabelText('Teacher or staff member')
    await waitFor(() => expect(who.querySelectorAll('option')).toHaveLength(3))   // placeholder, Karim, Office
    fireEvent.change(who, { target: { value: '11' } })
    const row = await screen.findByTestId('access-feature-notices')
    expect(row).toHaveTextContent('Off now')
    fireEvent.change(screen.getByRole('combobox', { name: 'Notices' }), { target: { value: 'allowed' } })
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/users/11/teacher-features', { overrides: { notices: 'allowed' } }))
    fireEvent.change(screen.getByRole('combobox', { name: 'AI assistant' }), { target: { value: '' } })
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/users/11/teacher-features', { overrides: { ai_assistant: null } }))
  })

  it('gives and takes a staff member\'s duty and adds a department', async () => {
    at()
    const who = await screen.findByLabelText('Teacher or staff member')
    await waitFor(() => expect(who.querySelectorAll('option')).toHaveLength(3))   // placeholder, Karim, Office
    fireEvent.change(who, { target: { value: '21' } })
    expect(await screen.findByText('Leads desk')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Take duty away'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/department-memberships/5/duties', { duty_ids: [] }))
    await waitFor(() => expect(screen.getByLabelText('Give duty').querySelectorAll('option')).toHaveLength(2))   // placeholder + Fee desk
    fireEvent.change(screen.getByLabelText('Give duty'), { target: { value: '9' } })
    fireEvent.click(screen.getAllByText('Add')[0])
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/department-memberships/5/duties', { duty_ids: [8, 9] }))
    await waitFor(() => expect(screen.getByLabelText('Add to department').querySelectorAll('option')).toHaveLength(2))   // placeholder + Accounts
    fireEvent.change(screen.getByLabelText('Add to department'), { target: { value: '4' } })
    fireEvent.click(screen.getAllByText('Add')[1])
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/departments/4/members', { user_id: 21 }))
  })
})
