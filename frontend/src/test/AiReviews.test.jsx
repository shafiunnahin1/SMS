import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import AiReviews from '../pages/writer/AiReviews'
import { buildNav } from '../nav/menu'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))

const page = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <MemoryRouter><AiReviews /></MemoryRouter></QueryClientProvider>)

const rows = [
  { id: 2, status: 'unreviewed', question: 'গসাগু কী', answer: 'composed', kind: 'composed', rating: -1, sources: [] },
  { id: 1, status: 'unreviewed', question: 'ভগ্নাংশ কী [ফোন]', answer: 'not found', kind: 'not_found', rating: null, sources: [] },
]

// D164 (3) AI-P1.4: the reviewer approves, corrects (answer prefilled) or writes anew; a "not found" can only be written anew
describe('AI answer review (D164)', () => {
  afterEach(() => vi.clearAllMocks())

  it('approves one answer and writes another anew', async () => {
    api.get.mockResolvedValue({ data: { data: rows } })
    api.put.mockResolvedValue({ data: { data: {} } })
    const { container } = page()
    await screen.findByTestId('ai-reviews')
    expect(container.querySelector('[data-review="1"] [data-action="approve"]')).toBeNull()
    fireEvent.click(container.querySelector('[data-review="2"] [data-action="approve"]'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/writer/ai-reviews/2', { status: 'approved' }))
    fireEvent.click(container.querySelector('[data-review="1"] [data-action="rewrite"]'))
    const box = container.querySelector('[data-review="1"] textarea[name="review_text"]')
    expect(box.value).toBe('')
    fireEvent.change(box, { target: { value: 'ভগ্নাংশ হলো অংশ' } })
    fireEvent.click(container.querySelector('[data-review="1"] [data-action="save-review"]'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/writer/ai-reviews/1', { status: 'rewritten', text: 'ভগ্নাংশ হলো অংশ' }))
  })

  it('correct prefills the answer', async () => {
    api.get.mockResolvedValue({ data: { data: rows } })
    const { container } = page()
    await screen.findByTestId('ai-reviews')
    fireEvent.click(container.querySelector('[data-review="2"] [data-action="correct"]'))
    expect(container.querySelector('[data-review="2"] textarea').value).toBe('composed')
  })

  it('is in the writer and moderator menus', () => {
    const paths = (role) => buildNav(role).flatMap(i => i.children ?? [i]).map(i => i.path)
    expect(paths('content_writer')).toContain('/writer/ai-reviews')
    expect(paths('content_moderator')).toContain('/writer/ai-reviews')
  })
})
