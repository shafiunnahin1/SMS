import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import { useStaffDepartmentStore } from '../store/staffDepartmentStore'
import Meetings from '../pages/meeting/Meetings'
import ParentMeetings from '../pages/meeting/ParentMeetings'
import { StaffMeetings } from '../pages/staff/StaffCampus'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const at = (path, el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>{el}</MemoryRouter></QueryClientProvider>)
const meeting = (o) => ({ id: 5, subject: 'Math results', status: 'pending', requested_by: 'teacher', date: '2099-01-10', time: '15:30', location: 'School Office', notes: null,
  student: { id: 7, name: 'Rafi', student_id: '2501010001' }, teacher: { id: 9, name: 'Rahim' }, ...o })

// D235 MTG.2: a teacher requests a meeting by the student ID (no teacher pick), the admin picks the teacher, the parent confirms or asks
// for another time and asks a teacher of their child; read-only staff get no form or buttons
describe('parent meeting screens (D235)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put', 'patch', 'delete']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {}, openConfirm: (c) => c.onConfirm() })
    useStaffDepartmentStore.getState().clear()
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/meetings' || u === '/parent/meetings' ? [meeting({})] : u === '/teachers' ? [{ id: 9, name: 'Rahim' }]
      : u === '/parent/children' ? [{ id: 7, name: 'Rafi' }] : u === '/parent/children/7/teachers' ? [{ id: 9, name: 'Rahim' }] : [] } }))
    for (const f of ['post', 'put', 'patch']) api[f].mockResolvedValue({ data: { data: {} } })
  })

  it('a teacher requests a meeting by the student ID and cancels one', async () => {
    useAuthStore.setState({ user: { role: 'teacher' } })
    at('/teacher/meetings', <Meetings />)
    const form = await screen.findByTestId('meeting-form')
    expect(form.querySelector('[name=teacher_id]')).toBeNull()
    fireEvent.change(form.querySelector('[name=student_code]'), { target: { value: ' 2501010001 ' } })
    fireEvent.change(form.querySelector('[name=subject]'), { target: { value: 'Homework' } })
    fireEvent.change(form.querySelector('[name=proposed_date]'), { target: { value: '2099-02-01' } })
    fireEvent.change(form.querySelector('[name=proposed_time]'), { target: { value: '16:00' } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/meetings', { student_code: '2501010001', subject: 'Homework', proposed_date: '2099-02-01', proposed_time: '16:00', location: null, notes: null }))
    fireEvent.click((await screen.findByTestId('meeting')).querySelector('[data-action=cancel]'))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/meetings/5/cancel', {}))
  })

  it('the admin picks the teacher', async () => {
    useAuthStore.setState({ user: { role: 'admin' } })
    at('/admin/meetings', <Meetings />)
    const form = await screen.findByTestId('meeting-form')
    await waitFor(() => expect(form.querySelector('[name=teacher_id] option[value="9"]')).not.toBeNull())
  })

  it('the parent confirms, asks for another time and asks a teacher for a meeting', async () => {
    useAuthStore.setState({ user: { role: 'parent' } })
    vi.spyOn(window, 'prompt').mockReturnValue('After 5 pm')
    at('/parent/meetings', <ParentMeetings />)
    const card = await screen.findByTestId('meeting')
    fireEvent.click(card.querySelector('[data-action=confirm]'))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/parent/meetings/5/confirm'))
    fireEvent.click(card.querySelector('[data-action=another]'))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/parent/meetings/5/reschedule', { note: 'After 5 pm' }))
    const form = screen.getByTestId('ask-form')
    await waitFor(() => expect(form.querySelector('[name=teacher_id] option[value="9"]')).not.toBeNull())
    fireEvent.change(form.querySelector('[name=teacher_id]'), { target: { value: '9' } })
    fireEvent.change(form.querySelector('[name=subject]'), { target: { value: 'Reading' } })
    fireEvent.change(form.querySelector('[name=proposed_date]'), { target: { value: '2099-03-01' } })
    fireEvent.change(form.querySelector('[name=proposed_time]'), { target: { value: '10:00' } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/parent/meetings', { student_id: 7, teacher_id: 9, subject: 'Reading', proposed_date: '2099-03-01', proposed_time: '10:00', notes: null }))
  })

  it('read-only staff see the meetings without the form or buttons', async () => {
    useAuthStore.setState({ user: { role: 'institution_staff' } })
    useStaffDepartmentStore.getState().select({ id: 2, name: 'Desk' }, ['staff.meeting.read'])
    at('/staff/meetings', <StaffMeetings />)
    const card = await screen.findByTestId('meeting')
    expect(card.querySelector('[data-action=cancel]')).toBeNull()
    expect(screen.queryByTestId('meeting-form')).toBeNull()
  })
})
