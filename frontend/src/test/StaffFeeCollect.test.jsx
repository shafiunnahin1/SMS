import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useStaffDepartmentStore } from '../store/staffDepartmentStore'
import { StaffFeeCollect } from '../pages/staff/StaffStudents'
import { buildNav } from '../nav/menu'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() }, bindAuthStore: () => {} }))

const KEYS = ['staff.student.index', 'staff.fee.dues', 'staff.fee.collect', 'staff.fee.receipt']
const page = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <MemoryRouter><StaffFeeCollect /></MemoryRouter></QueryClientProvider>)

// D169 STW.4: the staff fee counter needs every key it uses in the selected department; it then finds a student, shows the
// server's dues and collects by naming dues only (never an amount); the menu item follows staff.fee.collect.
describe('staff fee collection (D169 STW.4)', () => {
  beforeEach(() => { vi.clearAllMocks(); useStaffDepartmentStore.getState().clear(); i18n.changeLanguage('en') })

  it('needs all four keys before any request', () => {
    useStaffDepartmentStore.getState().select({ id: 2, name: 'Cash counter' }, ['staff.fee.collect', 'staff.fee.dues'])
    page()
    expect(screen.getByText('This department does not allow this work')).toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
  })

  it('finds a student, shows the dues and collects by key only', async () => {
    useStaffDepartmentStore.getState().select({ id: 2, name: 'Cash counter' }, KEYS)
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/students'
      ? [{ id: 5, name: 'Rahim', student_id: 'C-1', batch: { name: 'Physics' } }]
      : { total: '1000.00', lines: [{ key: 'm-2026-10', label: 'October', amount: '1000.00' }] } } }))
    api.post.mockResolvedValue({ data: { data: { id: 9, receipt_no: 'R-1', total: '1000.00', lines: [] } } })
    page()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'C-1' } })
    fireEvent.click(await screen.findByRole('button', { name: /Rahim/ }))
    fireEvent.click(await screen.findByRole('checkbox'))
    expect(screen.getByTestId('dues-card')).toHaveTextContent('1,000')
    fireEvent.click(screen.getByTestId('collect'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/fees/collect', { student_id: 5, payment_method: 'cash', lines: [{ key: 'm-2026-10' }] }))
  })

  it('the menu shows fee collection only with staff.fee.collect', () => {
    const paths = (keys) => buildNav('institution_staff', { modules: ['fees', 'students'], release: 'R3', staffKeys: keys }).map(i => i.path)
    expect(paths(['staff.student.index'])).not.toContain('/staff/fees/collect')
    expect(paths(KEYS)).toContain('/staff/fees/collect')
  })
})
