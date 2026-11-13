import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import AdmissionCycles from '../pages/admission/AdmissionCycles'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() }, bindAuthStore: () => {} }))
const at = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><AdmissionCycles /></MemoryRouter></QueryClientProvider>)
const cycle = (over = {}) => ({ id: 7, name: 'Class 6 2031', program: { id: 3, name: 'Six' }, seats: 5, apply_from: '2030-01-01', apply_until: '2030-12-31', test_date: null,
  application_fee: '0.00', status: 'draft', rule: { mode: 'lottery', waiting: 3, min_marks: null, confirm_within_days: 7, publish_names: false }, applications: 0, ...over })

// D209 ACY.1: create a cycle with its rule; opening a lottery cycle shows the seed once; each state offers only its next step
describe('admission cycles (D209 ACY.1)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ openConfirm: (c) => c.onConfirm() })
    useAuthStore.setState({ user: { role: 'admin' } })
  })

  it('creates a cycle with its rule', async () => {
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/programs' ? [{ id: 3, name: 'Six' }] : u === '/admission/fee-methods' ? { methods: ['cash'], online_available: false } : [] } }))
    api.post.mockResolvedValue({ data: { data: cycle() } })
    at()
    fireEvent.click(await screen.findByText('New admission cycle'))
    const form = screen.getByTestId('cycle-form')
    const field = (n, v) => fireEvent.change(form.querySelector(`[name="${n}"]`), { target: { value: v } })
    await waitFor(() => expect(form.querySelector('[name="program_id"] option[value="3"]')).not.toBeNull())
    field('name', 'Class 6 2031'); field('program_id', '3'); field('seats', '5'); field('apply_from', '2030-01-01'); field('apply_until', '2030-12-31'); field('mode', 'lottery'); field('waiting', '3')
    fireEvent.click(form.querySelector('[data-action="save"]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admission/cycles', expect.objectContaining({ name: 'Class 6 2031', program_id: 3, seats: 5,
      rule: { mode: 'lottery', waiting: 3, min_marks: null, confirm_within_days: 7, publish_names: false } })))
  })

  it('opens a lottery cycle and shows the seed once', async () => {
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/programs' ? [] : u === '/admission/fee-methods' ? { methods: ['cash'], online_available: false } : [cycle(), cycle({ id: 8, name: 'Frozen', status: 'testing' })] } }))
    api.post.mockResolvedValue({ data: { data: { ...cycle({ status: 'open' }), seed: 'ab'.repeat(32), draw: { seed_commitment: 'cd'.repeat(32) } } } })
    at()
    expect(await screen.findByText('Run the lottery')).toBeInTheDocument()   // ACY.3: the testing cycle offers its draw (was a hint in ACY.1)
    fireEvent.click(screen.getByText('Open applications'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admission/cycles/7/open'))
    expect(await screen.findByTestId('seed-value')).toHaveTextContent('ab'.repeat(32))
    expect(screen.queryByText('Close applications')).toBeNull()   // the testing cycle offers no button (the list comes next)
  })

  it('the accountant takes cash for an unpaid application and cannot set up cycles', async () => {
    useAuthStore.setState({ user: { role: 'accountant' } })
    const apps = { data: [{ id: 41, name: 'Rafi', phone: '01711000001', application_no: 'A30-AAAAA', paid: false, paid_amount: '0.00', test_roll: null },
      { id: 42, name: 'Mim', phone: '01711000002', application_no: 'A30-BBBBB', paid: true, paid_amount: '250.00', test_roll: null }], meta: { application_fee: '250.00', status: 'open', methods: ['cash'] } }
    api.get.mockImplementation((u) => Promise.resolve({ data: u.endsWith('/applications') ? apps : { data: [cycle({ status: 'open', application_fee: '250.00' })] } }))
    api.post.mockResolvedValue({ data: { data: { receipt_no: 'APP-2030-00001' } } })
    at()
    fireEvent.click(await screen.findByText('Applications'))
    expect(screen.queryByText('New admission cycle')).toBeNull()
    expect(screen.queryByText('Close applications')).toBeNull()
    const take = await screen.findAllByText('Take cash fee')
    expect(take).toHaveLength(1)                       // only the unpaid one
    expect(screen.queryByText('Reverse')).toBeNull()   // the admin's
    fireEvent.click(take[0])
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admission/leads/41/payments'))
  })

  it('the admin chooses the fee methods', async () => {
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/admission/fee-methods' ? { methods: ['cash'], online_available: false } : [] } }))
    api.put.mockResolvedValue({ data: { data: { methods: ['cash', 'online'], online_available: false } } })
    at()
    const online = await screen.findByText('Online', { exact: false })
    expect(screen.getByText('works once a payment gateway is set up', { exact: false })).toBeInTheDocument()
    fireEvent.click(online)
    fireEvent.click(screen.getAllByText('Save').at(-1))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admission/fee-methods', { methods: ['cash', 'online'] }))
  })
})
