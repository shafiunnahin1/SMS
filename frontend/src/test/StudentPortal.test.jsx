import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { StudentDashboard, StudentResults, StudentFees, StudentAttendance } from '../pages/student/Portal'

vi.mock('../api/axios', () => ({ default: { get: vi.fn() }, bindAuthStore: () => {} }))

const data = {
  '/student/dashboard': { id: 1, student_id: '2611080001', name: 'Mine', program: 'Class 10', batch: 'A', attendance: { month: '2026-11', days: 4, absent: 1, percentage: 75 }, dues: { count: 1, total: '500.00' }, latest_result: { exam: 'Half yearly', percentage: 80, gpa: null, is_pass: true } },
  '/student/results': { student: { id: 1 }, exams: [{ exam: { id: 9, name: 'Half yearly', academic_year: 2026 }, use_gpa: false, subjects: [{ subject_id: 3, subject: 'Bangla', marks_obtained: 80, full_marks: 100, grade: 'A+', is_absent: false }], total: { percentage: 80, gpa: null, is_pass: true } }] },
  '/student/fees': { lines: [{ key: 'k1', category: 'Tuition', period: '2026-11', amount: '500.00' }], total: '500.00', receipts: [{ receipt_no: 'RCP-2026-00001', paid_at: '2026-10-05T10:00:00+06:00', total: '500.00' }] },
  '/student/attendance': { student: { id: 1 }, percentage: 75, present: 3, absent: 1, late: 0, daily_records: [{ date: '2026-11-02', status: 'absent', batch_id: 2 }] },
}
const at = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)

// D195 STP.1: the student's own pages ask /student/* without any id (the server picks the student from the login)
describe('student portal (D195 STP.1)', () => {
  beforeEach(() => { api.get.mockReset(); i18n.changeLanguage('en'); api.get.mockImplementation((url) => Promise.resolve({ data: { data: data[url] } })) })

  it('shows the dashboard, results, fees and attendance of the signed-in student', async () => {
    at(<StudentDashboard />)
    expect(await screen.findByText('Latest result')).toBeInTheDocument()
    expect(screen.getByText(/Half yearly/)).toBeInTheDocument()
    at(<StudentResults />)
    expect(await screen.findByText('Bangla')).toBeInTheDocument()
    at(<StudentFees />)
    expect(await screen.findByText('RCP-2026-00001')).toBeInTheDocument()
    at(<StudentAttendance />)
    expect(await screen.findByTestId('student-attendance-days')).toBeInTheDocument()
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/student/attendance', { params: { month: expect.stringMatching(/^\d{4}-\d{2}$/) } }))
    for (const [url, opts] of api.get.mock.calls) {
      expect(url.startsWith('/student/')).toBe(true)
      expect(JSON.stringify(opts ?? {})).not.toMatch(/student_id/)
    }
  })
})
