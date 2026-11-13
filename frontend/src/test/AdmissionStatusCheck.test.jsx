import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useInstitutionStore } from '../store/institutionStore'
import AdmissionStatusCheck from '../pages/public/AdmissionStatusCheck'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() }, bindAuthStore: () => {} }))
const at = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><AdmissionStatusCheck /></MemoryRouter></QueryClientProvider>)

// D209 ACY.5: the published cycles with their public record, "check my result" by number + phone; nothing (and no request)
// where the institution does not use admission cycles
describe('public admission status (D209 ACY.5)', () => {
  beforeEach(() => { api.get.mockReset(); i18n.changeLanguage('en') })

  it('makes no request when the module is off', () => {
    useInstitutionStore.setState({ modules: ['public_site'] })
    const { container } = at()
    expect(api.get).not.toHaveBeenCalled()
    expect(container.textContent).toBe('')
  })

  it('lists cycles and checks a result by number and phone', async () => {
    useInstitutionStore.setState({ modules: ['public_site', 'admission_cycle'] })
    api.get.mockImplementation((u) => u === '/public/admission/cycles'
      ? Promise.resolve({ data: { data: [{ id: 7, name: 'Six 2031', program: 'Six', status: 'listing', apply_from: '2030-01-01', apply_until: '2030-12-31' }] } })
      : Promise.resolve({ data: { data: { application_no: 'A30-SSSSS', cycle: { id: 7, name: 'Six 2031', status: 'listing', test_date: null }, list_status: 'selected', test_roll: '0001', confirm_by: '2030-02-08', next_step: 'confirm' } } }))
    at()
    expect(await screen.findByText('Public record')).toHaveAttribute('href', '/admission?transparency=7')
    const form = screen.getByTestId('status-check')
    fireEvent.click(form.querySelector('[data-action="check"]'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter the application number')   // nothing sent without both
    fireEvent.change(form.querySelector('[name="application_no"]'), { target: { value: 'A30-SSSSS' } })
    fireEvent.change(form.querySelector('[name="phone"]'), { target: { value: '01711000701' } })
    fireEvent.click(form.querySelector('[data-action="check"]'))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/public/admission/status', { params: { application_no: 'A30-SSSSS', phone: '01711000701' } }))
    expect(await screen.findByTestId('status-result')).toHaveTextContent('You are selected!')
  })
})
