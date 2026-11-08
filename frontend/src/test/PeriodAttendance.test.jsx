import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import MyPeriods from '../pages/attendance/MyPeriods'
import PeriodReport from '../pages/attendance/PeriodReport'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const at = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const today = { date: '2026-11-08', daily_from_periods: false, periods: [{ routine_id: 3, start_time: '09:00', end_time: '09:45', subject: 'Bangla', batch: 'A',
  students: [{ student_id: 1, name: 'Mine', roll_no: 1, status: null, on_leave: false }, { student_id: 2, name: 'Other', roll_no: 2, status: 'leave', on_leave: true }] }] }

// D197 AAD.4: a period's sheet defaults to present (leave for students on leave) and saves every row; the report table
describe('period attendance (D197 AAD.4)', () => {
  beforeEach(() => { for (const f of ['get', 'post']) api[f].mockReset(); i18n.changeLanguage('en') })

  it('marks and saves a period', async () => {
    api.get.mockResolvedValue({ data: { data: today } })
    api.post.mockResolvedValue({ data: { data: { saved: 2, derived: 0 } } })
    at(<MyPeriods />)
    fireEvent.click(await screen.findByTestId('period'))
    expect(screen.getByText(/on leave/)).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('radio', { name: 'Absent' })[0])
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/period-attendance', { routine_id: 3, date: '2026-11-08',
      records: [{ student_id: 1, status: 'absent' }, { student_id: 2, status: 'leave' }] }))
  })

  it('shows the subject report', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/batches' ? [{ id: 5, name: 'A', program_id: 1 }] : url === '/subjects' ? [{ id: 7, name: 'Bangla' }]
      : [{ student_id: 1, name: 'Mine', roll_no: 1, periods: 4, present: 3, absent: 1, leave: 0, percentage: 75 }] } }))
    at(<PeriodReport />)
    await screen.findByRole('option', { name: 'A' })
    const [b, sub] = screen.getAllByRole('combobox')
    fireEvent.change(b, { target: { value: '5' } })
    await screen.findByRole('option', { name: 'Bangla' })
    fireEvent.change(sub, { target: { value: '7' } })
    expect(await screen.findByTestId('period-report')).toHaveTextContent('75')
  })
})
