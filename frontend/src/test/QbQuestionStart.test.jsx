import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '../i18n'
import { useAuthStore } from '../store/authStore'

vi.mock('../api/axios', () => ({ bindAuthStore: vi.fn(), default: { get: vi.fn(), post: vi.fn() } }))
const { default: api } = await import('../api/axios')
const { default: QbQuestionStart } = await import('../pages/writer/QbQuestionStart')

const curriculum = {
  class_levels: [{ id: 11, name_bn: '১১শ শ্রেণি', name_en: 'Class 11' }],
  subjects: [{ id: 5, name_bn: 'ইংরেজি ১ম পত্র', name_en: 'English 1st Paper', class_level_ids: [11], chapters: [{ id: 50, name_bn: 'পুরোনো অধ্যায়', name_en: 'Legacy Chapter', topics: [] }] }],
  curriculum_versions: [{ id: 2, qb_subject_id: 5, is_active: true, name_bn: '২০২৬', name_en: '2026', version_key: '2026', nodes: [
    { id: 8, kind: 'Part', name_bn: 'গদ্য', name_en: 'Prose', children: [{ id: 9, kind: 'Text', name_bn: 'আম আঁটির ভেঁপু', name_en: 'Aam Antir Bhepu', children: [] }] },
  ] }],
}

const wrapper = (initial = '/writer/questions/start') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initial]}><Routes>
    <Route path="/writer/questions/start" element={<QbQuestionStart />} />
    <Route path="/writer/questions/:id" element={<p>EDITOR</p>} />
  </Routes></MemoryRouter></QueryClientProvider>)
}

describe('writer question start curriculum placement', () => {
  beforeEach(() => {
    localStorage.removeItem('locale')
    useAuthStore.setState({ user: { role: 'content_writer' }, role: 'content_writer' })
    api.get.mockImplementation(url => Promise.resolve({ data: { data: url === '/writer/curriculum' ? curriculum : [
      { id: 3, name_bn: 'সিন প্যাসেজ', name_en: 'Seen Passage', family: 'passage', structure: 'passage' },
    ] } }))
    api.post.mockResolvedValue({ data: { data: { id: 77 } } })
  })

  it('uses the syllabus picker instead of legacy chapter and topic fields for a language subject without a version', async () => {
    api.get.mockImplementation(url => Promise.resolve({ data: { data: url === '/writer/curriculum'
      ? { ...curriculum, curriculum_versions: [] }
      : [{ id: 3, name_bn: 'সিন প্যাসেজ', name_en: 'Seen Passage', family: 'passage', structure: 'passage' }] } }))
    wrapper()
    await screen.findByRole('combobox', { name: 'বিষয়' })
    fireEvent.change(screen.getByRole('combobox', { name: 'বিষয়' }), { target: { value: '5' } })

    expect(screen.getByTestId('curriculum-picker')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'অধ্যায়' })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'টপিক' })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'প্রশ্নের ধরন' })).not.toHaveAttribute('multiple')
    expect(screen.getByText(/পরীক্ষার অংশ প্রশ্নের ধরন হিসেবে বাছাই হয়/)).toBeInTheDocument()
  })

  it('keeps chapter and topic fields for a non-language subject without a version', async () => {
    api.get.mockImplementation(url => Promise.resolve({ data: { data: url === '/writer/curriculum'
      ? { ...curriculum, subjects: [{ id: 6, name_bn: 'পদার্থ', name_en: 'Physics', class_level_ids: [11], chapters: [{ id: 60, name_bn: 'গতি', name_en: 'Motion', topics: [] }] }], curriculum_versions: [] }
      : [{ id: 3, name_bn: 'সিন প্যাসেজ', name_en: 'Seen Passage', family: 'passage', structure: 'passage' }] } }))
    wrapper()
    await screen.findByRole('combobox', { name: 'বিষয়' })
    fireEvent.change(screen.getByRole('combobox', { name: 'বিষয়' }), { target: { value: '6' } })

    expect(screen.queryByTestId('curriculum-picker')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'অধ্যায়' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'টপিক' })).toBeInTheDocument()
  })

  it('sends selected curriculum nodes with the initial draft', async () => {
    wrapper()
    await screen.findByRole('combobox', { name: 'বিষয়' })
    fireEvent.change(screen.getByRole('combobox', { name: 'বিষয়' }), { target: { value: '5' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'সিলেবাসের স্তর 1' }), { target: { value: '8' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'সিলেবাসের স্তর 2' }), { target: { value: '9' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'প্রশ্নের ধরন' }), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Draft তৈরি করুন' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/writer/questions', expect.objectContaining({
      qb_subject_id: 5,
      qb_chapter_id: null,
      qb_topic_id: null,
      curriculum_node_ids: [9],
    })))
    expect(await screen.findByText('EDITOR')).toBeInTheDocument()
  })

  it('lets a writer create the first version for a language subject', async () => {
    let refreshedTree = { ...curriculum, curriculum_versions: [] }
    api.get.mockImplementation(url => Promise.resolve({ data: { data: url === '/writer/curriculum'
      ? { ...refreshedTree, curriculum_versions: [...refreshedTree.curriculum_versions] }
      : [{ id: 3, name_bn: 'সিন প্যাসেজ', name_en: 'Seen Passage', family: 'passage', structure: 'passage' }] } }))
    api.post.mockImplementation(async (url, body) => {
      if (url === '/writer/qb/curriculum-versions') {
        refreshedTree = { ...refreshedTree, curriculum_versions: [{ id: 20, qb_subject_id: 5, is_active: true, version_key: body.version_key,
          name_bn: body.name_bn, name_en: body.name_en, nodes: [] }] }
        return { data: { data: { id: 20, ...body } } }
      }
      return { data: { data: { id: 77 } } }
    })
    wrapper()
    await screen.findByRole('combobox', { name: 'বিষয়' })
    fireEvent.change(screen.getByRole('combobox', { name: 'বিষয়' }), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: 'সংস্করণ তৈরি' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'সংস্করণ পরিচিতি' }), { target: { value: '2026' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'নাম (বাংলা)' }), { target: { value: '২০২৬ পাঠ্যক্রম' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'নাম (ইংরেজি)' }), { target: { value: '2026 syllabus' } })
    fireEvent.click(screen.getByRole('button', { name: 'সংরক্ষণ' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/writer/qb/curriculum-versions', expect.objectContaining({
      qb_subject_id: 5,
      version_key: '2026',
      is_active: true,
    })))
    expect(await screen.findByRole('combobox', { name: 'সিলেবাসের স্তর 1' })).toBeInTheDocument()
  })
})