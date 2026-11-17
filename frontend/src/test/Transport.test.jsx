import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import Transport from '../pages/transport/Transport'
import MyTransport from '../pages/transport/MyTransport'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const van = { id: 2, name: 'Van 1', number_plate: 'DHA-11', capacity: 12, driver_name: 'Karim', driver_phone: '01811111111', helper_name: null, status: 'active' }
const route = { id: 5, name: 'Mirpur', vehicle: van, morning_departure: '07:00', afternoon_departure: null, monthly_fee: '800.00', riders: 1, stops: [{ id: 9, stop_name: 'Mirpur 10', pickup_time: '07:20', drop_time: null, sequence: 1 }] }
const rider = { id: 3, student: { id: 7, name: 'Rafi', student_id: '2501010001' }, stop: { id: 9, stop_name: 'Mirpur 10' }, direction: 'both', started_on: '2026-11-01' }

// D229 TRN.2: routes with stops and riders, putting a student on a route by the ID, vehicles, and the family's own bus
describe('transport screens (D229)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put', 'delete']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {}, openConfirm: (c) => c.onConfirm() })
    useAuthStore.setState({ user: { role: 'admin' } })
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/transport/routes' ? [route] : u === '/transport/vehicles' ? [van] : u === '/transport/routes/5/students' ? [rider] : [] } }))
    for (const f of ['post', 'put', 'delete']) api[f].mockResolvedValue({ data: { data: {} } })
  })

  it('opens a route, adds a stop, puts a student on it by ID and takes one off', async () => {
    wrap(<Transport />)
    expect(await screen.findByTestId('route')).toHaveTextContent('1/12 riding')
    fireEvent.click(screen.getByRole('button', { name: 'Mirpur' }))
    const detail = await screen.findByTestId('route-detail')
    expect(detail.querySelector('[data-testid=stop]')).toHaveTextContent('Mirpur 10')
    fireEvent.change(detail.querySelector('[data-testid=stop-form] [name=stop_name]'), { target: { value: 'Kazipara' } })
    fireEvent.submit(detail.querySelector('[data-testid=stop-form]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/transport/routes/5/stops', { stop_name: 'Kazipara', pickup_time: null, drop_time: null }))
    const form = detail.querySelector('[data-testid=assign-form]')
    fireEvent.change(form.querySelector('[name=student_code]'), { target: { value: ' 2501010002 ' } })
    fireEvent.change(form.querySelector('[name=stop_id]'), { target: { value: '9' } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/transport/assign', { route_id: 5, student_code: '2501010002', stop_id: 9, direction: 'both', started_on: null }))
    fireEvent.click((await screen.findByTestId('rider')).querySelector('[data-action=unassign]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/transport/students/7/unassign', {}))
  })

  it('adds a vehicle with the seats as a number', async () => {
    wrap(<Transport />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Vehicles' }))
    const form = await screen.findByTestId('vehicle-form')
    fireEvent.change(form.querySelector('[name=name]'), { target: { value: 'Bus 2' } })
    fireEvent.change(form.querySelector('[name=number_plate]'), { target: { value: 'DHA-22' } })
    fireEvent.change(form.querySelector('[name=capacity]'), { target: { value: '40' } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/transport/vehicles', expect.objectContaining({ name: 'Bus 2', capacity: 40, driver_name: null, status: 'active' })))
  })

  it('the parent sees the child\'s bus and can call the driver; nothing when not on a route', async () => {
    useAuthStore.setState({ user: { role: 'parent' } })
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/parent/children' ? [{ id: 7, name: 'Rafi' }] : { route: 'Mirpur', vehicle: 'Van 1', number_plate: 'DHA-11', driver_name: 'Karim', driver_phone: '01811111111', stop: 'Mirpur 10', pickup_time: '07:20:00', drop_time: null, direction: 'both', monthly_fee: '800.00' } } }))
    const { unmount } = wrap(<MyTransport />)
    const box = await screen.findByTestId('my-route')
    expect(box).toHaveTextContent('Karim')
    expect(box).toHaveTextContent('07:20')
    expect(box.querySelector('a[href="tel:01811111111"]')).not.toBeNull()
    expect(api.get).toHaveBeenCalledWith('/parent/children/7/transport')
    unmount()
    useAuthStore.setState({ user: { role: 'student' } })
    api.get.mockResolvedValue({ data: { data: null } })
    wrap(<MyTransport />)
    expect(await screen.findByText('Not on any route')).toBeInTheDocument()
  })
})
