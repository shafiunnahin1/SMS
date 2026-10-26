import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '../i18n'

vi.mock('../api/axios', () => ({ bindAuthStore: vi.fn(), default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }))
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
    <Route path="/writer/questions/:id" element={<p>FULL EDITOR</p>} />
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
    api.patch.mockResolvedValue({ data: { data: { ...record, errors: [] } } })
  })

  it('maps the chosen source into the existing selected-record settings endpoint', async () => {
    renderPage()
    fireEvent.click(await screen.findByTestId('qbi-open-bulk'))
    fireEvent.change(await screen.findByRole('combobox', { name: 'উৎসের ধরন' }), { target: { value: 'board' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'উৎসের পূর্ণ নাম' }), { target: { value: 'ঢাকা বোর্ড' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'সংক্ষিপ্ত নাম' }), { target: { value: 'ঢা.বো.' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'পরীক্ষার ধরন' }), { target: { value: 'SSC' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'সাল' }), { target: { value: '2025' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'উৎসে প্রশ্ন নম্বর' }), { target: { value: '12' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'সেট' }), { target: { value: 'A' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'পৃষ্ঠা / রেফারেন্স' }), { target: { value: 'পৃষ্ঠা 8' } })
    fireEvent.click(screen.getByTestId('qbi-source-add'))
    fireEvent.change(screen.getAllByRole('combobox', { name: 'উৎসের ধরন' })[1], { target: { value: 'book' } })
    fireEvent.change(screen.getAllByRole('textbox', { name: 'উৎসের পূর্ণ নাম' })[1], { target: { value: 'বাংলা ব্যাকরণ' } })
    fireEvent.click(screen.getByTestId('qbi-bulk-apply'))

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2))
    expect(api.post).toHaveBeenNthCalledWith(1, `/writer/imports/${id}/settings`, {
      selected: true,
      changes: { source_occurrence: { note: 'board', institution_name: 'ঢাকা বোর্ড', board: 'ঢা.বো.', exam_type: 'SSC', year: 2025,
        question_number: '12', set_label: 'A', page_reference: 'পৃষ্ঠা 8' } },
    })
    expect(api.post).toHaveBeenNthCalledWith(2, `/writer/imports/${id}/settings`, {
      selected: true,
      changes: { source_occurrence: { note: 'book', institution_name: 'বাংলা ব্যাকরণ', board: null, exam_type: null, year: null,
        question_number: null, set_label: null, page_reference: null } },
    })
  })

  it('lets quick edit correct an invalid chapter before enabling the record checkbox', async () => {
    let row = { ...record, selected: false, payload: { ...record.payload, subject: { name: 'Mathematics' }, chapter: { name: 'Missing chapter' } },
      errors: [{ path: 'chapter', message: 'no such chapter in this subject' }] }
    api.get.mockImplementation(path => {
      if (path === `/writer/imports/${id}`) return Promise.resolve({ data: { data: batch } })
      if (path === '/writer/curriculum') return Promise.resolve({ data: { data: { class_levels: [{ id: 7, name_bn: 'সপ্তম', name_en: 'Class 7' }],
        subjects: [{ id: 1, name_bn: 'গণিত', name_en: 'Mathematics', chapters: [{ id: 2, name_bn: 'বীজগণিত', name_en: 'Algebra', topics: [] }] }] } } })
      if (path === '/writer/question-types') return Promise.resolve({ data: { data: [{ id: 1, slug: 'short', name_bn: 'সংক্ষিপ্ত', name_en: 'Short' }] } })
      if (path.startsWith(`/writer/imports/${id}/records`)) return Promise.resolve({ data: { data: [{ ...row }], meta: { last_page: 1 } } })
      return Promise.resolve({ data: { data: [] } })
    })
    api.patch.mockImplementation(async (path, body) => {
      expect(path).toBe(`/writer/imports/${id}/records/${record.id}`)
      expect(body).toMatchObject({ chapter: null, topic: null, class_levels: [] })
      row = { ...row, payload: { ...row.payload, chapter: null, topic: null }, errors: [] }
      return { data: { data: row } }
    })

    renderPage()
    const checkbox = await screen.findByRole('checkbox', { name: 'নির্বাচন' })
    expect(checkbox).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'দ্রুত সম্পাদনা' }))
    fireEvent.change(screen.getByTestId('qbi-quick-edit').querySelector('select[name="chapter"]'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'সংরক্ষণ' }))

    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'নির্বাচন' })).toBeEnabled())
    fireEvent.click(screen.getByRole('checkbox', { name: 'নির্বাচন' }))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/writer/imports/${id}/select`, { record_ids: [record.id], selected: true }))
  })

  it('shows and saves language-paper curriculum node IDs in staged quick edit', async () => {
    const paperRecord = { ...record, payload: { question_text: 'পাঠ-ভিত্তিক প্রশ্ন', subject: { id: 2, name_bn: 'বাংলা ১ম পত্র' },
      class_levels: [{ id: 7 }], curriculum_node_ids: [20] } }
    api.get.mockImplementation(path => {
      if (path === `/writer/imports/${id}`) return Promise.resolve({ data: { data: batch } })
      if (path === '/writer/curriculum') return Promise.resolve({ data: { data: {
        class_levels: [{ id: 7, name_bn: 'সপ্তম', name_en: 'Class 7' }],
        subjects: [{ id: 2, name_bn: 'বাংলা ১ম পত্র', name_en: 'Bangla 1st Paper', chapters: [] }],
        curriculum_versions: [{ id: 10, qb_subject_id: 2, version_key: 'bn-v1', name_bn: 'বাংলা সিলেবাস', name_en: 'Bangla syllabus', class_level_ids: [7],
          nodes: [{ id: 20, kind: 'Unit', name_bn: 'ইউনিট ১', name_en: 'Unit 1', children: [] }, { id: 21, kind: 'Unit', name_bn: 'ইউনিট ২', name_en: 'Unit 2', children: [] }] }],
      } } })
      if (path === '/writer/question-types') return Promise.resolve({ data: { data: [{ id: 1, slug: 'short', name_bn: 'সংক্ষিপ্ত', name_en: 'Short' }] } })
      if (path.startsWith(`/writer/imports/${id}/records`)) return Promise.resolve({ data: { data: [paperRecord], meta: { last_page: 1 } } })
      return Promise.resolve({ data: { data: [] } })
    })
    api.patch.mockResolvedValue({ data: { data: { ...paperRecord, errors: [] } } })

    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'দ্রুত সম্পাদনা' }))
    expect(await screen.findByText('ইউনিট ১')).toBeInTheDocument()
    const search = screen.getByRole('combobox', { name: 'সিলেবাসে অবস্থান' })
    fireEvent.change(search, { target: { value: 'ইউনিট ২' } })
    fireEvent.mouseDown(await within(screen.getByRole('listbox')).findByRole('option', { name: /ইউনিট ২/ }), { preventDefault: vi.fn() })
    fireEvent.click(screen.getByRole('button', { name: 'সংরক্ষণ' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(`/writer/imports/${id}/records/${record.id}`, expect.objectContaining({ curriculum_node_ids: [20, 21] })))
  })

  it('clears class-scoped curriculum nodes when the selected classes change', async () => {
        api.get.mockImplementation(path => {
          if (path === `/writer/imports/${id}`) return Promise.resolve({ data: { data: batch } })
          if (path === '/writer/curriculum') return Promise.resolve({ data: { data: {
            class_levels: [{ id: 7, name_bn: 'সপ্তম', name_en: 'Class 7' }, { id: 8, name_bn: 'অষ্টম', name_en: 'Class 8' }],
            subjects: [{ id: 2, name_bn: 'বাংলা ১ম পত্র', name_en: 'Bangla 1st Paper', class_level_ids: [7, 8], chapters: [] }],
            curriculum_versions: [
              { id: 10, qb_subject_id: 2, version_key: 'class-7', class_level_ids: [7], nodes: [{ id: 20, kind: 'Unit', name_bn: 'সপ্তমের ইউনিট', name_en: 'Class 7 unit', children: [] }] },
              { id: 11, qb_subject_id: 2, version_key: 'class-8', class_level_ids: [8], nodes: [{ id: 21, kind: 'Unit', name_bn: 'অষ্টমের ইউনিট', name_en: 'Class 8 unit', children: [] }] },
            ],
          } } })
          if (path === '/writer/question-types') return Promise.resolve({ data: { data: [{ id: 1, slug: 'short', name_bn: 'সংক্ষিপ্ত', name_en: 'Short' }] } })
          if (path.startsWith(`/writer/imports/${id}/records`)) return Promise.resolve({ data: { data: [record], meta: { last_page: 1 } } })
          return Promise.resolve({ data: { data: [] } })
        })

        renderPage()
        fireEvent.click(await screen.findByTestId('qbi-open-bulk'))
        fireEvent.click(screen.getByLabelText('সপ্তম'))
        fireEvent.change(screen.getByRole('combobox', { name: 'বিষয়' }), { target: { value: '2' } })
        const search = within(screen.getByTestId('qbi-bulk-curriculum')).getByRole('combobox', { name: 'সিলেবাসে অবস্থান' })
        fireEvent.change(search, { target: { value: 'সপ্তমের ইউনিট' } })
        fireEvent.mouseDown(await within(screen.getByRole('listbox')).findByRole('option', { name: /সপ্তমের ইউনিট/ }), { preventDefault: vi.fn() })
        expect(screen.getByTestId('curriculum-breadcrumb')).toHaveTextContent('সপ্তমের ইউনিট')

        fireEvent.click(screen.getByLabelText('অষ্টম'))
        fireEvent.click(screen.getByTestId('qbi-bulk-apply'))

        await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/writer/imports/${id}/settings`, {
          selected: true, changes: { subject: 2, class_levels: [7, 8] },
        }))
      })

  it('shows MCQ options, creative parts, answer, and explanation in the staged question card', async () => {
    const completeRecord = { ...record, payload: { ...record.payload, options: [{ label: 'ক', content_text: 'বিকল্প ক', is_correct: true }],
      creative_parts: [{ part_label: 'ক', cognitive_level: 'knowledge', question_text: 'অংশের প্রশ্ন', answer_text: 'অংশের উত্তর', marks: 2 }],
      answer_text: 'সম্পূর্ণ উত্তর', explanation_text: 'ব্যাখ্যার লেখা' } }
    api.get.mockImplementation(path => {
      if (path === `/writer/imports/${id}`) return Promise.resolve({ data: { data: batch } })
      if (path === '/writer/curriculum') return Promise.resolve({ data: { data: { subjects: [] } } })
      if (path === '/writer/question-types') return Promise.resolve({ data: { data: [{ id: 1, slug: 'short', name_bn: 'সংক্ষিপ্ত', name_en: 'Short' }] } })
      if (path.startsWith(`/writer/imports/${id}/records`)) return Promise.resolve({ data: { data: [completeRecord], meta: { last_page: 1 } } })
      return Promise.resolve({ data: { data: [] } })
    })
    renderPage()
    expect(await screen.findByText('বিকল্প ক')).toBeInTheDocument()
    expect(screen.getByText('অংশের প্রশ্ন')).toBeInTheDocument()
    expect(screen.queryByText('অংশের উত্তর')).not.toBeInTheDocument()
    expect(screen.queryByText('সম্পূর্ণ উত্তর')).not.toBeInTheDocument()
    expect(screen.queryByText('ব্যাখ্যার লেখা')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('qbi-toggle-answer'))
    expect(screen.getByText('অংশের উত্তর')).toBeInTheDocument()
    expect(screen.getByText('সম্পূর্ণ উত্তর')).toBeInTheDocument()
    expect(screen.getByText('ব্যাখ্যার লেখা')).toBeInTheDocument()
  })

  it('shows a stimulus MCQ\'s choices and marks the right one only after disclosure', async () => {
    const stimulusRecord = { ...record, type: 'stimulus_mcq_group', payload: { question_text: 'উদ্দীপকটি পড়ে প্রশ্নের উত্তর দাও।', occurrences: [],
      stimuli: [{ label: 'stimulus', content_text: 'একবার শহর থেকে এক ভদ্রলোক বন্দুক নিয়ে গ্রামে এসেছিল।' }],
      items: [{ item_type: 'sub_mcq', stimulus_index: 0, prompt_text: 'উদ্দীপকের রাফি কার প্রতিচ্ছবি?',
        prompt_json: { options: ['মালির', 'লেখকের', 'মালির বউর', 'পা ফোলা রোগীর'] }, answer_json: { correct: 1 } }] } }
    api.get.mockImplementation(path => {
      if (path === `/writer/imports/${id}`) return Promise.resolve({ data: { data: batch } })
      if (path === '/writer/curriculum') return Promise.resolve({ data: { data: { subjects: [] } } })
      if (path === '/writer/question-types') return Promise.resolve({ data: { data: [{ id: 4, slug: 'stimulus_mcq_group', name_bn: 'উদ্দীপকভিত্তিক বহুনির্বাচনী প্রশ্ন', name_en: 'Stimulus Based MCQ' }] } })
      if (path.startsWith(`/writer/imports/${id}/records`)) return Promise.resolve({ data: { data: [stimulusRecord], meta: { last_page: 1 } } })
      return Promise.resolve({ data: { data: [] } })
    })
    renderPage()
    expect(await screen.findByText('একবার শহর থেকে এক ভদ্রলোক বন্দুক নিয়ে গ্রামে এসেছিল।')).toBeInTheDocument()
    expect(screen.getByText('উদ্দীপকের রাফি কার প্রতিচ্ছবি?')).toBeInTheDocument()
    const options = within(screen.getByTestId('qbi-sub-mcq-options')).getAllByRole('listitem')
    expect(options.map(o => o.textContent)).toEqual(['কমালির', 'খলেখকের', 'গমালির বউর', 'ঘপা ফোলা রোগীর'])
    // before disclosure: every choice is visible, none is marked, and no answer block
    expect(options.filter(o => o.dataset.correct)).toHaveLength(0)
    expect(screen.queryByTestId('qbi-answer')).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain('"correct"')
    fireEvent.click(screen.getByTestId('qbi-toggle-answer'))
    const after = within(screen.getByTestId('qbi-sub-mcq-options')).getAllByRole('listitem')
    expect(after.filter(o => o.dataset.correct).map(o => o.textContent)).toEqual(['খলেখকের'])
    expect(within(screen.getByTestId('qbi-answer')).getByText('লেখকের')).toBeInTheDocument()
    expect(screen.getByTestId('qbi-answer').textContent).toContain('খ')
  })

  it('opens the canonical editor for just the requested staged record', async () => {
    api.get.mockImplementation(path => {
      if (path === `/writer/imports/${id}`) return Promise.resolve({ data: { data: batch } })
      if (path === '/writer/curriculum') return Promise.resolve({ data: { data: { subjects: [] } } })
      if (path === '/writer/question-types') return Promise.resolve({ data: { data: [{ id: 1, slug: 'short', name_bn: 'সংক্ষিপ্ত', name_en: 'Short' }] } })
      if (path.startsWith(`/writer/imports/${id}/records`)) return Promise.resolve({ data: { data: [record], meta: { last_page: 1 } } })
      return Promise.resolve({ data: { data: [] } })
    })
    api.post.mockResolvedValue({ data: { data: { question_id: 23 } } })
    renderPage()
    fireEvent.click(await screen.findByTestId('qbi-full-editor'))
    expect(await screen.findByText('FULL EDITOR')).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith(`/writer/imports/${id}/records/${record.id}/open-editor`)
  })
})
