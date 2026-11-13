import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import MemoSettings from '../pages/admin/memo/MemoSettings'
import MemoRegister from '../pages/admin/memo/MemoRegister'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() }, bindAuthStore: () => {} }))
const at = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const settings = { ministry: '00', office: '00', geo: '0000', sub_institution: '000', branch: '000', subjects: { tc: '01', attestation: '02', testimonial: '03', certificate: '04', letter: '05', notice: '06' },
  example: '00.00.0000.000.000.01.0001.26.1', example_bn: '০০.০০.০০০০.০০০.০০০.০১.০০০১.২৬.১', date_line: '২৮ কার্তিক ১৪৩৩ বঙ্গাব্দ / ১৩ নভেম্বর ২০২৬ খ্রিস্টাব্দ', kinds: ['tc', 'attestation', 'testimonial', 'certificate', 'letter', 'notice'] }

// D210 MEMO.1: the codes form (digits only, sent as typed) with the example in Bangla digits; the register lists numbers and
// cancels one with a reason
describe('memo numbers (D210 MEMO.1)', () => {
  beforeEach(() => { for (const f of ['get', 'post', 'put']) api[f].mockReset(); i18n.changeLanguage('en') })

  it('saves the institution codes', async () => {
    api.get.mockResolvedValue({ data: { data: settings } })
    api.put.mockResolvedValue({ data: { data: settings } })
    at(<MemoSettings />)
    expect(await screen.findByTestId('memo-example')).toHaveTextContent('০০.০০.০০০০')
    const form = screen.getByTestId('memo-settings')
    fireEvent.change(form.querySelector('[name=ministry]'), { target: { value: '3a7' } })   // digits only
    fireEvent.change(form.querySelector('[name=geo]'), { target: { value: '2644' } })
    fireEvent.change(form.querySelector('[name="subject-tc"]'), { target: { value: '05' } })
    fireEvent.click(form.querySelector('[data-action=save]'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/settings/memo', expect.objectContaining({ ministry: '37', geo: '2644', subjects: expect.objectContaining({ tc: '05' }) })))
  })

  it('lists the register and cancels a number', async () => {
    api.get.mockResolvedValue({ data: { data: [{ id: 3, memo_no: '37.02.2644.000.001.05.0001.26.1', memo_no_bn: '৩৭.০২.২৬৪৪.০০০.০০১.০৫.০০০১.২৬.১', doc_kind: 'tc', recipient: 'Rafi', status: 'issued', issued_at: '2026-11-13T10:00:00+06:00', issued_by: 'Head' }], meta: { total: 1, current_page: 1, last_page: 1 } } })
    api.post.mockResolvedValue({ data: { data: { id: 3, status: 'cancelled' } } })
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('wrong name')
    at(<MemoRegister />)
    expect(await screen.findByText('৩৭.০২.২৬৪৪.০০০.০০১.০৫.০০০১.২৬.১')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Cancel'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/memo-register/3/cancel', { reason: 'wrong name' }))
    prompt.mockRestore()
  })
})
