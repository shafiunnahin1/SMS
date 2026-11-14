import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import { fmtHijri, hijriParts, occasionOn } from '../features/hijri/hijri'
import CalendarAdmin from '../pages/calendar/CalendarAdmin'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)

// D214 MAD.2: the Hijri date is computed for display, the offset shifts it, an occasion is only suggested
describe('hijri (D214 MAD.2)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {}, openConfirm: (c) => c.onConfirm() })
  })

  it('computes the date, the offset changes the display only', () => {
    expect(hijriParts('2026-03-20')).toEqual({ year: 1447, month: 10, day: 1 })
    expect(hijriParts('2026-03-20', -1)).toEqual({ year: 1447, month: 9, day: 30 })
    expect(fmtHijri('2026-03-20', 'en')).toBe('1 Shawwal 1447')
    expect(fmtHijri('2026-03-20', 'bn')).toMatch(/^1 .+ 1447$/)
    expect(occasionOn('2026-03-20')).toBe('fitr')
    expect(occasionOn('2026-03-21', -1)).toBe('fitr')
    expect(occasionOn('2026-03-22')).toBeNull()
  })

  it('shows the Hijri date in the holiday list and suggests an occasion without adding it', async () => {
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/settings/calendar' ? { secondary: 'hijri', hijri_offset: 0 } : [{ id: 4, title: 'Eid', date: '2026-03-20', type: 'public', description: null }] } }))
    wrap(<CalendarAdmin />)
    await waitFor(() => expect(screen.getByTestId('holiday-list')).toHaveTextContent(/\(1 .+ 1447\)/))   // the reader's language
    const form = screen.getByTestId('holiday-form')
    fireEvent.change(form.querySelector('[name=date]'), { target: { value: '2026-05-27' } })
    expect(await screen.findByTestId('occasion')).toHaveTextContent('This day may be: Eid-ul-Adha')
    expect(api.post).not.toHaveBeenCalled()
    fireEvent.click(form.querySelector('[data-action=use-occasion]'))
    expect(form.querySelector('[name=title]').value).toBe('Eid-ul-Adha')
    expect(api.post).not.toHaveBeenCalled()
  })

  it('shows nothing when the setting is off', async () => {
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/settings/calendar' ? { secondary: 'none', hijri_offset: 0 } : [{ id: 4, title: 'Eid', date: '2026-03-20', type: 'public', description: null }] } }))
    wrap(<CalendarAdmin />)
    await waitFor(() => expect(screen.getByTestId('holiday-list')).toHaveTextContent('Eid'))
    expect(screen.queryByTestId('hijri')).toBeNull()
  })
})
