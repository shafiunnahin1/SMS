import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import StudentLeaves from '../pages/leave/StudentLeaves'
import ParentLeave from '../pages/parent/Leave'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const at = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const row = { id: 4, student_id: 1, student: 'Mine', from_date: '2026-11-08', to_date: '2026-11-09', total_days: 2, reason: 'Fever', status: 'pending', can_decide: true, attachment_url: null }

// D197 AAD.3: the staff approve (and see absences to correct); a long one is the admin's; the parent sends a request with a note
describe('student leave (D197 AAD.3)', () => {
  beforeEach(() => { for (const f of ['get', 'post', 'patch']) api[f].mockReset(); i18n.changeLanguage('en') })

  it('approves and lists absences already taken', async () => {
    api.get.mockResolvedValue({ data: { data: [row, { ...row, id: 5, total_days: 6, can_decide: false }] } })
    api.patch.mockResolvedValue({ data: { data: { ...row, status: 'approved', absent_to_correct: [{ attendance_id: 9, date: '2026-11-08' }] } } })
    at(<StudentLeaves />)
    expect(await screen.findByText("Leave this long is the admin's to approve")).toBeInTheDocument()
    fireEvent.click(screen.getByText('Approve'))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/leave-requests/students/4', { status: 'approved', note: null }))
    expect(await screen.findByTestId('leave-fix')).toHaveTextContent('2026-11-08')
  })

  it('the parent sends a request and sees the exam warning', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/parent/children' ? [{ id: 1, name: 'Mine' }] : [] } }))
    api.post.mockResolvedValue({ data: { message: 'Leave request sent.', data: { exam_clash: [{ exam: 'Half', subject: 'Bangla', date: '2026-11-10' }] } } })
    at(<ParentLeave />)
    fireEvent.change(await screen.findByLabelText('From'), { target: { value: '2026-11-09' } })
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-10' } })
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Fever' } })
    fireEvent.click(screen.getByText('Send request'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/parent/children/1/leave-requests', expect.any(FormData), expect.anything()))
    expect(api.post.mock.calls[0][1].get('reason')).toBe('Fever')
    expect(await screen.findByTestId('leave-clash')).toHaveTextContent('Half')
  })
})
