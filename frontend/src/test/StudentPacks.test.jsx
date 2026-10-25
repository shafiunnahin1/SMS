import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import QbStudy from '../pages/student/QbStudy'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))

const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const packs = [
  { item_type: 'class_pack', item_id: 9, name_bn: 'নবম শ্রেণি', name_en: 'Class 9', price: '500.00', owned_until: null },
  { item_type: 'subject_pack', item_id: 3, name_bn: 'গণিত', name_en: 'Maths', price: '150.00', owned_until: '2027-05-20T17:59:59Z' },
]

// D165 ST.3: the study page offers the whole class / subject / chapter packs; a bought one shows until when; buying sends only the item
describe('student packs (D165)', () => {
  afterEach(() => vi.clearAllMocks())

  it('offers packs and buys one with only its type and id', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/student/qb/packs' ? packs : url === '/student/qb/curriculum' ? { subjects: [], my_class_level_id: 9 }
      : url === '/student/qb/validity' ? { expires_at: '2027-05-20T17:59:59Z', rule: 'exam_batch', days_left: 200 } : [] } }))
    api.post.mockResolvedValue({ data: { data: { paid: true, opened: 1 } } })
    const { container } = wrap(<QbStudy />)
    const box = await screen.findByTestId('qb-packs')
    expect(box.querySelector('[data-pack="subject_pack"]').textContent).toMatch(/2027|২০২৭/)
    expect(box.querySelectorAll('[data-action="buy-pack"]').length).toBe(1)
    fireEvent.click(box.querySelector('[data-pack="class_pack"] [data-action="buy-pack"]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/student/qb/orders', { items: [{ item_type: 'class_pack', item_id: 9 }] }))
    expect(container.textContent).toMatch(/500/)
  })
})
