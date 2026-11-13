import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import Leads from '../pages/leads/Leads'
import { useAuthStore } from '../store/authStore'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const at = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const lead = { id: 3, name: 'Rafi', phone: '01711223344', guardian_name: 'Abdul', status: 'new', source: 'website', follow_up_date: '2030-01-05', interested_program_id: 1, program: 'Class 10', interested_batch_id: null }
const routes = (url) => Promise.resolve({ data: url === '/leads/referral-summary' ? { data: [], meta: { applications: 0, admitted: 0 } } : url === '/leads' ? { data: [lead, { ...lead, id: 4, name: 'Old', status: 'enrolled' }], meta: { total: 2, follow_up_today: 1 } }
  : { data: url === '/programs' ? [{ id: 1, name: 'Class 10' }] : [{ id: 5, name: 'A', program_id: 1 }, { id: 6, name: 'Other', program_id: 2 }] } })

// D202 PUB.1: the follow-up card, moving a lead along, adding one, and admitting it into a group of its program
describe('admission leads (D202 PUB.1)', () => {
  beforeEach(() => { for (const f of ['get', 'post', 'put', 'delete']) api[f].mockReset(); i18n.changeLanguage('en'); useAuthStore.setState({ role: 'admin' }); api.get.mockImplementation(routes);   /* D204 GAP.3: these are the admin's actions */ for (const f of ['post', 'put']) api[f].mockResolvedValue({ data: { data: {} } }) })

  it('shows the follow-up card and moves a lead along; an admitted lead has no actions', async () => {
    at(<Leads />)
    expect(await screen.findByTestId('leads-today')).toHaveTextContent('1 follow-up(s) are due today')
    expect(screen.getAllByTestId('lead')).toHaveLength(2)
    expect(screen.getAllByText('Admit')).toHaveLength(1)
    fireEvent.change(screen.getAllByLabelText('Status')[1], { target: { value: 'contacted' } })
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/leads/3', { status: 'contacted' }))
  })

  it('adds a lead and admits one into a group of its program', async () => {
    at(<Leads />)
    fireEvent.click(await screen.findByText('New application'))
    fireEvent.change(screen.getByLabelText("Applicant's name"), { target: { value: 'Mitu' } })
    fireEvent.change(screen.getByLabelText('Mobile'), { target: { value: '01811223344' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/leads', expect.objectContaining({ name: 'Mitu', phone: '01811223344', source: 'walk_in', interested_program_id: null })))
    fireEvent.click(await screen.findByText('Admit'))
    const admit = screen.getByTestId('lead-admit')
    expect(admit.querySelectorAll('option')).toHaveLength(2)                     // the placeholder and the one group of Class 10
    fireEvent.change(admit.querySelector('select'), { target: { value: '5' } })
    fireEvent.click(screen.getByText('Confirm admission'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/leads/3/convert', { batch_ids: [5] }))
  })
})
