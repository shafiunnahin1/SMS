import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '../i18n'

vi.mock('../api/axios', () => ({ bindAuthStore: vi.fn(), default: { get: vi.fn(), post: vi.fn() } }))
const { default: api } = await import('../api/axios')
const { default: QbImportReview } = await import('../pages/writer/QbImportReview')

const id = 'batch-1'
const batch = { id, files: [{ name: 'questions.json' }], format: 'json', status: 'ready', counts: { total: 1, parsed: 1, valid: 1, invalid: 0, duplicate: 0, imported: 0 }, pdf: null }
const record = { id: 10, record: 1, type: 'short', payload: { question_text: 'A question?', occurrences: [] }, errors: [], warnings: [],
  has_math: false, duplicate_status: 'none', duplicate_question_id: null, selected: true, qb_question_id: null }

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/writer/imports/${id}`]}><Routes>
    <Route path="/writer/imports/:id" element={<QbImportReview />} />
  </Routes></MemoryRouter></QueryClientProvider>)
}

describe('D150 import source bulk settings', () => {
  beforeEach(() => {
    localStorage.setItem('locale', 'bn')
    api.get.mockImplementation(path => {
      if (path === `/writer/imports/${id}`) return Promise.resolve({ data: { data: batch } })
      if (path === '/writer/curriculum') return Promise.resolve({ data: { data: { subjects: [] } } })
      if (path === '/writer/question-types') return Promise.resolve({ data: { data: [{ id: 1, slug: 'short', name_bn: 'সংক্ষিপ্ত', name_en: 'Short' }] } })
      if (path.startsWith(`/writer/imports/${id}/records`)) return Promise.resolve({ data: { data: [record], meta: { last_page: 1 } } })
      return Promise.resolve({ data: { data: [] } })
    })
    api.post.mockResolvedValue({ data: { data: batch } })
  })

  it('maps the chosen source into the existing selected-record settings endpoint', async () => {
    renderPage()
    fireEvent.change(await screen.findByRole('combobox', { name: 'উৎসের ধরন' }), { target: { value: 'board' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'উৎসের পূর্ণ নাম' }), { target: { value: 'ঢাকা বোর্ড' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'সংক্ষিপ্ত নাম' }), { target: { value: 'ঢা.বো.' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'পরীক্ষার ধরন' }), { target: { value: 'SSC' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'সাল' }), { target: { value: '2025' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'উৎসে প্রশ্ন নম্বর' }), { target: { value: '12' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'সেট' }), { target: { value: 'A' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'পৃষ্ঠা / রেফারেন্স' }), { target: { value: 'পৃষ্ঠা 8' } })
    fireEvent.click(screen.getByRole('button', { name: 'নির্বাচিত প্রশ্নে উৎস যোগ' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/writer/imports/${id}/settings`, {
      selected: true,
      changes: { source_occurrence: { note: 'board', institution_name: 'ঢাকা বোর্ড', board: 'ঢা.বো.', exam_type: 'SSC', year: 2025,
        question_number: '12', set_label: 'A', page_reference: 'পৃষ্ঠা 8' } },
    }))
  })
})