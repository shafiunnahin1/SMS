import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
vi.mock('../features/qb/qbankTools', () => ({
  graphImage: vi.fn(async (t) => (t.includes('GOOD') ? 'data:image/svg+xml;charset=utf-8,%3Csvg%3E' : null)),
  diagramImage: vi.fn(async () => 'data:image/svg+xml;charset=utf-8,%3Csvg%3E'),
}))
vi.mock('../features/qb/mathlive', () => ({ loadMathlive: () => Promise.resolve(), UNSAFE_LATEX: /\\(href|url)/ }))
import AiChat, { safeTokens } from '../pages/ai/AiChat'

const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const latex = '\\frac{\\Delta y}{\\Delta x}'
const answer = (items, extra = {}) => ({ id: 11, role: 'answer', kind: 'composed', body: 'PLAIN [চিত্র]', rating: null, review: 'unreviewed', sources: [], items, ...extra })

// D166 AI-Q2: the chat draws an answer's questions with the safe renderer - LaTeX as math, a good graph as an image, a bad or
// malformed token as a placeholder (never raw text), a locked question without any answer side; a reviewer's text wins
describe('AI chat rendering (D166)', () => {
  afterEach(() => vi.clearAllMocks())

  const open = async (msg) => {
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/ai/conversations' ? [{ id: 5, title: 'চ্যাট' }]
      : { id: 5, title: 'চ্যাট', messages: [{ id: 10, role: 'question', body: 'ঢাল কত' }, msg] } } }))
    const view = wrap(<AiChat />)
    fireEvent.click(await screen.findByText('চ্যাট', { selector: 'button' }))
    return view
  }

  it('renders maths, graphs and placeholders through MathText', async () => {
    const { container } = await open(answer([
      { id: 1, unlocked: true, question_text: `ঢাল $${latex}$ [[qmx-graph:GOODgraphToken1]] আর [[qmx-graph:short]] [[qmx-evil:<script>]]`, media: [],
        options: [{ label: 'ক', content_text: '$2$', is_correct: true }], answer_text: '$m=2$', explanation_text: 'ব্যাখ্যা' },
      { id: 2, unlocked: false, question_text: 'লক করা প্রশ্ন', media: [], options: [{ label: 'ক', content_text: '৪' }] },
    ]))
    const items = await screen.findByTestId('ai-items')
    await waitFor(() => expect(items.querySelector('img[data-qb-graph="drawn"]')).not.toBeNull())
    const maths = [...items.querySelectorAll('math-span')].map(n => n.textContent)
    expect(maths).toContain(latex)                                    // the LaTeX round-trips into the renderer unchanged
    expect(maths).toContain('m=2')
    expect(items.textContent).not.toMatch(/qmx-|<script>|short/)
    expect(items.textContent).toMatch(/চিত্রটি দেখানো যায়নি|figure could not be shown/)
    expect(items.querySelector('[data-item="2"]').textContent).not.toMatch(/✓|m=2|ব্যাখ্যা/)
    expect(container.textContent).not.toContain('PLAIN')
  })

  it('shows the reviewer\'s text instead, with the questions folded away', async () => {
    await open(answer([{ id: 1, unlocked: true, question_text: 'প্রশ্ন', media: [], options: [] }], { body: 'রিভিউয়ারের উত্তর', original: 'PLAIN', review: 'rewritten' }))
    expect(await screen.findByText('রিভিউয়ারের উত্তর')).not.toBeNull()
    expect(screen.queryByTestId('ai-items')).toBeNull()
  })

  it('keeps only valid tokens', () => {
    expect(safeTokens('a [[qmx-graph:GOODgraphToken1]] b [[qmx-graph:x]] c', '[?]')).toBe('a [[qmx-graph:GOODgraphToken1]] b [?] c')
    expect(safeTokens(null, '[?]')).toBe('')
  })
})
