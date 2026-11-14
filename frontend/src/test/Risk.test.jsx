import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import Risk from '../pages/risk/Risk'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const flag = { id: 9, kind: 'combined', level: 'high', status: 'open', computed_on: '2026-11-14', note: null, batch: { id: 3, name: 'A' }, student: { id: 11, name: 'Rafi', student_id: 'S-1' },
  reasons: [{ kind: 'attendance', level: 'watch', details: { attendance_pct: 70, present: 21, working: 30, window_days: 30 } }, { kind: 'marks_drop', level: 'watch', details: { previous_avg: 72, latest: 50, drop: 22 } }] }
const limits = { window_days: 30, attendance_watch: 75, attendance_high: 60, consecutive_absent_high: 3, marks_drop_watch: 15, marks_drop_high: 25, dues_watch: 2, dues_high: 3, notify_parents: false }

// D216 RISK.2: the teacher sees why a student is flagged and marks it seen with a note; the admin changes a limit
describe('risk alerts (D216 RISK.2)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {} })
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/risk/settings' ? limits : [flag] } }))
    api.post.mockResolvedValue({ data: { data: {} } })
    api.put.mockResolvedValue({ data: { data: limits } })
  })

  it('a teacher sees the why and acknowledges with a note (no limits tab, no check-now)', async () => {
    useAuthStore.setState({ user: { role: 'teacher' } })
    wrap(<Risk />)
    const list = await screen.findByTestId('risk-list')
    expect(list).toHaveTextContent('Attendance: 70% present (21 of 30 days, last 30 days)')
    expect(list).toHaveTextContent('Marks: from 72% to 50% (down 22 points)')
    expect(screen.queryByText('Limits')).toBeNull()
    expect(document.querySelector('[data-action=evaluate]')).toBeNull()
    fireEvent.change(list.querySelector('[name=note-9]'), { target: { value: 'Called the guardian' } })
    fireEvent.click(list.querySelector('[data-action=acknowledge]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/risk/flags/9/acknowledge', { note: 'Called the guardian' }))
  })

  it('the admin changes a limit', async () => {
    useAuthStore.setState({ user: { role: 'admin' } })
    wrap(<Risk />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Limits' }))
    const form = await screen.findByTestId('risk-settings')
    fireEvent.change(form.querySelector('[name=attendance_watch]'), { target: { value: '80' } })
    fireEvent.click(form.querySelector('[name=notify_parents]'))
    fireEvent.click(form.querySelector('[data-action=save-risk]'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/risk/settings', { ...limits, attendance_watch: 80, notify_parents: true }))
  })
})
