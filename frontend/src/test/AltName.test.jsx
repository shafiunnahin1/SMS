import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import { useInstitutionStore } from '../store/institutionStore'
import { useAuthStore } from '../store/authStore'
import TeacherList from '../pages/admin/teachers/TeacherList'
import MadrasaSettings from '../pages/admin/MadrasaSettings'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)

// D214 MAD.3: the second-name field appears only while the institution chose a language for it, typed right-to-left for Arabic
describe('second-language names (D214 MAD.3)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {} })
    useAuthStore.setState({ user: { role: 'admin' } })
    useInstitutionStore.setState({ roles: ['teacher'] })
    api.post.mockResolvedValue({ data: { data: { id: 1 } } })
  })

  it('off: no field; on (Arabic): an rtl field that is sent', async () => {
    const general = (locale) => api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/admin/settings/general' ? { alt_name_locale: locale } : [], meta: { total: 0 } } }))
    general(null)
    const off = wrap(<TeacherList />)
    fireEvent.click(await screen.findByText('New teacher'))
    expect(document.querySelector('[name=name_alt]')).toBeNull()
    off.unmount()

    general('ar')
    wrap(<TeacherList />)
    fireEvent.click(await screen.findByText('New teacher'))
    await waitFor(() => expect(document.querySelector('[name=name_alt]')).not.toBeNull())
    const alt = document.querySelector('[name=name_alt]')
    expect(alt.getAttribute('dir')).toBe('rtl')
    expect(screen.getByLabelText('Name in Arabic')).toBe(alt)
    fireEvent.change(document.querySelector('[name=name]'), { target: { value: 'Rafiq' } })
    fireEvent.change(alt, { target: { value: 'رفيق' } })
    fireEvent.change(document.querySelector('[name=phone]'), { target: { value: '01811000001' } })
    fireEvent.click(document.querySelector('form [type=submit]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/teachers', expect.objectContaining({ name: 'Rafiq', name_alt: 'رفيق' })))
  })

  it('the admin chooses the language and the institution name', async () => {
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/admin/settings/general' ? { alt_name_locale: null, name_alt: null } : u === '/settings/calendar' ? { secondary: 'none', hijri_offset: 0 } : { enabled: false, pages_per_para: 20, stale_days: 7, show_parents: false } } }))
    api.put.mockResolvedValue({ data: { data: {} } })
    wrap(<MadrasaSettings />)
    const form = await screen.findByTestId('altname-settings')
    expect(form.querySelector('[name=name_alt]')).toBeNull()
    fireEvent.change(form.querySelector('[name=alt_name_locale]'), { target: { value: 'ar' } })
    fireEvent.change(form.querySelector('[name=name_alt]'), { target: { value: 'المدرسة' } })
    fireEvent.click(form.querySelector('[data-action=save-altname]'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/settings/general', { alt_name_locale: 'ar', name_alt: 'المدرسة' }))
  })
})
