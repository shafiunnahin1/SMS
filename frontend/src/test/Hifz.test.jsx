import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import Hifz from '../pages/hifz/Hifz'
import MadrasaSettings from '../pages/admin/MadrasaSettings'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const overview = { batch: { id: 3, name: 'A' }, stale_days: 7, students: [{ student: { id: 11, name: 'Rafi', student_id: 'S-1', roll: 1 }, pages: '85.0', paras: 4, percent: '14.17', stale: false, last_sabaq: '2026-11-10' },
  { student: { id: 12, name: 'Mim', student_id: 'S-2', roll: 2 }, pages: '0.0', paras: 0, percent: '0.00', stale: true, last_sabaq: null }] }
const progress = { student: { id: 11 }, progress: { pages: '85.0', paras: 4, percent: '14.17' }, timeline: [{ id: 5, record_date: '2026-11-10', kind: 'sabaq', from: [2, 1], to: [2, 20], pages: '5.0', quality: 4, mistakes: 1, remarks: null }] }

// D214 MAD.1: the teacher sees progress and who is behind, records a sabaq; the admin switches hifz on
describe('hifz (D214 MAD.1)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {}, openConfirm: (c) => c.onConfirm() })
  })

  it('shows progress, the behind mark and records a session', async () => {
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/batches' ? [{ id: 3, name: 'A', program: { name: 'Hifz' } }] : u.includes('/overview') ? overview : progress, meta: { total: 1 } } }))
    api.post.mockResolvedValue({ data: { data: {} } })
    wrap(<Hifz />)
    const pick = screen.getByTestId('hifz').querySelector('[name=batch]')
    await waitFor(() => expect(pick.querySelector('option[value="3"]')).not.toBeNull())
    fireEvent.change(pick, { target: { value: '3' } })
    const list = await screen.findByTestId('hifz-students')
    expect(list).toHaveTextContent('4 paras · 14.17%')
    expect(list).toHaveTextContent('behind (no new lesson in 7 days)')
    fireEvent.click(list.querySelector('[data-action=open]'))
    const form = await screen.findByTestId('hifz-form')
    for (const [k, v] of [['record_date', '2026-11-12'], ['from_surah', '2'], ['from_ayah', '21'], ['to_surah', '2'], ['to_ayah', '40'], ['pages', '6.5'], ['quality', '5']]) fireEvent.change(form.querySelector(`[name=${k}]`), { target: { value: v } })
    fireEvent.click(form.querySelector('[data-action=save]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/hifz/records', { student_id: 11, record_date: '2026-11-12', kind: 'sabaq', from_surah: 2, from_ayah: 21, to_surah: 2, to_ayah: 40, para_no: null, pages: 6.5, quality: 5, mistakes: null, remarks: null }))
    expect(await screen.findByTestId('hifz-timeline')).toHaveTextContent('4 paras complete · 14.17% · 85.0 pages of new lesson')
  })

  it('the admin switches hifz on', async () => {
    api.get.mockResolvedValue({ data: { data: { enabled: false, pages_per_para: 20, stale_days: 7, show_parents: false } } })
    api.put.mockResolvedValue({ data: { data: {} } })
    wrap(<MadrasaSettings />)
    const form = await screen.findByTestId('hifz-settings')
    fireEvent.click(form.querySelector('[name=enabled]'))
    fireEvent.change(form.querySelector('[name=pages_per_para]'), { target: { value: '15' } })
    fireEvent.click(form.querySelector('[data-action=save]'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/settings/hifz', { enabled: true, pages_per_para: 15, stale_days: 7, show_parents: false }))
  })
})
