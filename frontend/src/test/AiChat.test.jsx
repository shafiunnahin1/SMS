import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import AiChat from '../pages/ai/AiChat'
import { buildNav } from '../nav/menu'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))

const page = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <MemoryRouter><AiChat /></MemoryRouter></QueryClientProvider>)

const answer = { id: 11, role: 'answer', body: '1. ৪ ও ৬ এর লসাগু কত\n   উত্তর দেখতে প্রশ্নটি unlock করুন', kind: 'composed', rating: null, review: 'unreviewed',
  sources: [{ type: 'question', id: 7, locked: true }, { type: 'curriculum', id: 3, title: 'লসাগু' }] }

// D164 AI-P1.3: ask in a new chat, see the answer marked "not yet reviewed" with its sources, unlock a hidden answer, rate it
describe('AI assistant chat (D164)', () => {
  afterEach(() => vi.clearAllMocks())

  it('starts a chat with the first question and shows the answer with sources, unlock and rating', async () => {
    let convo = null
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/ai/conversations' ? (convo ? [convo] : [])
      : { id: 5, title: 'লসাগু', messages: [{ id: 10, role: 'question', body: '৪ ও ৬ এর লসাগু কত' }, answer] } } }))
    api.post.mockImplementation((url) => {
      if (url === '/ai/conversations') { convo = { id: 5, title: 'লসাগু' }; return Promise.resolve({ data: { data: { id: 5 } } }) }
      return Promise.resolve({ data: { data: { answer, questions: [{ id: 7, free_reveal: false }], free_left: 0 } } })
    })
    api.put.mockResolvedValue({ data: { data: { id: 11, rating: -1 } } })
    const { container } = page()
    await screen.findByTestId('ai-chat')
    fireEvent.change(container.querySelector('textarea[name="ai_question"]'), { target: { value: '৪ ও ৬ এর লসাগু কত' } })
    fireEvent.click(container.querySelector('[data-action="ask"]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/ai/conversations/5/messages', { text: '৪ ও ৬ এর লসাগু কত' }))
    expect(api.post).toHaveBeenCalledWith('/ai/conversations', { title: '৪ ও ৬ এর লসাগু কত' })
    await screen.findByText(/এখনো যাচাই হয়নি|Not yet reviewed/)
    expect(container.querySelector('[data-answer="11"]').textContent).toMatch(/লসাগু/)
    expect(screen.getAllByText(/#7/).length).toBeGreaterThan(0)                // the source list and the unlock button
    expect(container.querySelector('[data-answer="11"] button').textContent).toMatch(/#7/)
    fireEvent.click(container.querySelector('[data-action="rate-down"]'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/ai/messages/11/rating', { rating: -1 }))
  })

  it('shows the model-rephrased answer with the template it replaced (AI-P1.6.1)', async () => {
    const rephrased = { ...answer, body: '৪ আর ৬-এর লসাগু খুঁজতে প্রশ্নটি unlock করুন', template: answer.body, rephrasing: false }
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/ai/conversations' ? [{ id: 5, title: 'লসাগু' }]
      : { id: 5, title: 'লসাগু', messages: [{ id: 10, role: 'question', body: '৪ ও ৬ এর লসাগু কত' }, rephrased] } } }))
    const { container } = page()
    fireEvent.click(await screen.findByText('লসাগু', { selector: 'button' }))
    const details = await screen.findByTestId('ai-template')
    expect(details.textContent).toMatch(/কাঠামো-মাফিক উত্তর|Template answer/)
    expect(details.textContent).toContain('উত্তর দেখতে প্রশ্নটি unlock করুন')
    expect(container.querySelector('[data-answer="11"]').textContent).toContain('৪ আর ৬-এর লসাগু খুঁজতে')
    expect(screen.queryByTestId('ai-rephrasing')).toBeNull()
  })

  it('deletes an own chat after confirming (D165 ST.6)', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/ai/conversations' ? [{ id: 5, title: 'লসাগু' }] : { id: 5, title: 'লসাগু', messages: [] } } }))
    api.delete.mockResolvedValue({ data: { success: true } })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { container } = page()
    await screen.findByText('লসাগু')
    fireEvent.click(container.querySelector('[data-action="delete-chat"]'))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/ai/conversations/5'))
    confirm.mockRestore()
    expect(buildNav('student', { modules: ['ai_assistant'] }).map(i => i.path)).toContain('/student/ai')
  })

  it('marks a help answer as the approved software guide (D166 AI-Q4)', async () => {
    const help = { id: 21, role: 'answer', kind: 'help', body: 'নতুন শিক্ষার্থী ভর্তি করা\n\nউদ্দেশ্য: ...', rating: null, review: null, items: [], sources: [{ type: 'help', id: 3, title: 'নতুন শিক্ষার্থী ভর্তি করা' }] }
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/ai/conversations' ? [{ id: 5, title: 'ভর্তি' }] : { id: 5, title: 'ভর্তি', messages: [help] } } }))
    page()
    fireEvent.click(await screen.findByText('ভর্তি', { selector: 'button' }))
    const chips = await screen.findByTestId('ai-source-chips')
    expect(chips.querySelector('[data-source="help"]').textContent).toMatch(/সফটওয়্যার-সহায়িকা|Software guide/)
    expect(screen.getByTestId('ai-review-mark').textContent).toMatch(/যাচাই-করা উত্তর|Reviewed answer/)
    for (const role of ['parent', 'accountant']) expect(buildNav(role, { modules: ['ai_assistant', 'fees', 'exams'] }).flatMap(i => i.children ?? [i]).map(i => i.path)).toContain(`/${role}/ai`)
  })

  it('appears in the admin and teacher menus only with the ai_assistant module', () => {
    const paths = (role, modules) => buildNav(role, { modules }).flatMap(i => i.children ?? [i]).map(i => i.path)
    expect(paths('admin', ['ai_assistant'])).toContain('/admin/ai')
    expect(paths('teacher', ['ai_assistant'])).toContain('/teacher/ai')
    expect(paths('teacher', ['exams'])).not.toContain('/teacher/ai')
  })
})
