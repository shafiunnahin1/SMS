import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useInstitutionStore } from '../store/institutionStore'
import AdminNotices from '../pages/notices/AdminNotices'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))

const at = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><AdminNotices /></MemoryRouter></QueryClientProvider>)

// D202 PUB.2: with the public website on, a notice can also be made public (with the "anyone can see it" warning); without it
// the switch is not there and nothing is sent.
describe('public switch on the notice form (D202 PUB.2)', () => {
  beforeEach(() => {
    api.get.mockReset(); api.post.mockReset(); i18n.changeLanguage('en')
    api.get.mockResolvedValue({ data: { data: [] } })
    api.post.mockResolvedValue({ data: { data: { id: 1 } } })
  })

  it('sends is_public when the website module is on', async () => {
    useInstitutionStore.setState({ modules: ['notices', 'public_site'] })
    at()
    fireEvent.click(await screen.findByText('New notice'))
    expect(screen.getByText('Anyone can see it')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Open day' } })
    fireEvent.change(screen.getByLabelText('Notice'), { target: { value: 'Friday' } })
    fireEvent.click(screen.getByLabelText('Public (show on website)'))
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/notices', expect.objectContaining({ title: 'Open day', is_public: true })))
  })

  it('has no public switch without the module', async () => {
    useInstitutionStore.setState({ modules: ['notices'] })
    at()
    fireEvent.click(await screen.findByText('New notice'))
    expect(screen.queryByText('Public (show on website)')).toBeNull()
  })
})
