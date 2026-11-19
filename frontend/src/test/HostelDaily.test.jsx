import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import { useStaffDepartmentStore } from '../store/staffDepartmentStore'
import { Mess, Meals, Bazar, Visitors, Attendance } from '../pages/hostel/HostelDaily'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const at = (path, el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>{el}</MemoryRouter></QueryClientProvider>)
const rafi = { id: 7, name: 'Rafi', student_id: '2501010001' }
const settings = { mess_mode: 'meal_rate', mess_monthly_fee: null, breakfast_rate: null, lunch_rate: null, dinner_rate: null, breakfast_weight: '0.50', lunch_weight: '1.00', dinner_weight: '1.00' }
const data = (u) => u.endsWith('/mess') ? { settings, month: '2026-10', members: 2, meals: { breakfast: 30, lunch: 29, dinner: 28, weighted: '72.00' }, bazar: '6000.00', rate_so_far: '83.33', closed: { at: '2026-11-01 09:00:00', by_job: false, meal_rate: '61.8557' }, can_close: false }
  : u.endsWith('/mess/bills') ? { month: '2026-10', mode: 'meal_rate', rows: [{ id: 3, kind: 'bill', meals: '72.00', amount: '4453.61', note: null, student: rafi }] }
  : u.endsWith('/meals') ? { date: '2026-11-05', closed: false, members: [{ student: rafi, off: ['dinner'] }] }
  : u.endsWith('/bazar') ? { month: '2026-11', total: '6000.00', rows: [{ id: 9, date: '2026-11-01', amount: '6000.00', note: 'Rice', reversal_of_id: null, reversed: false }] }
  : u.endsWith('/visitors') ? [{ id: 4, visitor_name: 'Abdul', relation: 'Father', phone: null, purpose: null, in_at: '2026-11-05 17:00', out_at: null, student: rafi }]
  : u.endsWith('/attendance') ? { date: '2026-11-05', taken: false, rows: [{ student: rafi, room_number: '101', status: 'present' }, { student: { id: 8, name: 'Tanim' }, room_number: '101', status: 'present' }] } : []

// D233 HST.5: the daily hostel parts - a closed month's bills with an adjustment, the meal-off sheet, the bazar book with a
// reversal, visitors with the out time, the night roll call (only non-present marks are sent), and read-only staff
describe('hostel daily screens (D233)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put', 'patch', 'delete']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {}, openConfirm: (c) => c.onConfirm() })
    useAuthStore.setState({ user: { role: 'admin' } })
    useStaffDepartmentStore.getState().clear()
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: data(u) } }))
    for (const f of ['post', 'put', 'patch', 'delete']) api[f].mockResolvedValue({ data: { data: {} } })
  })

  it('shows a closed meal-rate month with its bills and adjusts one', async () => {
    vi.spyOn(window, 'prompt').mockReturnValueOnce('-53.61').mockReturnValueOnce('Rounding')
    at('/admin/hostel', <Mess hostelId={1} />)
    expect(await screen.findByTestId('mess-closed')).toHaveTextContent('Closed (2026-11-01 09:00:00)')
    const bill = await screen.findByTestId('mess-bill')
    expect(bill).toHaveTextContent('72.00 meals')
    fireEvent.click(bill.querySelector('[data-action=adjust]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/hostel/mess-bills/3/adjust', { amount: '-53.61', note: 'Rounding' }))
    expect(screen.getByTestId('mess-settings').querySelector('[name=breakfast_weight]')).toHaveValue('0.50')
  })

  it('marks a meal off and another back on', async () => {
    at('/admin/hostel', <Meals hostelId={1} />)
    await screen.findByTestId('meal-row')
    fireEvent.click(screen.getByLabelText('Rafi Lunch'))
    fireEvent.click(screen.getByLabelText('Rafi Dinner'))
    fireEvent.click(screen.getByRole('button', { name: 'Save meals' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/hostel/1/meals', { date: expect.any(String), offs: [{ student_id: 7, meals: ['lunch'] }] }))
  })

  it('adds bazar and reverses an entry', async () => {
    at('/admin/hostel', <Bazar hostelId={1} />)
    const form = await screen.findByTestId('bazar-form')
    fireEvent.change(form.querySelector('[name=amount]'), { target: { value: '1200' } })
    fireEvent.change(form.querySelector('[name=note]'), { target: { value: 'Fish' } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/hostel/1/bazar', expect.objectContaining({ amount: '1200', note: 'Fish', method: 'cash' })))
    fireEvent.click((await screen.findByTestId('bazar-row')).querySelector('[data-action=reverse]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/hostel/bazar/9/reverse'))
  })

  it('adds a visitor by ID and marks one out', async () => {
    at('/admin/hostel', <Visitors hostelId={1} />)
    const form = await screen.findByTestId('visitor-form')
    fireEvent.change(form.querySelector('[name=student_code]'), { target: { value: ' 2501010001 ' } })
    fireEvent.change(form.querySelector('[name=visitor_name]'), { target: { value: 'Rahima' } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/hostel/1/visitors', expect.objectContaining({ student_code: '2501010001', visitor_name: 'Rahima', relation: null })))
    fireEvent.click((await screen.findByTestId('visitor')).querySelector('[data-action=visitor-out]'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/hostel/visitors/4', { out_at: null }))
  })

  it('submits the night roll call with only the non-present marks', async () => {
    at('/admin/hostel', <Attendance hostelId={1} />)
    const rows = await screen.findAllByTestId('attendance-row')
    fireEvent.click(rows[1].querySelector('[data-action=mark-absent]'))
    fireEvent.click(screen.getByRole('button', { name: 'Submit roll call' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/hostel/1/attendance', { date: expect.any(String), marks: [{ student_id: 8, status: 'absent' }] }))
  })

  it('read-only staff see the sheets without forms or buttons', async () => {
    useAuthStore.setState({ user: { role: 'institution_staff' } })
    useStaffDepartmentStore.getState().select({ id: 2, name: 'Desk' }, ['staff.hostel.read'])
    const { unmount } = at('/staff/hostel', <Bazar hostelId={1} />)
    expect(await screen.findByTestId('bazar-row')).toBeInTheDocument()
    expect(screen.queryByTestId('bazar-form')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reverse' })).toBeNull()
    unmount()
    at('/staff/hostel', <Attendance hostelId={1} />)
    await screen.findAllByTestId('attendance-row')
    expect(screen.queryByRole('button', { name: 'Submit roll call' })).toBeNull()
  })
})
