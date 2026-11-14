import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import SeatPlan from '../pages/calendar/SeatPlan'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const plan = { exam: { id: 5, name: 'Half yearly' }, students: 2, rooms: [{ name: '101', seats: [{ student_id: 11, code: 'S-1', name: 'Rafi', roll: 1, batch: 'A', seat_number: '1' }, { student_id: 12, code: 'S-2', name: 'Mim', roll: 2, batch: 'A', seat_number: '2' }] }] }

// D213 CAL.3: the admin picks an exam, gives two rooms, generates the plan and moves a student to another seat
describe('seat plan (D213 CAL.3)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {} })
  })

  it('generates and moves', async () => {
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/exams' ? [{ id: 5, name: 'Half yearly', program: { name: 'Class 10' } }] : plan, meta: { total: 1 } } }))
    api.post.mockResolvedValue({ data: { data: plan } })
    api.put.mockResolvedValue({ data: { data: plan } })
    wrap(<SeatPlan />)
    const pick = screen.getByTestId('seat-plan').querySelector('[name=exam]')
    await waitFor(() => expect(pick.querySelector('option[value="5"]')).not.toBeNull())
    fireEvent.change(pick, { target: { value: '5' } })
    const form = await screen.findByTestId('rooms-form')
    fireEvent.change(form.querySelector('[name=room-0]'), { target: { value: '101' } })
    fireEvent.change(form.querySelector('[name=capacity-0]'), { target: { value: '30' } })
    fireEvent.click(form.querySelector('[data-action=add-room]'))
    fireEvent.change(form.querySelector('[name=room-1]'), { target: { value: '102' } })
    fireEvent.change(form.querySelector('[name=capacity-1]'), { target: { value: '20' } })
    fireEvent.click(form.querySelector('[data-action=generate]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/exams/5/seat-plan/generate', { rooms: [{ name: '101', capacity: 30, columns: 5 }, { name: '102', capacity: 20, columns: 5 }] }))

    const list = await screen.findByTestId('plan')
    expect(list).toHaveTextContent('Rafi (S-1)')
    fireEvent.change(list.querySelector('[name=to-room-12]'), { target: { value: '101' } })
    fireEvent.change(list.querySelector('[name=to-seat-12]'), { target: { value: '9' } })
    fireEvent.click(list.querySelectorAll('[data-action=move]')[1])
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/exams/5/seat-plan/12', { room_name: '101', seat_number: '9' }))
  })
})
