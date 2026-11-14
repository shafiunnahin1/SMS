import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import QbStudy from '../pages/student/QbStudy'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)

// D218 (6) WAL.4: a paid item is refused by the order (410 use_wallet) and is then paid from the student's wallet - never bKash
describe('question-bank purchase from the wallet (D218)', () => {
  afterEach(() => vi.clearAllMocks())

  it('pays a paid pack from the wallet', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/student/qb/packs' ? [{ item_type: 'class_pack', item_id: 9, name_bn: 'নবম', name_en: 'Class 9', price: '500.00', owned_until: null }]
      : url === '/student/qb/curriculum' ? { subjects: [], my_class_level_id: 9 } : url === '/student/qb/validity' ? { expires_at: '2027-05-20T17:59:59Z', rule: 'exam_batch', days_left: 200 } : [] } }))
    api.post.mockImplementation((url) => url === '/student/qb/orders'
      ? Promise.reject({ response: { status: 410, data: { error: 'use_wallet' } } })
      : Promise.resolve({ data: { data: { paid: true, opened: 1, amount: '500.00', balance: '0.00' } } }))
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    wrap(<QbStudy />)
    const box = await screen.findByTestId('qb-packs')
    fireEvent.click(box.querySelector('[data-pack="class_pack"] [data-action="buy-pack"]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/student/qb/wallet-orders', { items: [{ item_type: 'class_pack', item_id: 9 }] }))
    expect(assign).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
