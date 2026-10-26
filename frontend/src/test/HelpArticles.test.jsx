import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import HelpArticles from '../pages/ai/HelpArticles'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))

const page = (mode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <MemoryRouter><HelpArticles mode={mode} /></MemoryRouter></QueryClientProvider>)

const art = (over = {}) => ({ id: 1, slug: 'admit-student', locale: 'bn', title: 'ভর্তি', keywords: 'ভর্তি', roles: ['admin'], module: 'students', status: 'draft', live: true,
  body: { purpose: 'উদ্দেশ্য', where: 'মেনু', steps: ['এক', 'দুই'], result: 'ফল', errors: [], limits: 'সীমা' }, preview: 'PREVIEW-TEXT', ...over })

// D166 AI-Q4 part 2: the Super Admin approves platform articles and asks the guide; the head writes the institution's own wording
describe('help guide approval pages (D166)', () => {
  afterEach(() => vi.clearAllMocks())

  it('super admin: approves a draft, a stale article cannot be approved, and asks', async () => {
    api.get.mockResolvedValue({ data: { data: [art(), art({ id: 2, live: false })] } })
    api.post.mockImplementation((url) => Promise.resolve({ data: { data: url === '/super/ai-help' ? { kind: 'help', body: 'ANSWER', sources: [] } : {} } }))
    page('super')
    const rows = await screen.findAllByTestId('ai-help-row')
    expect(within(rows[0]).getByText('PREVIEW-TEXT')).toBeTruthy()
    expect(within(rows[1]).getByTestId('ai-help-approve').disabled).toBe(true)
    fireEvent.click(within(rows[0]).getByTestId('ai-help-approve'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/super/ai-help-articles/1/approve'))
    fireEvent.change(within(screen.getByTestId('ai-help-ask')).getByRole('textbox'), { target: { value: 'কীভাবে' } })
    fireEvent.submit(screen.getByTestId('ai-help-ask'))
    expect((await screen.findByTestId('ai-help-answer')).textContent).toBe('ANSWER')
  })

  it('head: writes own wording from an approved platform article (steps one per line)', async () => {
    api.get.mockResolvedValue({ data: { data: [{ ...art({ status: 'approved' }), own: null }] } })
    api.post.mockResolvedValue({ data: { data: {} } })
    page('admin')
    const row = await screen.findByTestId('ai-help-row')
    expect(screen.queryByTestId('ai-help-ask')).toBeNull()
    fireEvent.click(within(row).getByRole('button'))
    const form = await screen.findByTestId('ai-help-editor')
    fireEvent.submit(form)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ai/help-articles', expect.objectContaining({ base_article_id: 1, title: 'ভর্তি',
      body: expect.objectContaining({ steps: ['এক', 'দুই'], purpose: 'উদ্দেশ্য' }) })))
  })
})
