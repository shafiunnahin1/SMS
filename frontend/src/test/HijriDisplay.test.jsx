import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import HijriToday from '../features/hijri/HijriToday'
import NoticeBoard from '../pages/notices/NoticeBoard'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const notices = [{ id: 1, title: 'Eid holiday', body: 'Closed', published_at: '2026-03-20T04:00:00Z', read_at: null }]

// D214 MAD.2 (madrasa.md section 2): with the Hijri calendar on, the dashboard header shows today's Hijri date and notices show it
// beside their date; with it off nothing changes
describe('hijri on dashboards and notices (D214)', () => {
  beforeEach(() => { api.get.mockReset(); i18n.changeLanguage('en'); vi.useFakeTimers({ now: new Date('2026-03-20T06:00:00Z'), toFake: ['Date'] }) })
  afterEach(() => vi.useRealTimers())
  const setting = (secondary) => api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/settings/calendar' ? { secondary, hijri_offset: 0 } : notices } }))

  it('shows today and the notice dates in Hijri when on', async () => {
    setting('hijri')
    wrap(<><HijriToday /><NoticeBoard /></>)
    expect(await screen.findByTestId('hijri-today')).toHaveTextContent(/1 .+ 1447/)
    await waitFor(() => expect(screen.getAllByTestId('hijri').map(e => e.textContent).join()).toMatch(/1 .+ 1447/))
  })

  it('shows nothing when off', async () => {
    setting('none')
    wrap(<><HijriToday /><NoticeBoard /></>)
    await screen.findByText('Eid holiday')
    expect(screen.queryByTestId('hijri-today')).toBeNull()
    expect(screen.queryByTestId('hijri')).toBeNull()
  })
})
