import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useInstitutionStore } from '../store/institutionStore'
import PublicAlumni from '../pages/public/PublicAlumni'

vi.mock('../api/axios', () => ({ default: { get: vi.fn() }, bindAuthStore: () => {} }))
const site = { name: 'Dhanmondi School', logo_url: null, settings: { contact: {} }, programs: [], notices: [] }
const at = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><PublicAlumni /></MemoryRouter></QueryClientProvider>)

// D243 ALM.2: the public alumni list shows what the server sends (name, year, profession, institution); switched off it says so
describe('public alumni page (D243)', () => {
  beforeEach(() => {
    api.get.mockReset(); i18n.changeLanguage('en')
    useInstitutionStore.setState({ modules: ['public_site', 'alumni'], settings: { public_site: { enabled: true } }, institution: { name: 'Dhanmondi School' } })
  })

  it('lists verified alumni', async () => {
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/public/site' ? site : [{ name: 'Rafi', graduation_year: 2025, current_profession: 'Engineer', current_institution: 'BUET' }] } }))
    at()
    expect(await screen.findByTestId('public-alumni')).toHaveTextContent('Rafi')
    expect(screen.getByTestId('public-alumni')).toHaveTextContent('Engineer · BUET')
  })

  it('says nothing is published while the directory is off (404)', async () => {
    api.get.mockImplementation((u) => (u === '/public/site' ? Promise.resolve({ data: { data: site } }) : Promise.reject({ response: { status: 404 } })))
    at()
    expect(await screen.findByText('No list has been published yet')).toBeInTheDocument()
  })
})
