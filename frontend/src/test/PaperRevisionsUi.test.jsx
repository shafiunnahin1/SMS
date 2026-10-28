import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import QbPaperEdit from '../pages/qb/QbPaperEdit'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn() }, bindAuthStore: () => {} }))

// D180 QBO.2: a final paper's settings block stays editable; saving sends only the settings (never the locked questions) and the
// revision history lists each revision with what it changed and a print of exactly that revision
const paper = { id: 8, title: 'Weekly (retake)', exam_name: 'Unit 1', status: 'final', total_marks: '3.00', sets_count: 3, duration_minutes: 30, revision: 2, subjects: [],
  instructions_json: { class_level_id: 4 }, sections: [{ title: 'MCQ', instruction: '', items: [{ qb_question_id: 140, marks: '1.00' }] }],
  sets: [1, 2, 3].map(n => ({ number: n, set: 'ABC'[n - 1], code: 'ABC'[n - 1], strategy: 'both' })) }
const revisions = [{ number: 2, settings: { title: 'Weekly (retake)' }, changed: ['title', 'sets_count'], sets: 3 }, { number: 1, settings: { title: 'Weekly' }, changed: [], sets: 2 }]

describe('final paper settings revisions (D180)', () => {
  afterEach(() => vi.clearAllMocks())

  it('edits the settings of a final paper as a new revision and lists the revisions', async () => {
    api.get.mockImplementation(path => Promise.resolve({ data: { data: path === '/question-bank/papers/8' ? paper : path === '/question-bank/papers/8/revisions' ? revisions : [] } }))
    api.put.mockResolvedValue({ data: { data: paper } })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/admin/question-bank/papers/8']}><Routes><Route path="/admin/question-bank/papers/:id" element={<QbPaperEdit />} /></Routes></MemoryRouter></QueryClientProvider>)
    const settings = await screen.findByTestId('paper-settings')
    expect(within(settings).getByTestId('paper-revision-note')).toHaveTextContent('সংস্করণ 2')
    const title = within(settings).getByRole('textbox', { name: /শিরোনাম/ })
    await waitFor(() => expect(title).toHaveValue('Weekly (retake)'))
    expect(title).toBeEnabled()
    fireEvent.change(title, { target: { value: 'Weekly (final retake)' } })
    fireEvent.click(within(settings).getByRole('button', { name: 'সেটিং সংরক্ষণ' }))
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1))
    const [url, body] = api.put.mock.calls[0]
    expect(url).toBe('/question-bank/papers/8')
    expect(body).toMatchObject({ title: 'Weekly (final retake)', sets_count: 3, instructions_json: { class_level_id: 4 } })
    expect(body).not.toHaveProperty('sections')                                    // questions and marks stay locked

    const history = await screen.findByTestId('paper-revisions')
    expect(within(history).getAllByRole('listitem').map(li => li.dataset.revision)).toEqual(['2', '1'])
    expect(within(history).getAllByRole('listitem')[0]).toHaveTextContent('বর্তমান')
    expect(within(history).getAllByRole('listitem')[0]).toHaveTextContent('শিরোনাম, সেট সংখ্যা')
  })
})
