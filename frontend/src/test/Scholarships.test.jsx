import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import { useStaffDepartmentStore } from '../store/staffDepartmentStore'
import Scholarships from '../pages/scholarship/Scholarships'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() }, bindAuthStore: () => {} }))
const at = (path, el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>{el}</MemoryRouter></QueryClientProvider>)
const half = { id: 3, name: 'Merit half-tuition', benefit: 'percentage', percentage: '50.00', amount: null, funded_by: 'School', academic_year: null, total_slots: 2, available_slots: 1, application_deadline: '2026-11-30', status: 'open', applications_count: 2, pending_count: 1 }
const grant = { ...half, id: 4, name: 'Book grant', benefit: 'amount', percentage: null, amount: '2500.00', total_slots: null, available_slots: null, application_deadline: null, status: 'closed' }
const app = (o) => ({ id: 11, status: 'pending', reason: 'Top of the class', gpa: '4.80', household_income: null, decided_by: null, student: { id: 7, name: 'Rafi', student_id: '2501010001' }, ...o })
const data = (u) => u === '/scholarships' ? [half, grant] : u === '/academic-years' ? [{ id: 1, name: '2026' }]
  : u === '/scholarships/3/applications' ? { scholarship: half, applications: [app({}), app({ id: 12, status: 'approved', student: { id: 8, name: 'Nila', student_id: '2501010002' } })] } : []

// D236 SCH.2: the list with benefit and slots, create with one benefit, close, decide once, revoke with a reason; read-only staff
describe('scholarship admin screen (D236)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'patch']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {}, openConfirm: (c) => c.onConfirm() })
    useStaffDepartmentStore.getState().clear()
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: data(u) } }))
    for (const f of ['post', 'patch']) api[f].mockResolvedValue({ data: { data: {} } })
    useAuthStore.setState({ user: { id: 1, role: 'admin' } })
  })

  it('lists, creates a percentage scholarship and closes one', async () => {
    at('/admin/scholarships', <Scholarships />)
    const rows = await screen.findAllByTestId('scholarship')
    expect(rows[0]).toHaveTextContent('50.00% off the monthly tuition')
    expect(rows[0]).toHaveTextContent('1/2 slots left')
    expect(rows[1]).toHaveTextContent('Grant')
    expect(rows[1].querySelector('[data-action=close]')).toBeNull()
    fireEvent.click(rows[0].querySelector('[data-action=close]'))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/scholarships/3/close'))
    const form = screen.getByTestId('scholarship-form')
    fireEvent.change(form.querySelector('[name=name]'), { target: { value: 'Need-based' } })
    fireEvent.change(form.querySelector('[name=value]'), { target: { value: '25' } })
    fireEvent.change(form.querySelector('[name=total_slots]'), { target: { value: '5' } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/scholarships', expect.objectContaining({ name: 'Need-based', percentage: '25', total_slots: '5', funded_by: null })))
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('amount')
  })

  it('approves a pending application and revokes an approval with a reason', async () => {
    at('/admin/scholarships', <Scholarships />)
    fireEvent.click((await screen.findAllByTestId('scholarship'))[0].querySelector('[data-action=applications]'))
    const apps = await screen.findAllByTestId('application')
    expect(apps[1].querySelector('[data-action=approve]')).toBeNull()
    fireEvent.click(apps[0].querySelector('[data-action=approve]'))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/scholarships/applications/11/award', { decision: 'approved' }))
    fireEvent.click(apps[1].querySelector('[data-action=revoke]'))
    const form = await screen.findByTestId('revoke-form')
    fireEvent.change(form.querySelector('[name=reason]'), { target: { value: 'Left the merit list' } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/scholarships/applications/12/revoke', { reason: 'Left the merit list' }))
  })

  it('read-only staff see the list and applications without buttons or the form', async () => {
    useAuthStore.setState({ user: { id: 60, role: 'institution_staff' } })
    useStaffDepartmentStore.getState().select({ id: 2, name: 'Office' }, ['staff.scholarship.read'])
    at('/staff/scholarships', <Scholarships />)
    const rows = await screen.findAllByTestId('scholarship')
    expect(screen.queryByTestId('scholarship-form')).toBeNull()
    expect(rows[0].querySelector('[data-action=close]')).toBeNull()
    fireEvent.click(rows[0].querySelector('[data-action=applications]'))
    await screen.findAllByTestId('application')
    expect(document.querySelector('[data-action=approve]')).toBeNull()
    expect(document.querySelector('[data-action=revoke]')).toBeNull()
  })
})
