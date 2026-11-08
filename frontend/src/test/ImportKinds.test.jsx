import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import Imports from '../pages/admin/settings/Imports'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() }, bindAuthStore: () => {} }))

const job = { id: 9, kind: 'fee_history', status: 'uploaded', mapping: {}, summary: { headers: ['Student', 'Fee', 'Amount', 'Date', 'Receipt'], total: 2 }, rows: [] }
const at = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Imports /></MemoryRouter></QueryClientProvider>)

// D193 MIG.1: the wizard asks what to import, offers that kind's template, warns that money / results stay after a rollback, and
// maps the kind's own fields
describe('import kinds (D193 MIG.1)', () => {
  beforeEach(() => {
    api.get.mockReset(); api.post.mockReset(); i18n.changeLanguage('en')
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/imports' ? [{ ...job, created_at: null }] : job } }))
  })

  it('chooses a kind: its template link, the D32 note, the kind in the history', async () => {
    at()
    const kind = await screen.findByLabelText('What to import')
    fireEvent.change(kind, { target: { value: 'fee_history' } })
    expect(screen.getByText(/never removes imported fee receipts or results/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /template|Template/i }).getAttribute('href')).toBe('/api/v1/imports/templates/fee_history.xlsx')
    expect(screen.getAllByText('Old fee receipts', { selector: 'td, span, div' }).length).toBeGreaterThan(0)
  })

  it('maps the fields of the job kind', async () => {
    at()
    fireEvent.click((await screen.findAllByText('Old fee receipts', { selector: 'td, span, div' }))[0])
    expect(await screen.findByLabelText('Old receipt no. *')).toBeInTheDocument()
    expect(screen.getByLabelText('For month (YYYY-MM)')).toBeInTheDocument()
    expect(screen.queryByLabelText('Guardian phone *')).toBeNull()
  })
})
