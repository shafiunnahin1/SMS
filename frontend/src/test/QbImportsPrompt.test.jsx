import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import QbImports from '../pages/writer/QbImports'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() }, bindAuthStore: () => {} }))

const curriculum = {
  class_levels: [{ id: 8, name_bn: 'অষ্টম শ্রেণী', name_en: 'Class 8', is_active: true }],
  subjects: [
    { id: 17, name_bn: 'গণিত', name_en: 'Mathematics', class_level_ids: [8], is_active: true,
      chapters: [{ id: 34, name_bn: 'প্যাটার্ন', name_en: 'Patterns', class_level_ids: [8], topics: [{ id: 56, name_bn: 'সংখ্যার প্যাটার্ন', name_en: 'Number patterns' }] }] },
    { id: 18, name_bn: 'ইংরেজি ১ম পত্র', name_en: 'English 1st Paper', class_level_ids: [8], is_active: true,
      chapters: [{ id: 35, name_bn: 'Reading', name_en: 'Reading', class_level_ids: [8], topics: [{ id: 57, name_bn: 'Comprehension', name_en: 'Comprehension' }] }] },
    { id: 19, name_bn: 'বাংলা ১ম পত্র', name_en: 'Bangla 1st Paper', class_level_ids: [8], is_active: true,
      chapters: [{ id: 36, name_bn: 'গদ্য', name_en: 'Prose', class_level_ids: [8], topics: [{ id: 58, name_bn: 'অপরিচিতা', name_en: 'The Unknown Woman' }] }] },
  ],
  curriculum_versions: [
    { id: 90, qb_subject_id: 18, version_key: 'eng-v1', name_bn: 'ইংরেজি সিলেবাস', name_en: 'English syllabus', class_level_ids: [8],
      nodes: [{ id: 91, kind: 'Unit', name_bn: 'ইউনিট ১', name_en: 'Unit 1', children: [{ id: 92, kind: 'Lesson', name_bn: 'পাঠ ১', name_en: 'Lesson 1', children: [] }] }] },
    { id: 93, qb_subject_id: 19, version_key: 'bn-v1', name_bn: 'বাংলা সিলেবাস', name_en: 'Bangla syllabus', class_level_ids: [8],
      nodes: [{ id: 94, kind: 'Text', name_bn: 'অপরিচিতা', name_en: 'The Unknown Woman', children: [] }] },
  ],
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter><QbImports /></MemoryRouter></QueryClientProvider>)
}

describe('writer import AI prompt', () => {
  afterEach(() => vi.clearAllMocks())

  it('builds the prompt from the latest selected curriculum and preserves import controls', async () => {
    api.get.mockImplementation(url => Promise.resolve({ data: url === '/writer/curriculum' ? { data: curriculum }
      : url === '/writer/question-types' ? { data: [{ slug: 'mcq' }, { slug: 'creative' }, { slug: 'stimulus_mcq_group' }] }
        : { data: [] } }))
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'এআই প্রম্পট' }))
    const classSelect = await screen.findByLabelText('শ্রেণী')
    fireEvent.change(classSelect, { target: { value: '8' } })
    fireEvent.change(screen.getByLabelText('বিষয়'), { target: { value: '17' } })

    const output = await screen.findByTestId('qbi-prompt-output')
    await waitFor(() => expect(output.value).toContain('সংখ্যার প্যাটার্ন'))
    expect(output.value).toContain('exam-management.universal-content-json.v5')
    expect(output.value).toContain('Return exactly one raw UTF-8 JSON object')
    expect(output.value).toContain('Do not return an attachment or attachment reference')
    expect(output.value).toContain('Use \\( ... \\) for inline math and \\[ ... \\] for display math')
    expect(output.value).toContain('"question_number":"12"')
    expect(output.value).toContain('topic_proposals')
    expect(output.value).toContain('["mcq","creative","stimulus_mcq_group"]')

    // the syntax example is valid JSON: the ordinary MCQ stays, and a stimulus-based MCQ shows its required fields
    const marker = 'replace every sample value and question with the requested content: '
    const start = output.value.indexOf(marker) + marker.length
    const example = JSON.parse(output.value.slice(start, output.value.indexOf('\n\nOnly transcribe', start)))
    expect(example.schema_version).toBe('exam-management.universal-content-json.v5')
    const [mcq, stimulusMcq] = example.questions
    expect(mcq.question_type).toBe('mcq')
    expect(mcq.options.filter(o => o.is_correct)).toHaveLength(1)
    expect(stimulusMcq.question_type).toBe('stimulus_mcq_group')
    expect(stimulusMcq.stimulus_text).toBeTruthy()
    expect(stimulusMcq.options).toBeUndefined()
    expect(stimulusMcq.settings).toEqual({ class_levels: [{ id: 8, name: 'অষ্টম শ্রেণী' }], subject: { id: 17, name: 'গণিত' } })
    expect(stimulusMcq.items.length).toBeGreaterThanOrEqual(2)   // several MCQs under one stimulus, as printed (e.g. questions 22-24)
    for (const item of stimulusMcq.items) {
      expect(item).toMatchObject({ item_type: 'sub_mcq', stimulus_index: 0 })
      expect(item.prompt_text).toBeTruthy()
      expect(item.prompt_json.options.length).toBeGreaterThanOrEqual(2)
      expect(Number.isInteger(item.answer_json.correct)).toBe(true)
      expect(item.answer_json.correct).toBeGreaterThanOrEqual(0)
      expect(item.answer_json.correct).toBeLessThan(item.prompt_json.options.length)
    }
    expect(output.value).toContain('question_type "stimulus_mcq_group"')
    expect(screen.getByRole('button', { name: 'Schema ডাউনলোড' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /JSON উদাহরণ/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /TOON উদাহরণ/ })).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('বিষয়'), { target: { value: '18' } })
    await waitFor(() => expect(output.value).toContain('document.language to "en"'))
    expect(output.value).toContain('"en"')
    expect(output.value).toContain('ইংরেজি ১ম পত্র')
    expect(output.value).toContain('Comprehension')
    expect(output.value).toContain('curriculum_node_ids')
    expect(output.value).toContain('"id":91')
    expect(output.value).toContain('"id":92')
    expect(output.value).not.toContain('সংখ্যার প্যাটার্ন')

    fireEvent.change(screen.getByLabelText('বিষয়'), { target: { value: '19' } })
    await waitFor(() => expect(output.value).toContain('document.language to "bn"'))
    expect(output.value).toContain('বাংলা ১ম পত্র')
    expect(output.value).toContain('অপরিচিতা')
    expect(output.value).toContain('"id":94')
    expect(output.value).not.toContain('ইউনিট ১')
    expect(output.value).not.toContain('Comprehension')
  })
})
