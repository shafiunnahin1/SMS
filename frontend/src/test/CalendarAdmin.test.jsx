import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import CalendarAdmin from '../pages/calendar/CalendarAdmin'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)

// D213 CAL.1: the admin adds a holiday range, edits one, and makes an academic year current
describe('academic calendar admin (D213 CAL.1)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put', 'patch', 'delete']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ openConfirm: (c) => c.onConfirm(), addToast: () => {} })
  })

  it('adds a range and edits a holiday', async () => {
    api.get.mockResolvedValue({ data: { data: [{ id: 4, title: 'Victory Day', date: '2026-12-16', type: 'public', description: null }] } })
    api.post.mockResolvedValue({ data: { data: [] } })
    api.put.mockResolvedValue({ data: { data: {} } })
    wrap(<CalendarAdmin />)
    expect(await screen.findByTestId('holiday-list')).toHaveTextContent('Victory Day')
    const form = screen.getByTestId('holiday-form')
    fireEvent.change(form.querySelector('[name=title]'), { target: { value: 'Winter' } })
    fireEvent.change(form.querySelector('[name=date]'), { target: { value: '2026-12-24' } })
    fireEvent.change(form.querySelector('[name=end_date]'), { target: { value: '2026-12-26' } })
    fireEvent.click(form.querySelector('[data-action=save]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/holidays', { title: 'Winter', date: '2026-12-24', end_date: '2026-12-26', type: 'public', description: null }))

    fireEvent.click(screen.getByTestId('holiday-list').querySelector('[data-action=edit]'))
    expect(form.querySelector('[name=end_date]')).toBeNull()
    fireEvent.change(form.querySelector('[name=title]'), { target: { value: 'Great Victory Day' } })
    fireEvent.click(form.querySelector('[data-action=save]'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/holidays/4', { title: 'Great Victory Day', date: '2026-12-16', type: 'public', description: null }))
  })

  it('makes a year current', async () => {
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/academic-years'
      ? [{ id: 2, name: '2027', start_date: '2027-01-01', end_date: '2027-12-31', is_current: false }, { id: 1, name: '2026', start_date: '2026-01-01', end_date: '2026-12-31', is_current: true }] : [] } }))
    api.patch.mockResolvedValue({ data: { data: {} } })
    wrap(<CalendarAdmin />)
    fireEvent.click(await screen.findByRole('tab', { name: 'Academic years' }))
    const list = await screen.findByTestId('year-list')
    expect(list.querySelectorAll('[data-action=current]')).toHaveLength(1)
    fireEvent.click(list.querySelector('[data-action=current]'))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/academic-years/2/set-current'))
  })
})
