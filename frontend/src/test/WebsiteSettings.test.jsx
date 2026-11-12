import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useInstitutionStore } from '../store/institutionStore'
import WebsiteSettings from '../pages/admin/settings/WebsiteSettings'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() }, bindAuthStore: () => {} }))

const data = { enabled: false, headline: 'Dhanmondi', tagline: '', about: 'A good school', show_programs: true, show_notices: true, admission_open: true, admission_message: '',
  contact: { phone: '', email: '', address: '', map_url: '', facebook_url: '', whatsapp: '' }, seo: { title: '', description: '' }, alert_sms: false, hero_url: null, site_url: 'https://dhanmondi.example.test' }
const at = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><WebsiteSettings /></MemoryRouter></QueryClientProvider>)

// D202 PUB.3: the admin's website screen - counts, the Google preview, saving (switching the site on updates the app at once),
// and the server's link error shown on its field.
describe('website settings (D202 PUB.3)', () => {
  beforeEach(() => {
    api.get.mockReset(); api.put.mockReset(); i18n.changeLanguage('en')
    api.get.mockResolvedValue({ data: { data } })
    useInstitutionStore.setState({ settings: { public_site: { enabled: false } } })
  })

  it('previews, saves and switches the site on', async () => {
    api.put.mockImplementation((url, body) => Promise.resolve({ data: { data: { ...data, ...body } } }))
    at()
    expect(await screen.findByText('9/150 characters')).toBeInTheDocument()
    expect(screen.getByTestId('seo-preview')).toHaveTextContent('Dhanmondi')
    expect(screen.getByTestId('seo-preview')).toHaveTextContent('A good school')
    fireEvent.click(screen.getByLabelText('Public website on'))
    fireEvent.change(screen.getByLabelText(/^Headline/), { target: { value: 'Admission 2031' } })
    expect(screen.getByTestId('seo-preview')).toHaveTextContent('Admission 2031')
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/settings/website', expect.objectContaining({ enabled: true, headline: 'Admission 2031', tagline: null })))
    await waitFor(() => expect(useInstitutionStore.getState().settings.public_site.enabled).toBe(true))
  })

  it('shows the server error on the link field', async () => {
    api.put.mockRejectedValue({ response: { data: { errors: { 'contact.map_url': ['The map link must start with https://'] } } } })
    at()
    fireEvent.change(await screen.findByLabelText('Map link'), { target: { value: 'http://x' } })
    fireEvent.click(screen.getByText('Save'))
    expect(await screen.findByText('The map link must start with https://')).toBeInTheDocument()
  })
})
