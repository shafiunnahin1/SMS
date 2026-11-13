import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import PromotionTc from '../pages/documents/PromotionTc'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const at = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><PromotionTc /></MemoryRouter></QueryClientProvider>)
const batches = [{ id: 1, name: 'A', program: { name: 'Class 10' } }, { id: 2, name: 'A', program: { name: 'Class 11' } }]

// D210 PTC.1: promote the chosen students of a batch to another; issue a TC for a found student; the issued list shows the memo
// number in Bangla digits
describe('promotion and TC (D210 PTC.1)', () => {
  beforeEach(() => { for (const f of ['get', 'post']) api[f].mockReset(); i18n.changeLanguage('en') })

  it('promotes the chosen students', async () => {
    api.get.mockImplementation((u, o) => Promise.resolve({ data: { data: u === '/batches' ? batches : u === '/tc' ? [] : o?.params?.batch_id ? [{ id: 11, name: 'Rafi', student_id: 'S-1' }, { id: 12, name: 'Mim', student_id: 'S-2' }] : [], meta: {} } }))
    api.post.mockResolvedValue({ data: { data: { promoted: 1, skipped: [] } } })
    at()
    const from = await screen.findByLabelText('From batch', { exact: false })
    await waitFor(() => expect(from.querySelector('option[value="1"]')).not.toBeNull())
    fireEvent.change(from, { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('To batch', { exact: false }), { target: { value: '2' } })
    fireEvent.click(await screen.findByText('Rafi'))
    fireEvent.click(screen.getByText('Promote 1'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/students/promote', { student_ids: [11], to_batch_id: 2 }))
  })

  it('issues a TC and lists it with the Bangla memo number', async () => {
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/tc' ? [{ id: 5, tc_number: 'TC-2026-0001', memo_no_bn: '৩৭.০২.২৬৪৪.০০০.০০১.০৫.০০০১.২৬.১', student: { name: 'Other' }, revoked: false }] : u === '/students' ? [{ id: 13, name: 'Tanvir', student_id: 'S-3' }] : batches, meta: {} } }))
    api.post.mockResolvedValue({ data: { data: { tc_number: 'TC-2026-0002' } } })
    at()
    fireEvent.click(screen.getByText('Transfer certificate (TC)'))
    expect(await screen.findByText('৩৭.০২.২৬৪৪.০০০.০০১.০৫.০০০১.২৬.১')).toBeInTheDocument()
    fireEvent.change(screen.getByTestId('tc-form').querySelector('[name=q]'), { target: { value: 'Tan' } })
    fireEvent.click(await screen.findByText('Tanvir', { exact: false }))
    fireEvent.change(screen.getByTestId('tc-form').querySelector('[name=last_class]'), { target: { value: 'Ten' } })
    fireEvent.click(screen.getByText('Issue TC'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/students/13/tc', { last_class: 'Ten' }))
  })
})
