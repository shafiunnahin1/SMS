import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import OnlineClasses from '../pages/online-class/OnlineClasses'
import MyOnlineClasses from '../pages/online-class/MyOnlineClasses'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const options = { programs: [{ id: 1, name: 'Class 8' }], batches: [{ id: 3, name: 'A', program_id: 1 }], subjects: [{ id: 7, name: 'Math', program_id: 1 }], teachers: [{ id: 9, name: 'Rahim' }] }
const cls = (o) => ({ id: 5, title: 'Fractions', program: { id: 1, name: 'Class 8' }, batch: { id: 3, name: 'A' }, subject: { id: 7, name: 'Math' }, teacher: { id: 9, name: 'Rahim' }, platform: 'google_meet',
  scheduled_at: '2026-11-21 18:00', ends_at: '2026-11-21 18:45', duration_minutes: 45, status: 'scheduled', recording_url: null, meeting_link: 'https://meet.google.com/abc', meeting_id: null, passcode: '1234', ...o })

// D231 OCL.2: schedule a class (a teacher as themselves, the admin picks the teacher), cancel, complete, and the family's Join / recording
describe('online class screens (D231)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put', 'patch', 'delete']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {}, openConfirm: (c) => c.onConfirm() })
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/online-classes/options' ? options : u === '/online-classes' ? [cls({}), cls({ id: 6, title: 'Decimals', status: 'ended' })] : [] } }))
    for (const f of ['post', 'put', 'patch', 'delete']) api[f].mockResolvedValue({ data: { data: {} } })
  })

  it('a teacher schedules a class for one batch without picking a teacher', async () => {
    useAuthStore.setState({ user: { role: 'teacher' } })
    wrap(<OnlineClasses />)
    const form = await screen.findByTestId('class-form')
    expect(form.querySelector('[name=teacher_id]')).toBeNull()
    await waitFor(() => expect(form.querySelector('[name=program_id] option[value="1"]')).not.toBeNull())
    fireEvent.change(form.querySelector('[name=title]'), { target: { value: 'Geometry' } })
    fireEvent.change(form.querySelector('[name=program_id]'), { target: { value: '1' } })
    fireEvent.change(form.querySelector('[name=batch_id]'), { target: { value: '3' } })
    fireEvent.change(form.querySelector('[name=date]'), { target: { value: '2026-11-25' } })
    fireEvent.change(form.querySelector('[name=time]'), { target: { value: '17:30' } })
    fireEvent.change(form.querySelector('[name=meeting_link]'), { target: { value: ' https://meet.google.com/xyz ' } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/online-classes', expect.objectContaining({ title: 'Geometry', program_id: 1, batch_id: 3, subject_id: null, scheduled_at: '2026-11-25 17:30', meeting_link: 'https://meet.google.com/xyz', duration_minutes: 60 })))
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('teacher_id')
  })

  it('the admin cancels one class and completes an ended one with a recording', async () => {
    useAuthStore.setState({ user: { role: 'admin' } })
    vi.spyOn(window, 'prompt').mockReturnValue('https://drive.example.test/rec')
    wrap(<OnlineClasses />)
    const rows = await screen.findAllByTestId('class-row')
    expect(screen.getByTestId('class-form').querySelector('[name=teacher_id]')).not.toBeNull()
    fireEvent.click(rows[0].querySelector('[data-action=cancel]'))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/online-classes/5'))
    fireEvent.click(rows[1].querySelector('[data-action=complete]'))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/online-classes/6/complete', { recording_url: 'https://drive.example.test/rec' }))
  })

  it('the student joins an upcoming class and sees the recording of a past one', async () => {
    useAuthStore.setState({ user: { role: 'student' } })
    api.get.mockResolvedValue({ data: { data: [cls({ status: 'live' }), cls({ id: 6, title: 'Decimals', status: 'completed', meeting_link: 'https://meet.google.com/old', recording_url: 'https://drive.example.test/rec' }), cls({ id: 7, title: 'Gone', status: 'cancelled', meeting_link: null, passcode: null })] } })
    wrap(<MyOnlineClasses />)
    const cards = await screen.findAllByTestId('online-class')
    const live = cards.find(c => c.dataset.status === 'live')
    expect(live.querySelector('[data-action=join]')).toHaveAttribute('href', 'https://meet.google.com/abc')
    expect(live).toHaveTextContent('1234')
    const done = cards.find(c => c.dataset.status === 'completed')
    expect(done.querySelector('[data-action=join]')).toBeNull()
    expect(done.querySelector('[data-action=recording]')).toHaveAttribute('href', 'https://drive.example.test/rec')
    expect(cards.find(c => c.dataset.status === 'cancelled').querySelector('a')).toBeNull()
  })
})
