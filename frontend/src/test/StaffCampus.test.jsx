import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import { useStaffDepartmentStore } from '../store/staffDepartmentStore'
import { StaffOnlineClasses, StaffLibrary, StaffTransport } from '../pages/staff/StaffCampus'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const at = (path, el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>{el}</MemoryRouter></QueryClientProvider>)
const cls = { id: 5, title: 'Fractions', program: { id: 1, name: 'Class 8' }, batch: null, subject: null, teacher: { id: 9, name: 'Rahim' }, scheduled_at: '2026-11-21 18:00', duration_minutes: 45, status: 'scheduled', meeting_link: 'https://meet.example.test/a' }
const route = { id: 5, name: 'Mirpur', vehicle: null, monthly_fee: '800.00', riders: 0, stops: [] }

// D169 + D227/D229/D231 follow-up: a staff page asks for a department first (memory only, so a reload asks again), and without the
// manage / circulate key the forms and buttons are not shown (the server refuses them anyway)
describe('staff campus pages', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put', 'patch', 'delete']) api[f].mockReset()
    i18n.changeLanguage('en')
    useAuthStore.setState({ user: { role: 'institution_staff' } })
    useStaffDepartmentStore.getState().clear()
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/online-classes' ? [cls] : u === '/transport/routes' ? [route] : u === '/library/books' ? [] : u === '/online-classes/options' ? { programs: [], batches: [], subjects: [], teachers: [] } : [], meta: { categories: [] } } }))
  })

  it('asks for a department first instead of failing', () => {
    at('/staff/online-class', <StaffOnlineClasses />)
    expect(screen.getByText('Choose a department first')).toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
  })

  it('read-only staff see the classes but no form and no buttons', async () => {
    useStaffDepartmentStore.getState().select({ id: 2, name: 'Desk' }, ['staff.online_class.read'])
    at('/staff/online-class', <StaffOnlineClasses />)
    const row = await screen.findByTestId('class-row')
    expect(row.querySelector('[data-action=cancel]')).toBeNull()
    expect(screen.queryByTestId('class-form')).toBeNull()
  })

  it('staff with the manage key get the form and the buttons', async () => {
    useStaffDepartmentStore.getState().select({ id: 1, name: 'Campus' }, ['staff.online_class.read', 'staff.online_class.manage'])
    at('/staff/online-class', <StaffOnlineClasses />)
    expect((await screen.findByTestId('class-row')).querySelector('[data-action=cancel]')).not.toBeNull()
    expect(screen.getByTestId('class-form')).toBeInTheDocument()
  })

  it('library and transport follow their keys too', async () => {
    useStaffDepartmentStore.getState().select({ id: 2, name: 'Desk' }, ['staff.library.read', 'staff.transport.read'])
    const { unmount } = at('/staff/library', <StaffLibrary />)
    expect(await screen.findByRole('tab', { name: 'Books out' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Issue a book' })).toBeNull()
    expect(screen.queryByTestId('book-form')).toBeNull()
    unmount()
    at('/staff/transport', <StaffTransport />)
    expect((await screen.findByTestId('route')).querySelector('[data-action=remove]')).toBeNull()
    expect(screen.queryByTestId('route-form')).toBeNull()
  })

  it('a key the department lacks stops the page', () => {
    useStaffDepartmentStore.getState().select({ id: 3, name: 'Other' }, ['staff.lead.create'])
    at('/staff/transport', <StaffTransport />)
    expect(api.get).not.toHaveBeenCalled()
  })
})
