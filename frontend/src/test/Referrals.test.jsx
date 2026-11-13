import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import MyReferrals from '../pages/leads/MyReferrals'
import Leads from '../pages/leads/Leads'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const at = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)

// D203 REF.1: a teacher / staff member refers an applicant and sees only their own referrals; the admin names, changes or clears a
// lead's referrer, filters by it, and reads the per-referrer summary.
describe('referrals (D203 REF.1)', () => {
  beforeEach(() => { for (const f of ['get', 'post', 'put', 'delete']) api[f].mockReset(); i18n.changeLanguage('en') })

  it('the teacher refers someone and sees their own list', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: url === '/referrals'
      ? { data: [{ id: 7, name: 'Rafi', program: 'Class 6', status: 'enrolled', created_at: '2030-05-10T10:00:00+06:00' }], meta: { total: 1, admitted: 1 } }
      : { data: [{ id: 1, name: 'Class 6' }] } }))
    api.post.mockResolvedValue({ data: { data: { id: 8 } } })
    at(<MyReferrals />)
    expect(await screen.findByText('1 applications in all, 1 admitted')).toBeInTheDocument()
    expect(screen.getByText('Rafi')).toBeInTheDocument()
    fireEvent.click(screen.getByText('New application'))
    fireEvent.change(screen.getByLabelText("Applicant's name"), { target: { value: 'Mitu' } })
    fireEvent.change(screen.getByLabelText('Mobile'), { target: { value: '123' } })
    fireEvent.click(screen.getByText('Submit application'))
    expect(await screen.findByText('Enter a valid mobile number (01XXXXXXXXX)')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Mobile'), { target: { value: '01811223344' } })
    fireEvent.click(screen.getByText('Submit application'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/referrals', expect.objectContaining({ name: 'Mitu', phone: '01811223344' })))
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('referred_by')
  })

  it('the admin sees the summary, filters by referrer and changes a referrer', async () => {
    useAuthStore.setState({ role: 'admin' })
    const lead = { id: 3, name: 'Web', phone: '01611223344', status: 'new', source: 'website', referred_by: null, referrer: null }
    api.get.mockImplementation((url, cfg) => Promise.resolve({ data:
      url === '/leads/referral-summary' ? { data: [{ user_id: 11, name: 'Karim', role: 'teacher', applications: 4, admitted: 2 }], meta: { applications: 4, admitted: 2 } }
      : url === '/leads' ? { data: cfg?.params?.referred_by ? [] : [lead], meta: { total: 1, follow_up_today: 0 } }
      : url === '/teachers' ? { data: [{ id: 1, user_id: 11, name: 'Karim', status: 'active' }] }
      : url === '/admin/staff' ? { data: [{ id: 21, name: 'Office', is_active: true }, { id: 22, name: 'Gone', is_active: false }] }
      : { data: [] } }))
    api.put.mockResolvedValue({ data: { data: {} } })
    at(<Leads />)
    expect(await screen.findAllByText('4 applications · 2 admitted')).toHaveLength(2)          // Karim's row and the total
    const pick = await screen.findAllByLabelText('Referrer')          // [0] the filter, [1] the lead card
    await waitFor(() => expect(pick[1].querySelectorAll('option')).toHaveLength(3))   // none, Karim, Office - never an inactive account
    fireEvent.change(pick[1], { target: { value: '21' } })
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/leads/3', { referred_by: 21 }))
    fireEvent.change(pick[0], { target: { value: '11' } })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/leads', { params: { referred_by: '11' } }))
    useAuthStore.setState({ role: null })
  })
})
