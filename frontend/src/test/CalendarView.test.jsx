import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import CalendarView from '../pages/calendar/CalendarView'
import EventsAdmin from '../pages/calendar/EventsAdmin'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const month = new Date().toISOString().slice(0, 7)
const cal = { month, holidays: [{ date: `${month}-21`, title: 'Martyrs Day', type: 'public' }], exams: [{ id: 3, name: 'Half yearly', program: 'Class 10', start_date: `${month}-10`, end_date: `${month}-12` }],
  events: [{ id: 9, title: 'Science fair', type: 'academic', date: `${month}-25`, start_time: '10:00', venue: null }], weekly_holidays: [5] }
const sports = { id: 7, title: 'Sports day', type: 'sports', event_date: '2030-12-10', start_time: null, venue: 'Field', registration_required: true, registration_deadline: '2030-12-01', registered: false, target_audience: 'students', program_ids: [], is_public: false, registrations_count: 0 }

// D213 CAL.2: a student sees the month (holiday, exam, event) and registers for an event; the admin adds an event with registration
describe('calendar (D213 CAL.2)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put', 'delete']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ openConfirm: (c) => c.onConfirm(), addToast: () => {} })
  })

  it('shows the month and registers a student', async () => {
    useAuthStore.setState({ user: { role: 'student' } })
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/calendar' ? cal : [sports] } }))
    api.post.mockResolvedValue({ data: {} })
    wrap(<CalendarView />)
    const list = await screen.findByTestId('month-list')
    expect(list).toHaveTextContent('Exam: Half yearly (Class 10)')
    expect(list).toHaveTextContent('Holiday: Martyrs Day')
    expect(list).toHaveTextContent('Event: Science fair')
    expect(screen.getByTestId('month-calendar').querySelector(`[data-date="${month}-21"]`)).toHaveTextContent('Martyrs Day')
    fireEvent.click((await screen.findByTestId('upcoming')).querySelector('[data-action=register]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/events/7/register'))
  })

  it('the admin adds an event that asks for registration', async () => {
    useAuthStore.setState({ user: { role: 'admin' } })
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/programs' ? [{ id: 1, name: 'Class 10' }] : [] } }))
    api.post.mockResolvedValue({ data: { data: {} } })
    wrap(<EventsAdmin />)
    const form = screen.getByTestId('event-form')
    fireEvent.change(form.querySelector('[name=title]'), { target: { value: 'Sports day' } })
    fireEvent.change(form.querySelector('[name=type]'), { target: { value: 'sports' } })
    fireEvent.change(form.querySelector('[name=event_date]'), { target: { value: '2030-12-10' } })
    fireEvent.change(form.querySelector('[name=target_audience]'), { target: { value: 'students' } })
    fireEvent.click(await screen.findByLabelText('Class 10'))
    fireEvent.click(form.querySelector('[name=registration_required]'))
    fireEvent.change(form.querySelector('[name=max_participants]'), { target: { value: '50' } })
    fireEvent.click(form.querySelector('[data-action=save-event]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/events', expect.objectContaining({ title: 'Sports day', type: 'sports', target_audience: 'students', program_ids: [1], registration_required: true, max_participants: 50, is_public: false })))
  })
})
