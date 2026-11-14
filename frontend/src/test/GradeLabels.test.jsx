import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import MadrasaSettings from '../pages/admin/MadrasaSettings'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const labelled = { preset: 'labelled', incomplete: true, rows: [{ grade: 'MUM', min: null, label: { bn: 'মুমতাজ', en: 'Mumtaz' } }, { grade: 'MAQ', min: null, label: { bn: 'মাকবুল', en: 'Maqbul' } }, { grade: 'F', min: 0, label: { bn: 'রাসিব', en: 'Rasib' } }] }
const serve = (grading) => api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/admin/settings/general' ? { alt_name_locale: null, name_alt: null, grading }
  : u === '/settings/calendar' ? { secondary: 'none', hijri_offset: 0 } : { enabled: false, pages_per_para: 20, stale_days: 7, show_parents: false } } }))

// D214 MAD.4: the admin picks the madrasa grade names, sees the "ranges are empty" stop and fills the ranges
describe('grade labels (D214 MAD.4)', () => {
  beforeEach(() => {
    for (const f of ['get', 'put']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {} })
    api.put.mockResolvedValue({ data: { data: {} } })
  })

  it('switches to the labelled preset', async () => {
    serve({ preset: 'bd_gpa', incomplete: false, rows: [{ grade: 'A+', min: 80, label: null }] })
    wrap(<MadrasaSettings />)
    const form = await screen.findByTestId('grading-settings')
    fireEvent.change(form.querySelector('[name=preset]'), { target: { value: 'labelled' } })
    fireEvent.click(form.querySelector('[data-action=save-grading]'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/settings/general', { grading: { preset: 'labelled', rows: [] } }))
  })

  it('shows the stop and saves the ranges (the fail row has none)', async () => {
    serve(labelled)
    wrap(<MadrasaSettings />)
    const form = await screen.findByTestId('grading-settings')
    expect(screen.getByTestId('grading-incomplete')).toBeInTheDocument()
    expect(form.querySelector('[name=min-F]')).toBeNull()
    fireEvent.change(form.querySelector('[name=min-MUM]'), { target: { value: '80' } })
    fireEvent.change(form.querySelector('[name=min-MAQ]'), { target: { value: '33' } })
    fireEvent.click(form.querySelector('[data-action=save-grading]'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/settings/general', { grading: { preset: 'labelled', rows: [
      { grade: 'MUM', min: 80, label: expect.any(Object) }, { grade: 'MAQ', min: 33, label: expect.any(Object) }] } }))
  })
})
