import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import Letters from '../pages/documents/Letters'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() }, bindAuthStore: () => {} }))
const at = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Letters /></MemoryRouter></QueryClientProvider>)

// D210 LTR.1: write a letter (all three fields), the list shows the memo number in Bangla digits
describe('official letters (D210 LTR.1)', () => {
  beforeEach(() => { for (const f of ['get', 'post']) api[f].mockReset(); i18n.changeLanguage('en') })

  it('issues a letter and lists it', async () => {
    api.get.mockResolvedValue({ data: { data: [{ id: 1, memo_no_bn: '০০.০০.০০০০.০০০.০০০.০৫.০০০১.২৬.১', subject: 'Sports day', issued_date: '2026-11-13', status: 'issued' }], meta: {} } })
    api.post.mockResolvedValue({ data: { data: { memo_no_bn: '০০.০০.০০০০.০০০.০০০.০৫.০০০১.২৬.২' } } })
    at()
    expect(await screen.findByText('০০.০০.০০০০.০০০.০০০.০৫.০০০১.২৬.১')).toBeInTheDocument()
    const form = screen.getByTestId('letter-form')
    expect(form.querySelector('[data-action=issue]')).toBeDisabled()
    fireEvent.change(form.querySelector('[name=recipient]'), { target: { value: 'DEO, Dhaka' } })
    fireEvent.change(form.querySelector('[name=subject]'), { target: { value: 'Sports' } })
    fireEvent.change(form.querySelector('[name=body]'), { target: { value: 'Respectfully...' } })
    fireEvent.click(form.querySelector('[data-action=issue]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/letters', { recipient: 'DEO, Dhaka', subject: 'Sports', body: 'Respectfully...' }))
  })
})
