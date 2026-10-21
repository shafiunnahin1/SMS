import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '../i18n'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import QbQuestionEdit from '../pages/writer/QbQuestionEdit'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() }, bindAuthStore: () => {} }))

const question = {
  id: 6, qb_question_type_id: 1, qb_subject_id: 1, qb_chapter_id: null, qb_topic_id: null, difficulty: 3, marks: '1.00',
  language: 'und', content_mode: 'mixed', question_text: '<img data-qmx-media="42" data-qmx-width="55" data-qmx-align="right">',
  answer_text: '', explanation_text: '', status: 'draft', review_note: null, created_by: 1, class_level_ids: [], options: [],
  creative_parts: [], occurrences: [], media: [{ id: 42, url: '/private/42.png' }], stimuli: [], items: [],
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/writer/questions/6']}><Routes><Route path="/writer/questions/:id" element={<QbQuestionEdit />} /></Routes></MemoryRouter></QueryClientProvider>)
}

describe('writer question picture editor', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { role: 'super_admin' }, role: 'super_admin' })
    api.get.mockImplementation(url => Promise.resolve({ data: url === '/writer/curriculum'
      ? { data: { class_levels: [], subjects: [] } }
      : url === '/writer/question-types'
        ? { data: [{ id: 1, slug: 'short', name_bn: 'সংক্ষিপ্ত প্রশ্ন', name_en: 'Short', family: 'short', structure: null }] }
        : url === '/writer/questions/6/revisions' ? { data: [] } : { data: question } }))
  })
  afterEach(() => vi.clearAllMocks())

  it('opens the picture settings dialog from the ribbon and from the live preview image', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'প্রিভিউ' })).toBeInTheDocument()
    fireEvent.focus(screen.getByRole('textbox', { name: 'প্রশ্ন' }))
    fireEvent.click(screen.getByTestId('qb-ribbon').querySelector('[data-action="picture"]'))
    expect(await screen.findByTestId('qb-picture-dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('ছবি বাছাই করুন')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'বাতিল' }))

    fireEvent.click(screen.getByRole('button', { name: 'ছবির সেটিংস খুলুন' }))
    expect(await screen.findByTestId('qb-picture-dialog')).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'ছবির প্রস্থ' })).toHaveValue('55')
    expect(screen.getByRole('combobox', { name: 'ছবির সারিবদ্ধতা' })).toHaveValue('right')
  })

  it('marks the question classes without deriving a separate class from its subject', async () => {
    api.get.mockImplementation(url => Promise.resolve({ data: url === '/writer/curriculum'
      ? { data: { class_levels: [
        { id: 1, name_bn: 'প্লে' }, { id: 2, name_bn: 'নার্সারি' }, { id: 3, name_bn: 'কেজি' }, { id: 4, name_bn: 'অষ্টম শ্রেণি' },
      ], subjects: [{ id: 1, name_bn: 'আমার বই', class_level_ids: [1, 2, 3], chapters: [] }] } }
      : url === '/writer/question-types'
        ? { data: [{ id: 1, slug: 'short', name_bn: 'সংক্ষিপ্ত প্রশ্ন', name_en: 'Short', family: 'short', structure: null }] }
        : url === '/writer/questions/6/revisions' ? { data: [] } : { data: { ...question, class_level_ids: [4] } } }))
    renderPage()
    expect(await screen.findByTestId('qb-sections')).toBeInTheDocument()
    expect(screen.queryByTestId('qb-primary-class')).not.toBeInTheDocument()
    expect(screen.getByLabelText('অষ্টম শ্রেণি')).toBeChecked()
    expect(screen.getByTestId('qb-sections').querySelector('input[name="class_level_ids"][value="1"]')).not.toBeChecked()
  })
})
