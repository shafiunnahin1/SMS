import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import DueBlockCard from '../features/fees/DueBlockCard'
import GeneralSettings from '../pages/admin/settings/GeneralSettings'
import { StudentResults } from '../pages/student/Portal'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const at = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const general = { fee_proration: 'none', use_gpa: true, student_portal: true, use_programs: true, fees: { block_admit_card: false, block_result: false, block_threshold: { mode: 'amount', value: '1000' }, block_message: null } }

// D197 AAD.1: the dues block settings are saved; a student's state and exemptions; the portal shows the reason instead of marks
describe('dues block (D197 AAD.1)', () => {
  beforeEach(() => { for (const f of ['get', 'post', 'put', 'delete']) api[f].mockReset(); i18n.changeLanguage('en') })

  it('saves the settings', async () => {
    api.get.mockResolvedValue({ data: { data: general } })
    api.put.mockResolvedValue({ data: { data: general } })
    at(<GeneralSettings />)
    fireEvent.click(await screen.findByLabelText('Hold back the admit card'))
    fireEvent.change(screen.getByLabelText('When'), { target: { value: 'any' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/settings/general', expect.objectContaining({ fees: { block_admit_card: true, block_result: false, block_threshold: { mode: 'any', value: null }, block_message: null } })))
  })

  it('shows a student and grants an exemption', async () => {
    api.get.mockResolvedValue({ data: { data: { blocked: { admit_card: true, result: false }, due_amount: '600.00', reason: 'Dues of Tk 600.00 are unpaid.', exemptions: [] } } })
    api.post.mockResolvedValue({ data: { data: {} } })
    at(<DueBlockCard studentId={5} />)
    expect(await screen.findByText('Dues of Tk 600.00 are unpaid.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Poor fund' } })
    fireEvent.click(screen.getByText('Exempt'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/students/5/due-block-exemptions', { scope: 'all', reason: 'Poor fund', expires_at: null }))
  })

  it('the portal shows the reason instead of marks', async () => {
    api.get.mockResolvedValue({ data: { data: { student: { id: 1 }, exams: [], blocked: { due_amount: '600.00', reason: 'Please pay Tk 600.00' } } } })
    at(<StudentResults />)
    expect(await screen.findByText('Please pay Tk 600.00')).toBeInTheDocument()
  })
})
