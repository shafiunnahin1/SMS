import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import { useStaffDepartmentStore } from '../store/staffDepartmentStore'
import Competitions from '../pages/event/Competitions'
import { ChildAwards } from '../pages/event/Awards'
import { StaffCompetitions } from '../pages/staff/StaffCampus'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const at = (path, el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>{el}</MemoryRouter></QueryClientProvider>)
const mine = { id: 7, name: 'Mine', student_id: '2501010001' }
const comp = { event: { id: 3, title: 'Race', type: 'sports', event_date: '2026-11-25', registration_required: true, started: true },
  registrations: [{ student: mine, status: 'attended' }, { student: { id: 8, name: 'Other', student_id: '2501010002' }, status: 'registered' }],
  results: [{ id: 21, student: mine, position: 1, award: 'Gold', points: 10, certificate_issued: false, remarks: null }] }
const data = (u) => u === '/events/competitions' ? [{ id: 3, title: 'Race', event_date: '2026-11-25', registration_required: true, registrations_count: 2, results_count: 1, started: true }]
  : u === '/events/3/competition' ? comp : u === '/events/points' ? { classes: [{ program: { id: 1, name: 'Class 10' }, points: 18, firsts: 2, results: 2 }] }
  : u === '/parent/children' ? [{ id: 7, name: 'Mine' }] : u === '/parent/children/7/awards' ? [{ id: 21, event: { id: 3, title: 'Race', event_date: '2026-11-25' }, position: 1, award: 'Gold', points: 10, certificate_issued: true }] : []

// D242 EVT.2: events of the month, attendance, results (add by ID, correct, remove), points per class; read-only staff; the parent's awards
describe('event competition screens (D242)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put', 'patch', 'delete']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {}, openConfirm: (c) => c.onConfirm() })
    useStaffDepartmentStore.getState().clear()
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: data(u) } }))
    for (const f of ['post', 'put', 'patch', 'delete']) api[f].mockResolvedValue({ data: { data: {} } })
    useAuthStore.setState({ user: { id: 1, role: 'admin' } })
  })

  it('marks attendance and adds, corrects and removes results', async () => {
    at('/admin/events', <Competitions />)
    fireEvent.click((await screen.findAllByTestId('event'))[0].querySelector('[data-action=open]'))
    const regs = await screen.findAllByTestId('registration')
    fireEvent.click(regs[1].querySelector('[data-action=absent]'))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/events/3/attendance/8', { status: 'absent' }))
    fireEvent.click(screen.getByTestId('attendance').querySelector('[data-action=all-attended]'))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/events/3/attendance', { status: 'attended' }))
    fireEvent.click(regs[0].querySelector('[data-action=pick]'))
    const form = screen.getByTestId('result-form')
    expect(form.querySelector('[name=student_code]').value).toBe('2501010001')
    fireEvent.change(form.querySelector('[name=position]'), { target: { value: '2' } })
    fireEvent.change(form.querySelector('[name=points]'), { target: { value: '6' } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/events/3/results', { student_code: '2501010001', position: '2', award: null, points: '6', remarks: null, certificate_issued: false }))
    const result = screen.getByTestId('result')
    fireEvent.click(result.querySelector('[data-action=edit]'))
    fireEvent.click(screen.getByTestId('result-form').querySelector('[name=certificate_issued]'))
    fireEvent.submit(screen.getByTestId('result-form'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/event-results/21', expect.objectContaining({ certificate_issued: true, position: 1 })))
    expect(api.put.mock.calls[0][1]).not.toHaveProperty('student_code')
    fireEvent.click(result.querySelector('[data-action=remove]'))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/event-results/21'))
  })

  it('shows the points table', async () => {
    at('/admin/events', <Competitions />)
    await screen.findAllByTestId('event')
    fireEvent.click(screen.getByRole('tab', { name: 'Points per class' }))
    expect(await screen.findByTestId('points-table')).toHaveTextContent('Class 10')
    expect(screen.getByTestId('points-table')).toHaveTextContent('18')
  })

  it('read-only staff change nothing', async () => {
    useAuthStore.setState({ user: { id: 60, role: 'institution_staff' } })
    useStaffDepartmentStore.getState().select({ id: 2, name: 'Sports' }, ['staff.event.read'])
    at('/staff/events', <StaffCompetitions />)
    fireEvent.click((await screen.findAllByTestId('event'))[0].querySelector('[data-action=open]'))
    await screen.findAllByTestId('registration')
    expect(screen.queryByTestId('result-form')).toBeNull()
    expect(document.querySelector('[data-action=absent], [data-action=edit], [data-action=remove]')).toBeNull()
  })

  it('the parent sees the child\'s awards', async () => {
    useAuthStore.setState({ user: { role: 'parent' } })
    at('/parent/child/awards', <ChildAwards />)
    const award = await screen.findByTestId('award')
    expect(award).toHaveTextContent('Position 1 · Gold')
    expect(award).toHaveTextContent('Certificate given')
  })
})
