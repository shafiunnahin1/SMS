import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import { buildNav } from '../nav/menu'
import Dashboard from '../pages/common/Dashboard'

vi.mock('../api/axios', () => ({ default: { get: vi.fn() }, bindAuthStore: () => {} }))
const paths = (off) => buildNav('teacher', { modules: ['attendance', 'exams', 'notices', 'leads', 'hr_payroll'], release: 'R3', featuresOff: off })
  .flatMap(i => i.children ?? [i]).map(i => i.path)

// D205 PERM.2: a teacher's switched-off features leave the menu and the dashboard's links; the rest stays
describe('teacher feature switches on screen (D205 PERM.2)', () => {
  beforeEach(() => { api.get.mockReset(); i18n.changeLanguage('en') })
  afterEach(() => useAuthStore.setState({ role: null, user: null }))

  it('the menu drops exactly the switched-off features', () => {
    expect(paths([])).toEqual(expect.arrayContaining(['/teacher/attendance', '/teacher/marks', '/notices', '/teacher/referrals', '/teacher/salary', '/teacher/leave']))
    const off = paths(['attendance', 'notices', 'own_leave'])
    for (const p of ['/teacher/attendance', '/notices', '/teacher/leave']) expect(off).not.toContain(p)
    for (const p of ['/teacher/dashboard', '/teacher/marks', '/teacher/referrals', '/teacher/salary']) expect(off).toContain(p)
  })

  it('the dashboard shows no link into a switched-off feature', async () => {
    useAuthStore.setState({ role: 'teacher', user: { name: 'Karim', role: 'teacher' } })
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/teacher/features' ? { off: ['attendance', 'marks'] }
      : { batches: [{ id: 1, name: 'A', program: 'Class 6', attendance_taken: false, students: 10 }], marks_pending: [{ exam_id: 2, subject_id: 3, exam: 'Half-yearly', subject: 'Bangla' }] } } }))
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Dashboard /></MemoryRouter></QueryClientProvider>)
    expect(await screen.findByText('Half-yearly — Bangla')).toBeInTheDocument()
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/teacher/features'))
    expect(screen.getByText('Half-yearly — Bangla').closest('a')).toBeNull()
    expect(document.querySelector('a[href="/teacher/attendance"]')).toBeNull()
  })

  it('with nothing switched off the links appear once the list is known', async () => {
    useAuthStore.setState({ role: 'teacher', user: { name: 'Karim', role: 'teacher' } })
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/teacher/features' ? { off: [] }
      : { batches: [{ id: 1, name: 'A', program: 'Class 6', attendance_taken: false, students: 10 }], marks_pending: [{ exam_id: 2, subject_id: 3, exam: 'Half-yearly', subject: 'Bangla' }] } } }))
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Dashboard /></MemoryRouter></QueryClientProvider>)
    await waitFor(() => expect(document.querySelector('a[href="/teacher/marks/2/3"]')).not.toBeNull())
    expect(document.querySelector('a[href="/teacher/attendance"]')).not.toBeNull()
  })
})
