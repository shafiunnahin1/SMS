import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import InstitutionDetail from '../pages/super/InstitutionDetail'
import { takeCredentials, useOneTimePassword } from '../features/super/OneTimePassword'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }, bindAuthStore: () => {} }))

const base = { id: 4, name: 'Legacy', slug: 'legacy', host: 'legacy.test', institution_type: 'school', status: 'inactive', sms_balance: '0.00',
  students: 0, teachers: 0, admins: [], modules: [], sms: { balance: '0.00', universal_enabled: false, own_enabled: false, transactions: [] } }
const SHOWN_ONCE = 'sample-shown-once-42'

function page(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/super-admin/institutions/4']}><Routes>
    <Route path="/super-admin/institutions/:id" element={<InstitutionDetail />} /></Routes></MemoryRouter></QueryClientProvider>)
  return client
}

// D170: "activate directly" appears only for an eligible account; its one-time password is shown once, kept only in memory, never
// in the query cache, and gone after "done"; creating an institution hands the password over the same way.
describe('Super Admin direct activation (D170)', () => {
  beforeEach(() => { vi.clearAllMocks(); useOneTimePassword.getState().forget(); useUiStore.setState({ confirmModal: null }); i18n.changeLanguage('en') })

  it('offers the action only when eligible', async () => {
    api.get.mockResolvedValue({ data: { data: { ...base, status: 'active', direct_activation: { eligible: false, reason: 'already_active' } } } })
    page()
    expect(await screen.findByTestId('institution-detail')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Activate directly' })).toBeNull()
  })

  it('activates, shows the password once, keeps it out of the cache, and forgets it', async () => {
    api.get.mockResolvedValue({ data: { data: { ...base, direct_activation: { eligible: true, reason: null } } } })
    api.post.mockResolvedValue({ data: { data: { ...base, status: 'active', direct_activation: { eligible: false, reason: 'already_active' },
      credentials: { temporary_password: SHOWN_ONCE, must_change_password: true } } } })
    const client = page()
    fireEvent.click(await screen.findByRole('button', { name: 'Activate directly' }))
    await act(async () => { await useUiStore.getState().confirmModal.onConfirm() })
    expect(api.post).toHaveBeenCalledWith('/super/institutions/4/direct-activation')
    expect(await screen.findByTestId('one-time-password')).toHaveTextContent(SHOWN_ONCE)
    expect(JSON.stringify(client.getQueryData(['super', 'institution', '4']))).not.toContain(SHOWN_ONCE)
    expect(screen.queryByRole('button', { name: 'Activate directly' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'I have saved it' }))
    await waitFor(() => expect(screen.queryByTestId('one-time-password')).toBeNull())
    expect(useOneTimePassword.getState().password).toBeNull()
  })

  it('creation strips the password from the payload and shows it only for that institution, in Bengali too', async () => {
    const rest = takeCredentials({ ...base, id: 4, credentials: { temporary_password: SHOWN_ONCE, must_change_password: true } })
    expect(rest.credentials).toBeUndefined()
    await i18n.changeLanguage('bn')
    api.get.mockResolvedValue({ data: { data: { ...base, id: 4, status: 'active', direct_activation: { eligible: false, reason: 'already_active' } } } })
    page()
    expect(await screen.findByTestId('one-time-password')).toHaveTextContent('আর কখনো দেখানো হবে না')
    useOneTimePassword.getState().keep(9, SHOWN_ONCE)
    await waitFor(() => expect(screen.queryByTestId('one-time-password')).toBeNull())   // another institution's password never shows here
  })
})
