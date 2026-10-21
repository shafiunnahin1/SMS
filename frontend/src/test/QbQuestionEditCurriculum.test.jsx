import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '../i18n'

vi.mock('../api/axios', () => ({ bindAuthStore: vi.fn(), default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))
const { default: api } = await import('../api/axios')
const { useAuthStore } = await import('../store/authStore')
const { default: QbQuestionEdit } = await import('../pages/writer/QbQuestionEdit')

const curriculum = {
  class_levels: [{ id: 11, name_bn: '১১শ শ্রেণি', name_en: 'Class 11' }],
  subjects: [{ id: 5, name_bn: 'ইংরেজি ১ম পত্র', name_en: 'English 1st Paper', class_level_ids: [11], chapters: [] }],
  curriculum_versions: [],
}
const question = {
  id: 42, qb_question_type_id: 3, qb_subject_id: 5, qb_chapter_id: null, qb_topic_id: null, difficulty: 3, marks: '1',
  class_level_ids: [11], curriculum_node_ids: [], question_text: 'Read the passage.', answer_text: '', explanation_text: '',
  options: [], creative_parts: [], occurrences: [], media: [], items: [], stimuli: [], status: 'draft',
}

const renderEditor = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/writer/questions/42']}><Routes>
    <Route path="/writer/questions/:id" element={<QbQuestionEdit />} />
  </Routes></MemoryRouter></QueryClientProvider>)
}

describe('writer question editor initial curriculum version', () => {
  let tree
  const types = [{ id: 3, name_bn: 'সিন প্যাসেজ', name_en: 'Seen Passage', family: 'passage', structure: 'passage' }]

  beforeEach(() => {
    localStorage.removeItem('locale')
    tree = { ...curriculum, curriculum_versions: [] }
    useAuthStore.setState({ user: { id: 9, name: 'Writer', role: 'content_writer' }, role: 'content_writer', isAuthenticated: true, checked: true })
    api.get.mockImplementation(url => {
      if (url === '/writer/curriculum') return Promise.resolve({ data: { data: { ...tree, curriculum_versions: [...tree.curriculum_versions] } } })
      if (url === '/writer/question-types') return Promise.resolve({ data: { data: types } })
      if (url === '/writer/questions/42') return Promise.resolve({ data: { data: question } })
      if (url === '/writer/questions/42/revisions') return Promise.resolve({ data: { data: [] } })
      return Promise.resolve({ data: { data: [] } })
    })
    api.post.mockImplementation(async (url, body) => {
      if (url === '/writer/qb/curriculum-versions') {
        tree = { ...tree, curriculum_versions: [{ id: 20, qb_subject_id: 5, is_active: true, version_key: body.version_key,
          name_bn: body.name_bn, name_en: body.name_en, nodes: [] }] }
        return { data: { data: { id: 20, ...body } } }
      }
      return { data: { data: question } }
    })
  })

  it('allows a writer to create the first version from a question draft', async () => {
    renderEditor()
    await screen.findByRole('combobox', { name: 'বিষয়' })
    expect(screen.getByText('এই বিষয়ের প্রথম সিলেবাস সংস্করণ তৈরি করুন।')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'সংস্করণ তৈরি' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'সংস্করণ পরিচিতি' }), { target: { value: '2026' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'নাম (বাংলা)' }), { target: { value: '২০২৬ পাঠ্যক্রম' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'নাম (ইংরেজি)' }), { target: { value: '2026 syllabus' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'সংরক্ষণ' })[1])

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/writer/qb/curriculum-versions', expect.objectContaining({
      qb_subject_id: 5,
      version_key: '2026',
      is_active: true,
    })))
    expect(await screen.findByRole('combobox', { name: 'সিলেবাসের স্তর 1' })).toBeInTheDocument()
  })
})
