import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import Certificates from '../pages/documents/Certificates'
import VerifyDocument from '../pages/public/VerifyDocument'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el, path = '/') => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>{el}</MemoryRouter></QueryClientProvider>)

// D210 CERT.1: the attestation text is filled from the student's details and sent as edited; the public check shows the state and a
// masked name only
describe('certificates (D210 CERT.1)', () => {
  beforeEach(() => { for (const f of ['get', 'post']) api[f].mockReset(); i18n.changeLanguage('bn') })

  it('fills the attestation text and issues it', async () => {
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/certificates' ? [] : [{ id: 9, name: 'রাফি আলম', student_id: 'S-9', father_name: 'আলম', mother_name: 'রুমা', program: { name: 'দশম' } }], meta: {} } }))
    api.post.mockResolvedValue({ data: { data: { certificate_no: 'CERT-2026-0001' } } })
    wrap(<Certificates />)
    const form = await screen.findByTestId('cert-form')
    fireEvent.change(form.querySelector('[name=q]'), { target: { value: 'রাফি' } })
    fireEvent.click(await screen.findByText('রাফি আলম', { exact: false }))
    const text = form.querySelector('[name=description]').value
    expect(text).toContain('রাফি আলম, পিতা: আলম, মাতা: রুমা, অত্র প্রতিষ্ঠানের দশম-এর')
    fireEvent.click(form.querySelector('[data-action=issue]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/students/9/certificates', { type: 'attestation', title: 'প্রত্যয়নপত্র', description: text }))
  })

  it('shows the public check', async () => {
    api.get.mockResolvedValue({ data: { data: { status: 'revoked', revoked_on: '2026-11-13', kind: 'attestation', number: 'CERT-2026-0001', issued_date: '2026-11-13', holder: 'রা*** আ***' } } })
    wrap(<Routes><Route path="/verify/:code" element={<VerifyDocument />} /></Routes>, '/verify/ABCDEFGHJKMN')
    const r = await screen.findByTestId('verify-result')
    expect(r).toHaveTextContent('রা*** আ***')
    expect(r.querySelector('[data-status="verify_revoked"]')).not.toBeNull()
    expect(api.get).toHaveBeenCalledWith('/public/verify/ABCDEFGHJKMN')
  })
})
