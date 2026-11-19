import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import { useStaffDepartmentStore } from '../store/staffDepartmentStore'
import Hostel from '../pages/hostel/Hostel'
import MyHostel from '../pages/hostel/MyHostel'
import { StaffHostel } from '../pages/staff/StaffCampus'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const at = (path, el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>{el}</MemoryRouter></QueryClientProvider>)
const hostel = { id: 1, name: 'Shahjalal Hall', type: 'boys', total_rooms: 2, warden_name: 'Karim', warden_phone: '01811111111', seats: 3, occupied: 1 }
const room = { id: 4, hostel_id: 1, room_number: '101', floor: 1, capacity: 2, occupied: 1, monthly_fee: '1500.00' }
const alloc = { id: 9, status: 'active', check_in_date: '2026-11-01', check_out_date: null, student: { id: 7, name: 'Rafi', student_id: '2501010001' }, room: { id: 4, room_number: '101', floor: 1 }, hostel: { id: 1, name: 'Shahjalal Hall' } }

// D233 HST.2: allocate by the ID card number into a free room, check out, a hostel's rooms with seats, the family's own room,
// and read-only staff without forms
describe('hostel screens (D233)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put', 'patch', 'delete']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {}, openConfirm: (c) => c.onConfirm() })
    useAuthStore.setState({ user: { role: 'admin' } })
    useStaffDepartmentStore.getState().clear()
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/hostel' ? [hostel] : u === '/hostel/1/rooms' ? [room] : u === '/hostel/available-rooms' ? [{ ...room, hostel: { id: 1, name: 'Shahjalal Hall', type: 'boys' } }] : u === '/hostel/allocations' ? [alloc] : [] } }))
    for (const f of ['post', 'put', 'patch', 'delete']) api[f].mockResolvedValue({ data: { data: {} } })
  })

  it('allocates a student by ID into a free room and checks one out', async () => {
    at('/admin/hostel', <Hostel />)
    const form = await screen.findByTestId('allocate-form')
    await waitFor(() => expect(form.querySelector('[name=room_id] option[value="4"]')).not.toBeNull())
    expect(form.querySelector('[name=room_id] option[value="4"]')).toHaveTextContent('Room 101 (1)')
    fireEvent.change(form.querySelector('[name=student_code]'), { target: { value: ' 2501010002 ' } })
    fireEvent.change(form.querySelector('[name=room_id]'), { target: { value: '4' } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/hostel/allocate', { student_code: '2501010002', room_id: 4, check_in_date: null }))
    fireEvent.click((await screen.findByTestId('allocation')).querySelector('[data-action=checkout]'))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/hostel/allocations/9/checkout', {}))
  })

  it('opens a hostel\'s rooms with their seats and adds a room', async () => {
    at('/admin/hostel', <Hostel />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Hostels' }))
    expect(await screen.findByTestId('hostel-row')).toHaveTextContent('1/3 seats taken')
    fireEvent.click(screen.getByRole('button', { name: 'Shahjalal Hall' }))
    expect(await screen.findByTestId('room-row')).toHaveTextContent('1/2')
    const form = screen.getByTestId('room-form')
    fireEvent.change(form.querySelector('[name=room_number]'), { target: { value: '102' } })
    fireEvent.change(form.querySelector('[name=capacity]'), { target: { value: '3' } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/hostel/1/rooms', { room_number: '102', floor: 1, capacity: 3, monthly_fee: null }))
  })

  it('read-only staff see the stays without the allocate form or check-out', async () => {
    useAuthStore.setState({ user: { role: 'institution_staff' } })
    useStaffDepartmentStore.getState().select({ id: 2, name: 'Desk' }, ['staff.hostel.read'])
    at('/staff/hostel', <StaffHostel />)
    const row = await screen.findByTestId('allocation')
    expect(row.querySelector('[data-action=checkout]')).toBeNull()
    expect(screen.queryByTestId('allocate-form')).toBeNull()
  })

  it('the parent sees the child\'s room and can call the warden', async () => {
    useAuthStore.setState({ user: { role: 'parent' } })
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/parent/children' ? [{ id: 7, name: 'Rafi' }]
      : u.endsWith('/mess') ? { with_mess: true, current: { month: '2026-11', meals: { breakfast: 9, lunch: 10, dinner: 8 } }, bills: [{ month: '2026-10', meals: '84.00', amount: '4200.00', adjusted: true }] }
      : u.endsWith('/attendance') ? { month: '2026-11', counts: { present: 9, absent: 1, leave: 0 }, nights: [{ date: '2026-11-04', status: 'absent' }] }
      : u.endsWith('/visitors') ? [{ id: 1, visitor_name: 'Abdul', relation: 'Father', in_at: '2026-11-08 17:00', out_at: '2026-11-08 18:00' }]
      : { hostel: 'Shahjalal Hall', type: 'boys', room_number: '101', floor: 1, monthly_fee: '1500.00', check_in_date: '2026-11-01', warden_name: 'Karim', warden_phone: '01811111111' } } }))
    at('/parent/hostel', <MyHostel />)
    const box = await screen.findByTestId('my-room')
    expect(box).toHaveTextContent('Shahjalal Hall (Boys)')
    expect(box.querySelector('a[href="tel:01811111111"]')).not.toBeNull()
    expect(api.get).toHaveBeenCalledWith('/parent/children/7/hostel')
    expect(await screen.findByTestId('family-mess')).toHaveTextContent('breakfast 9')
    expect(screen.getByTestId('family-bill')).toHaveTextContent('Adjustment')
    expect(screen.getByTestId('family-nights')).toHaveTextContent('Absent 1')
    expect(await screen.findByTestId('family-visitors')).toHaveTextContent('Abdul (Father)')
  })
})
