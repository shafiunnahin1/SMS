import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import QbPaperEdit from '../pages/qb/QbPaperEdit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import OmrDesigner from '../features/qb/OmrDesigner'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() }, bindAuthStore: () => {} }))
vi.mock('../features/qb/omrSheet', () => ({ pdfPages: vi.fn(async () => {}) }))

// D173 SETC.2: the OMR set-code box has one A-J column per letter of the paper's set codes - shown, never typed
const settings = { title: 'T', subtitle: '', roll_digits: 6, option_count: 4, option_labels: ['A', 'B', 'C', 'D'], page_size: 'a4', page_orientation: 'portrait',
  answer_columns: 'auto', question_count: 5, info_boxes: { class: { visible: true, digits: 2 }, roll: { visible: true, digits: 6 }, subject: { visible: true, digits: 3 }, set: { visible: true, digits: 1 } },
  marking: { question_mark: '1.00', negative_mark_enabled: false, negative_mark: '0.00', multiple_answer_policy: 'wrong' } }

function columns(codes) {
  api.get.mockResolvedValue({ data: { data: { id: 9, title: 'T', sections: [] } } })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const { container, unmount } = render(<QueryClientProvider client={client}><OmrDesigner id="9" form={{ id: 1, code: 'X', settings, layout_version: 1, locked_at: null, set_codes: codes }} onSaved={vi.fn()} /></QueryClientProvider>)
  const input = container.querySelector('input[name="digits-set"]')
  const out = [input.value, input.disabled]
  unmount()
  return out
}

describe('OMR set-code columns follow the set codes (D173)', () => {
  afterEach(() => vi.clearAllMocks())

  it('shows one column per code letter and does not let the author change it', () => {
    expect(columns(['A', 'B'])).toEqual(['1', true])
    expect(columns(['AA', 'BE'])).toEqual(['2', true])
    expect(columns(['AAA'])).toEqual(['3', true])
    expect(columns(['খঙ'])).toEqual(['2', true])
  })

  it('offers up to 255 sets on a draft and on a final paper, and lists the new codes', async () => {
    const paper = { id: 8, title: 'P', status: 'final', total_marks: '1.00', sets_count: 15, duration_minutes: 2, subjects: [],
      sections: [{ title: 'S', instruction: '', items: [{ qb_question_id: 140, marks: '1.00' }] }],
      sets: Array.from({ length: 15 }, (_, k) => ({ number: k + 1, set: String.fromCharCode(65 + k), code: k === 14 ? 'BE' : 'A' + 'ABCDEFGHIJ'[k % 10], strategy: 'both' })) }
    api.get.mockImplementation(path => Promise.resolve({ data: { data: path === '/question-bank/papers/8' ? paper : [] } }))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/admin/question-bank/papers/8']}><Routes><Route path="/admin/question-bank/papers/:id" element={<QbPaperEdit />} /></Routes></MemoryRouter></QueryClientProvider>)
    const list = await screen.findByTestId('paper-set-list')
    expect(list).toHaveTextContent('সেট BE')
    const more = within(screen.getByTestId('paper-create-sets')).getByRole('combobox', { name: 'কতটি সেট' })
    expect(more.querySelectorAll('option').length).toBe(255 - 15)
  })
})
