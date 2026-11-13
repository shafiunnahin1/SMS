import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import AdmissionCycles from '../pages/admission/AdmissionCycles'
import AdmissionTransparency from '../pages/public/AdmissionTransparency'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const cycle = (over) => ({ id: 7, name: 'C', program: { id: 3, name: 'Six' }, seats: 2, apply_from: '2030-01-01', apply_until: '2030-12-31', test_date: null,
  application_fee: '0.00', status: 'testing', rule: { mode: 'lottery', waiting: 1, min_marks: null, confirm_within_days: 7, publish_names: false }, applications: 3, ...over })

// D209 ACY.3: the admin types the saved seed to run the lottery, builds a merit list; the public record shows the commitment,
// the seed after the draw, the list with numbers only and a weaker-guarantee warning when the seed was replaced
describe('admission lists (D209 ACY.3)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ openConfirm: (c) => c.onConfirm() })
    useAuthStore.setState({ user: { role: 'admin' } })
  })

  it('runs the lottery with the typed seed and builds a merit list', async () => {
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/admission/fee-methods' ? { methods: ['cash'], online_available: false } : u === '/programs' ? [] : [cycle(), cycle({ id: 8, rule: { mode: 'merit', waiting: 1 } })] } }))
    api.post.mockResolvedValue({ data: { data: {} } })
    wrap(<AdmissionCycles />)
    fireEvent.click(await screen.findByText('Run the lottery'))
    fireEvent.change(screen.getByTestId('lottery').querySelector('[name="seed"]'), { target: { value: '  ' + 'ab'.repeat(32) + ' ' } })
    fireEvent.click(screen.getByTestId('lottery').querySelector('[data-action="draw"]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admission/cycles/7/list/lottery', { seed: 'ab'.repeat(32) }))
    fireEvent.click(screen.getByText('Build the merit list'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admission/cycles/8/list/merit'))
  })

  it('shows the public record with numbers only and the weaker warning', async () => {
    api.get.mockResolvedValue({ data: { data: { cycle: { id: 7, name: 'Class 6', status: 'listing', mode: 'lottery' },
      draw: { seed_commitment: 'c'.repeat(64), applicants_hash: 'h'.repeat(64), applicants_count: 2, guarantee: 'weaker', seed: 'd'.repeat(64), order: ['A30-BBBBB', 'A30-AAAAA'] },
      applicants: ['A30-AAAAA', 'A30-BBBBB'], list: [{ rank: 1, application_no: 'A30-BBBBB', list_status: 'selected' }, { rank: 2, application_no: 'A30-AAAAA', list_status: 'waiting' }] } } })
    wrap(<AdmissionTransparency id={7} />)
    expect(await screen.findByTestId('public-seed')).toHaveTextContent('d'.repeat(64))
    expect(screen.getByTestId('weaker')).toBeInTheDocument()
    expect(screen.getByTestId('public-list')).toHaveTextContent('1. A30-BBBBB')
    expect(screen.getByText('Selected')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/public/admission/cycle/7/transparency')
  })
})
