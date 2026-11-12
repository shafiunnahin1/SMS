import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import i18n from '../i18n'
import api from '../api/axios'
import { useInstitutionStore } from '../store/institutionStore'
import { PublicRoot, PublicAdmission, PublicNotices } from '../pages/public/PublicSite'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() }, bindAuthStore: () => {} }))

const site = { name: 'Dhanmondi School', logo_url: null, settings: { headline: 'Admission 2031', tagline: '<b>Bold</b> future', about: 'First line.\n\nSecond paragraph.',
  hero_url: null, admission_open: true, admission_message: '', contact: { phone: '01700000001', whatsapp: '', email: '', address: 'Road 5', map_url: 'javascript:alert(1)', facebook_url: '' },
  show_programs: true, show_notices: true },
  programs: [{ id: 1, name: 'Class 6', public_description: 'Bangla medium', duration_months: null, course_fee: null }],
  notices: [{ id: 9, title: 'Open day', excerpt: 'Friday', published_at: '2030-03-01T10:00:00+06:00' }] }
const at = (path) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/" element={<PublicRoot />} /><Route path="/admission" element={<PublicAdmission />} /><Route path="/notices" element={<PublicNotices />} />
    <Route path="/login" element={<p>LOGIN PAGE</p>} /><Route path="/privacy" element={<p>privacy</p>} />
  </Routes></MemoryRouter></QueryClientProvider>)

// D202 PUB.3 (public-website.md "Tests" PublicSiteFrontendTest): the home lists programs and shows text as text; the admission form
// stops a bad phone and a missing consent before sending; with the site off `/` goes to /login; no public page uses raw HTML.
describe('public website (D202 PUB.3)', () => {
  beforeEach(() => {
    api.get.mockReset(); api.post.mockReset(); i18n.changeLanguage('en')
    api.get.mockImplementation((url) => Promise.resolve({ data: url === '/public/site' ? { data: site }
      : { data: [{ id: 9, title: 'Open day', content: 'Come on Friday', published_at: '2030-03-01T10:00:00+06:00' }], meta: { current_page: 1, last_page: 1, total: 1 } } }))
    useInstitutionStore.setState({ modules: ['public_site'], settings: { public_site: { enabled: true } }, institution: { name: 'Dhanmondi School' } })
  })

  it('shows the home with programs, notices and contact; institution text stays text; a non-https link is not a link', async () => {
    at('/')
    expect(await screen.findByText('Admission 2031')).toBeInTheDocument()
    expect(screen.getByText('<b>Bold</b> future')).toBeInTheDocument()
    expect(screen.getByText('Second paragraph.')).toBeInTheDocument()
    expect(screen.getByText('Class 6')).toBeInTheDocument()
    expect(screen.getByText('Bangla medium')).toBeInTheDocument()
    expect(screen.getByText('Open day')).toBeInTheDocument()
    expect(screen.getByText('01700000001').closest('a').getAttribute('href')).toBe('tel:01700000001')
    expect(screen.queryByText('See on map')).toBeNull()
  })

  it('sends a site that is off to the login page', async () => {
    useInstitutionStore.setState({ settings: { public_site: { enabled: false } } })
    at('/')
    expect(await screen.findByText('LOGIN PAGE')).toBeInTheDocument()
    expect(api.get).not.toHaveBeenCalled()
  })

  it('checks the phone and the consent before sending, then shows the thanks', async () => {
    api.post.mockResolvedValue({ data: { ok: true, message: 'We will call you' } })
    at('/admission')
    fireEvent.change(await screen.findByLabelText("Applicant's name *"), { target: { value: 'Rafi' } })
    fireEvent.change(screen.getByLabelText('Mobile *'), { target: { value: '12345' } })
    fireEvent.click(screen.getByText('Submit application'))
    expect(await screen.findByText('Enter a valid mobile number (01XXXXXXXXX)')).toBeInTheDocument()
    expect(screen.getByText('Please agree to submit the application')).toBeInTheDocument()
    expect(api.post).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Mobile *'), { target: { value: '01711223344' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByText('Submit application'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/public/admission', expect.objectContaining({ name: 'Rafi', phone: '01711223344', consent: true, website: '' })))
    expect(await screen.findByText('We will call you')).toBeInTheDocument()
  })

  it('shows "admission closed" instead of the form', async () => {
    api.get.mockResolvedValue({ data: { data: { ...site, settings: { ...site.settings, admission_open: false } } } })
    at('/admission')
    expect(await screen.findByText('Admission is closed at the moment.')).toBeInTheDocument()
    expect(screen.queryByText('Submit application')).toBeNull()
  })

  it('lists the public notices in full', async () => {
    at('/notices')
    expect(await screen.findByText('Come on Friday')).toBeInTheDocument()
  })

  it('no public page or website setting uses raw HTML', () => {
    const dir = join(__dirname, '../pages/public')
    for (const f of [...readdirSync(dir).map(n => join(dir, n)), join(__dirname, '../pages/admin/settings/WebsiteSettings.jsx')]) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/dangerouslySetInnerHTML|innerHTML/)
    }
  })
})
