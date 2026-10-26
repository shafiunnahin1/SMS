import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import { useStaffDepartmentStore } from '../store/staffDepartmentStore'
import { StaffDepartmentBar, RequireDepartment } from '../features/staff/StaffDepartment'
import { MyDepartments } from '../pages/r3/Staff'
import { buildNav } from '../nav/menu'

vi.mock('../api/axios', async (orig) => {
  const real = (await orig()).default
  return { default: Object.assign(real, { get: vi.fn() }), bindAuthStore: (await orig()).bindAuthStore }
})

const wrap = (ui) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>)
const header = (role) => {
  useAuthStore.setState({ role })
  const run = api.interceptors.request.handlers.find(h => h)?.fulfilled
  return run({ headers: {} }).headers['X-Department-Id']
}

// D169 STW.1 (D91): the selected department lives in memory only, goes with every staff request as X-Department-Id (never for
// other roles), shows above staff pages, gates staff work pages and menu items by the keys held there, and is gone at logout.
describe('staff department context (D169 STW.1)', () => {
  beforeEach(() => { api.get.mockReset(); useStaffDepartmentStore.getState().clear(); i18n.changeLanguage('en') })

  it('sends X-Department-Id only for staff with a selected department', () => {
    expect(header('institution_staff')).toBeUndefined()
    useStaffDepartmentStore.getState().select({ id: 7, name: 'Office' }, [])
    expect(header('institution_staff')).toBe('7')
    expect(header('admin')).toBeUndefined()
    expect(header('teacher')).toBeUndefined()
  })

  it('opening a department selects it with its keys; a refused one is cleared', async () => {
    api.get.mockImplementation((url) => url === '/staff/departments'
      ? Promise.resolve({ data: { data: [{ id: 9, name: 'Office', code: 'OF' }, { id: 4, name: 'Store', code: 'ST' }] } })
      : url.endsWith('/9/portal') ? Promise.resolve({ data: { data: { id: 9, name: 'Office', code: 'OF' }, permissions: ['staff.student.index'] } })
        : Promise.reject(Object.assign(new Error('403'), { response: { status: 403 } })))
    wrap(<MyDepartments />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Open' }))[0])
    await waitFor(() => expect(useStaffDepartmentStore.getState().department).toEqual({ id: 9, name: 'Office' }))
    expect(useStaffDepartmentStore.getState().permissions).toEqual(['staff.student.index'])
    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[1])
    expect(await screen.findByText('This department is not available to you.')).toBeInTheDocument()
    expect(useStaffDepartmentStore.getState().department?.id).toBe(9)   // a refused department never replaces the working one
  })

  it('the bar and the page gate say what is missing, in English and Bengali', async () => {
    wrap(<><StaffDepartmentBar /><RequireDepartment permission="staff.student.index"><p>WORK</p></RequireDepartment></>)
    expect(screen.getByTestId('staff-department-bar')).toHaveTextContent('No department selected')
    expect(screen.getByText('Choose a department first')).toBeInTheDocument()
    expect(screen.queryByText('WORK')).toBeNull()
  })

  it('a department without the key shows no-permission; with it, the page', () => {
    useStaffDepartmentStore.getState().select({ id: 3, name: 'Accounts' }, ['staff.fee.collect'])
    const { unmount } = wrap(<RequireDepartment permission="staff.student.index"><p>WORK</p></RequireDepartment>)
    expect(screen.getByText('This department does not allow this work')).toBeInTheDocument()
    unmount()
    useStaffDepartmentStore.getState().select({ id: 3, name: 'Accounts' }, ['staff.student.index'])
    wrap(<><StaffDepartmentBar /><RequireDepartment permission="staff.student.index"><p>WORK</p></RequireDepartment></>)
    expect(screen.getByText('WORK')).toBeInTheDocument()
    expect(screen.getByTestId('staff-department-bar')).toHaveTextContent('Accounts')
  })

  it('logout forgets the department; staffKey menu items follow the keys', async () => {
    useStaffDepartmentStore.getState().select({ id: 3, name: 'Accounts' }, ['staff.fee.collect'])
    useAuthStore.getState().clearAuth()
    expect(useStaffDepartmentStore.getState().department).toBeNull()
    await i18n.changeLanguage('bn')
    wrap(<StaffDepartmentBar />)
    expect(screen.getByTestId('staff-department-bar')).toHaveTextContent('কোনো বিভাগ বাছাই হয়নি')
    const paths = (keys) => buildNav('institution_staff', { modules: ['ai_assistant'], release: 'R3', staffKeys: keys }).map(i => i.path)
    expect(paths([])).toContain('/staff/departments')
  })
})
