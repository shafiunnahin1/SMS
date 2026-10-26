import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import AiChat from '../pages/ai/AiChat'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))

const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><AiChat /></MemoryRouter></QueryClientProvider>)
const answer = { id: 11, role: 'answer', kind: 'composed', body: 'উত্তর', rating: null, review: 'corrected', original: 'আগের উত্তর', items: [], created_at: '2026-10-26T08:30:00Z',
  sources: [{ type: 'question', id: 7, locked: true }, { type: 'curriculum', id: 3, title: 'গতি' }, { type: 'concept', id: 4, title: 'ত্বরণ' }, { type: 'answer_bank', id: 9 }] }

// D166 AI-Q3: messenger layout - the question shows at once as "sending", a failure keeps it with "try again", the answer has
// source chips, a reviewed marker and a "reviewer updated" note; on a phone the list and the chat are two screens
describe('AI chat layout (D166)', () => {
  afterEach(() => vi.clearAllMocks())

  it('keeps a failed question with try again, then sends it', async () => {
    let fail = true
    let convo = null
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/ai/conversations' ? (convo ? [convo] : [])
      : { id: 5, title: 'ঢাল', messages: fail ? [] : [{ id: 10, role: 'question', body: 'ঢাল কত', created_at: '2026-10-26T08:29:00Z' }, answer] } } }))
    api.post.mockImplementation((url) => {
      if (url === '/ai/conversations') { convo = { id: 5, title: 'ঢাল' }; return Promise.resolve({ data: { data: { id: 5 } } }) }
      return fail ? Promise.reject({ response: { data: { message: 'নেটওয়ার্ক' } } }) : Promise.resolve({ data: { data: { answer, questions: [], free_left: 3 } } })
    })
    const { container } = wrap()
    fireEvent.change(container.querySelector('textarea[name="ai_question"]'), { target: { value: 'ঢাল কত' } })
    fireEvent.click(container.querySelector('[data-action="ask"]'))
    await waitFor(() => expect(container.querySelector('[data-mine="failed"]')).not.toBeNull())
    expect(container.querySelector('[data-mine="failed"]').textContent).toContain('ঢাল কত')
    expect(container.querySelector('textarea[name="ai_question"]').value).toBe('')
    fail = false
    fireEvent.click(container.querySelector('[data-action="retry"]'))
    await waitFor(() => expect(container.querySelector('[data-answer="11"]')).not.toBeNull())
    expect(container.querySelector('[data-mine="failed"]')).toBeNull()
    expect(api.post).toHaveBeenLastCalledWith('/ai/conversations/5/messages', { text: 'ঢাল কত' })

    const chips = screen.getByTestId('ai-source-chips')
    expect([...chips.querySelectorAll('[data-source]')].map(c => c.getAttribute('data-source'))).toEqual(['question', 'curriculum', 'concept', 'answer_bank'])
    expect(chips.textContent).toMatch(/#7/)
    expect(chips.textContent).toContain('ত্বরণ')
    expect(screen.getByTestId('ai-review-mark').textContent).toMatch(/যাচাই-করা উত্তর|Reviewed answer/)
    expect(screen.getByTestId('ai-updated')).not.toBeNull()
  })

  it('shows the list or the chat on a phone and both on a desktop', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/ai/conversations' ? [{ id: 5, title: 'ঢাল' }] : { id: 5, title: 'ঢাল', messages: [] } } }))
    const { container } = wrap()
    const list = await screen.findByTestId('ai-conversations')
    const chat = screen.getByTestId('ai-chat')
    expect([list.className.includes('hidden'), chat.className]).toEqual([false, expect.stringContaining('hidden lg:flex')])
    fireEvent.click(await screen.findByText('ঢাল', { selector: 'button' }))
    await waitFor(() => expect(list.className).toContain('hidden lg:flex'))
    expect(chat.className).not.toMatch(/(^|\s)hidden(\s|$)/)
    expect(chat.className).toContain('max-lg:fixed max-lg:inset-0')        // owner: an open chat fills any phone screen
    expect(chat.getAttribute('data-fullscreen')).toBe('phone')
    expect(screen.queryByTestId('page-header')).toBeNull()                  // owner: no visible "AI সহকারী" title
    expect(container.querySelector('h1.sr-only')).not.toBeNull()
    fireEvent.click(container.querySelector('[data-action="back"]'))
    await waitFor(() => expect(list.className).not.toContain('hidden'))
  })
})
