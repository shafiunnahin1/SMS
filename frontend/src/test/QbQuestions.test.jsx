import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import QbQuestions from '../pages/writer/QbQuestions'

vi.mock('../api/axios', () => ({ default: { get: vi.fn() }, bindAuthStore: () => {} }))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/writer/questions']}><QbQuestions /></MemoryRouter></QueryClientProvider>)
}

describe('writer question list cards', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { role: 'content_writer' }, role: 'content_writer' })
    api.get.mockImplementation((url) => Promise.resolve({ data:
      url === '/writer/curriculum' ? {
        data: {
          class_levels: [{ id: 1, name_bn: 'নবম শ্রেণি' }, { id: 4, name_bn: 'অষ্টম শ্রেণি' }],
          subjects: [{ id: 3, name_bn: 'পদার্থবিজ্ঞান', class_level_ids: [1], chapters: [{ id: 4, name_bn: 'গতি', number: 2, topics: [{ id: 5, name_bn: 'বেগ' }] }] }],
        },
      } : url === '/writer/question-types' ? { data: [{ id: 2, name_bn: 'বহুনির্বাচনি' }] } : {
        data: [{ id: 7, qb_question_type_id: 2, qb_subject_id: 3, qb_chapter_id: 4, qb_topic_id: 5, class_level_ids: [4], marks: '1.00', difficulty: 2, question_text: '<p>বেগের একক কী?</p>', answer_text: 'দূরত্ব ÷ সময়', explanation_text: 'এককটি মিটার/সেকেন্ড।', options: [{ label: 'ক', content_text: 'মিটার', is_correct: false }, { label: 'খ', content_text: 'মিটার/সেকেন্ড', is_correct: true }], creative_parts: [], items: [], occurrences: [], media: [], status: 'draft', author: 'লেখক' }],
        meta: { current_page: 1, last_page: 1, total: 1, per_page: 16, facets: { question_types: [{ id: 2, name_bn: 'বহুনির্বাচনি' }], source_types: ['board'], years: [2024] } },
      },
    }))
  })
  afterEach(() => vi.clearAllMocks())

  it('shows qbank-style question cards beside the search filter and keeps search behavior', async () => {
    renderPage()

    expect(await screen.findByTestId('qb-question-filter')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'প্রশ্ন খুঁজুন' })).toBeInTheDocument()
    expect(await screen.findByText('প্রশ্ন #7')).toBeInTheDocument()
    expect(screen.getByTestId('qb-questions').querySelector('[data-question="7"]')).toBeInTheDocument()
    expect(screen.getByTestId('qb-questions')).toHaveTextContent('বেগের একক কী?')
    expect(screen.getByTestId('qb-questions')).toHaveTextContent('প্রশ্ন #7')
    expect(await screen.findByText('বহুনির্বাচনি')).toBeInTheDocument()
    expect(screen.getByTestId('qb-questions')).toHaveTextContent('পদার্থবিজ্ঞান')
    expect(screen.getByTestId('qb-questions')).toHaveTextContent('অধ্যায় 2 — গতি')
    expect(screen.getByTestId('qb-questions')).toHaveTextContent('শ্রেণি: অষ্টম শ্রেণি')
    expect(screen.getByTestId('qb-questions')).toHaveTextContent('নম্বর: 1.00')
    expect(screen.getByTestId('qb-questions')).toHaveTextContent('মিটার/সেকেন্ড')
    fireEvent.click(screen.getByRole('button', { name: 'উত্তর ও সমাধান দেখুন' }))
    expect(await screen.findByTestId('qb-answer')).toHaveTextContent('দূরত্ব ÷ সময়')
    expect(screen.getByTestId('qb-answer')).toHaveTextContent('এককটি মিটার/সেকেন্ড।')

    fireEvent.change(screen.getByRole('textbox', { name: 'খুঁজুন' }), { target: { value: 'বেগ' } })
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/writer/questions', expect.objectContaining({
      params: expect.objectContaining({ q: 'বেগ', page: 1 }),
    })))
    fireEvent.click(screen.getByRole('button', { name: 'শ্রেণি' }))
    fireEvent.click(screen.getByLabelText('নবম শ্রেণি'))
    await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/writer/questions', expect.objectContaining({
      params: expect.objectContaining({ class_level_ids: [1], q: 'বেগ' }),
    })))
  })

  it('shows gap-fill answers as readable accepted words instead of raw JSON', async () => {
    const defaultGet = api.get.getMockImplementation()
    api.get.mockImplementation(url => defaultGet(url).then(response => {
      if (url === '/writer/questions') {
        response.data.data[0].question_text = '<p>শূন্যস্থান (a) _____ পূরণ</p>'
        response.data.data[0].stimuli = [{ label: 'word_box', content_text: '<table><tbody><tr><th>শব্দ ১</th><th>শব্দ ২</th></tr></tbody></table>' }]
        response.data.data[0].items = [{ item_type: 'gap', prompt_json: { hint: 'মূল শব্দ' }, answer_json: { answers: ['জল', 'পানি'] } }]
      }
      return response
    }))
    renderPage()

    const questionList = screen.getByTestId('qb-questions')
    await waitFor(() => expect(questionList).toHaveTextContent('(a) ━━━━ (মূল শব্দ)'))
    const cardText = questionList.querySelector('[data-question="7"]').parentElement.textContent
    expect(cardText.indexOf('শব্দ ১')).toBeLessThan(cardText.indexOf('শূন্যস্থান'))
    fireEvent.click(await screen.findByRole('button', { name: 'উত্তর ও সমাধান দেখুন' }))
    const answer = await screen.findByTestId('qb-answer')
    expect(answer).toHaveTextContent('(a) জল, পানি')
    expect(answer).not.toHaveTextContent('{"answers"')
  })

  it('loads the mapped language-paper curriculum from the selected class and subject in parent-first order', async () => {
    api.get.mockImplementation(url => {
      if (url === '/writer/curriculum') return Promise.resolve({ data: { data: {
        class_levels: [{ id: 9, name_bn: 'নবম শ্রেণি' }, { id: 10, name_bn: 'দশম শ্রেণি' }],
        subjects: [{ id: 22, name_bn: 'ইংরেজি ১ম পত্র', name_en: 'English 1st Paper', class_level_ids: [9, 10], chapters: [] }],
        curriculum_versions: [
          { id: 101, qb_subject_id: 22, version_key: 'grade-9-10', name_bn: 'নবম-দশম', name_en: 'Classes 9–10', is_active: true, class_level_ids: [9, 10], nodes: [{ id: 201, kind: 'Part', name_bn: 'গদ্য', name_en: 'Prose', children: [{ id: 202, kind: 'Lesson', name_bn: 'পাঠ ১', name_en: 'Lesson 1', parent_id: 201, children: [{ id: 203, kind: 'Topic', name_bn: 'মূলভাব', name_en: 'Main idea', parent_id: 202, children: [] }] }] }] },
          { id: 102, qb_subject_id: 22, version_key: 'grade-6-8', name_bn: 'ষষ্ঠ-অষ্টম', name_en: 'Classes 6–8', is_active: true, class_level_ids: [6, 7, 8], nodes: [{ id: 301, kind: 'Part', name_bn: 'পুরনো কাঠামো', name_en: 'Other structure', children: [] }] },
        ],
      } } })
      if (url === '/writer/question-types') return Promise.resolve({ data: { data: [] } })
      return Promise.resolve({ data: { data: [], meta: { current_page: 1, last_page: 1, total: 0, per_page: 16, facets: { question_types: [], source_types: [], years: [] } } } })
    })
    renderPage()

    fireEvent.click(await screen.findByRole('button', { name: 'শ্রেণি' }))
    fireEvent.click(await screen.findByText('নবম শ্রেণি'))
    fireEvent.click(screen.getByTestId('qb-question-filter').querySelector('[data-filter="subject"] button'))
    fireEvent.click(await screen.findByText('ইংরেজি ১ম পত্র'))

    const root = await screen.findByRole('combobox', { name: 'সিলেবাসের স্তর 1' })
    expect(root).toHaveTextContent('গদ্য')
    expect(root).not.toHaveTextContent('পুরনো কাঠামো')
    fireEvent.change(root, { target: { value: '201' } })
    const lesson = await screen.findByRole('combobox', { name: 'সিলেবাসের স্তর 2' })
    expect(lesson).toHaveTextContent('পাঠ ১')
    fireEvent.change(lesson, { target: { value: '202' } })
    const topic = await screen.findByRole('combobox', { name: 'সিলেবাসের স্তর 3' })
    expect(topic).toHaveTextContent('মূলভাব')
  })

  it('groups a seen passage and every structured item type, then reveals readable answers', async () => {
    const passageQuestion = {
      id: 24, qb_question_type_id: 9, qb_subject_id: 3, qb_chapter_id: null, qb_topic_id: null,
      class_level_ids: [1], marks: '12.00', difficulty: 3, status: 'draft', author: 'লেখক',
      question_text: 'Read the passage and answer Sections A and B.', answer_text: null, explanation_text: null,
      creative_parts: [], options: [], media: [], occurrences: [], curriculum_breadcrumbs: [],
      stimuli: [{ label: 'passage', content_text: 'Behula was devoted and brave.' }],
      items: [
        { item_type: 'sub_mcq', prompt_text: 'Who was Behula?', prompt_json: { options: ['A queen', 'A heroine'] }, answer_json: { correct: 1 }, marks: '1.00' },
        { item_type: 'sub_question', prompt_text: 'Why was she brave?', answer_json: { answer_text: 'She endured a dangerous journey.' }, marks: '2.00' },
        { item_type: 'gap', prompt_text: 'Behula was (a) _____.', prompt_json: { hint: 'courage' }, answer_json: { answers: ['brave'] }, marks: '1.00' },
        { item_type: 'true_false', prompt_text: 'Behula gave up her journey.', answer_json: { value: false, correction: 'She continued her journey.' }, marks: '1.00' },
        { item_type: 'table_fill', prompt_json: { table: { columns: ['Person', 'Quality'], rows: [['Behula', null]] } }, answer_json: { cells: { '0-1': ['devotion'] } }, marks: '1.00' },
        { item_type: 'match_pair', prompt_text: 'Behula', answer_json: { right: 'brave heroine' }, marks: '1.00' },
        { item_type: 'match_triple', prompt_text: 'Behula', answer_json: { middle: 'showed', right: 'devotion' }, marks: '1.00' },
        { item_type: 'multi_field', prompt_text: 'Explain', prompt_json: { fields: ['quality'] }, answer_json: { values: ['devotion'] }, marks: '1.00' },
        { item_type: 'order_step', prompt_text: 'Reached the gods', answer_json: { position: 2 }, marks: '1.00' },
        { item_type: 'order_step', prompt_text: 'Began the journey', answer_json: { position: 1 }, marks: '1.00' },
      ],
    }
    const genericSubjectQuestion = { ...passageQuestion, id: 25, qb_subject_id: 4, question_text: 'A Bangla passage question.', items: passageQuestion.items.slice(0, 2) }
    const genericTypeQuestion = { ...passageQuestion, id: 26, qb_question_type_id: 10, question_text: 'An English reading question.', items: passageQuestion.items.slice(0, 2) }
    api.get.mockImplementation(url => url === '/writer/curriculum'
      ? Promise.resolve({ data: { data: { class_levels: [], subjects: [
        { id: 3, name_bn: 'ইংরেজি ১ম পত্র', name_en: 'English 1st Paper', class_level_ids: [], chapters: [] },
        { id: 4, name_bn: 'বাংলা ১ম পত্র', name_en: 'Bangla 1st Paper', class_level_ids: [], chapters: [] },
      ], curriculum_versions: [] } } })
      : url === '/writer/question-types'
        ? Promise.resolve({ data: { data: [
          { id: 9, slug: 'seen_passage', name_bn: 'সিন প্যাসেজ', name_en: 'Seen Passage', structure: 'passage' },
          { id: 10, slug: 'reading_passage', name_bn: 'প্যাসেজ', name_en: 'Passage', structure: 'passage' },
        ] } })
        : Promise.resolve({ data: { data: [passageQuestion, genericSubjectQuestion, genericTypeQuestion], meta: { current_page: 1, last_page: 1, total: 3, per_page: 16, facets: { question_types: [], source_types: [], years: [] } } } }))
    renderPage()

    await screen.findByText('Read the passage and answer Sections A and B.')
    const card = document.querySelector('[data-question="24"]')
    const genericSubjectCard = document.querySelector('[data-question="25"]')
    const genericTypeCard = document.querySelector('[data-question="26"]')
    expect(card).toHaveTextContent('A. Choose the correct answer from the alternatives:')
    expect(card).toHaveTextContent('B. Answer the following questions:')
    for (const genericCard of [genericSubjectCard, genericTypeCard]) {
      expect(genericCard).toHaveTextContent('A. বহুনির্বাচনী (MCQ)')
      expect(genericCard).toHaveTextContent('B. প্রশ্নের উত্তর')
    }
    expect([...card.querySelectorAll('[data-option-label]')].map(option => option.dataset.optionLabel)).toEqual(['ক', 'খ'])
    expect(card).toHaveTextContent('Behula was (a)')
    expect(card).toHaveTextContent('Behula gave up her journey.')
    expect(card).toHaveTextContent('Person')
    expect(card).toHaveTextContent('Explain')
    expect(card).toHaveTextContent('Reached the gods')
    expect(card).toHaveTextContent('Began the journey')
    expect(card).not.toHaveTextContent('She endured a dangerous journey.')
    expect(card).not.toHaveTextContent('brave heroine')
    expect(card).not.toHaveTextContent('She continued her journey.')
    expect(card).not.toHaveTextContent('showed')
    expect(card).not.toHaveTextContent('quality')
    expect(card).not.toHaveTextContent('devotion')

    fireEvent.click(card.querySelector('[data-action="toggle-answer"]'))
    const answer = await screen.findByTestId('qb-answer')
    expect(answer).toHaveTextContent('A. Choose the correct answer from the alternatives:')
    expect(answer).toHaveTextContent('B. Answer the following questions:')
    expect(answer).toHaveTextContent('(খ) A heroine')
    expect(answer).toHaveTextContent('She endured a dangerous journey.')
    expect(answer).toHaveTextContent('brave')
    expect(answer).toHaveTextContent('She continued her journey.')
    expect(answer).toHaveTextContent('devotion')
    expect(answer).toHaveTextContent('Began the journey')
    expect(answer).toHaveTextContent('Behula — brave heroine')
    expect(answer).toHaveTextContent('Behula — showed — devotion')
    expect(answer).toHaveTextContent('quality: devotion')
    expect(answer.textContent.indexOf('Began the journey')).toBeLessThan(answer.textContent.indexOf('Reached the gods'))
    expect(answer).not.toHaveTextContent(/\\{\\\"/)
    expect(answer).not.toHaveTextContent('{"correct"')
    expect(answer).not.toHaveTextContent('[object Object]')
  })

  it('does not repeat a passage embedded in the parent question text', async () => {
    const passage = 'একদল শিকারি গ্রামে এসে পাখি দেখতে পেল।'
    const question = {
      id: 113, qb_question_type_id: 9, qb_subject_id: 3, qb_chapter_id: null, qb_topic_id: null,
      class_level_ids: [4], marks: '1.00', difficulty: 2, status: 'draft', author: 'লেখক',
      question_text: `উদ্দীপকটি পড়ে উত্তর দাও: ${passage} কোন চরণে এই ভাবটি আছে?`,
      answer_text: null, explanation_text: null, creative_parts: [], options: [], media: [], occurrences: [], curriculum_breadcrumbs: [],
      stimuli: [{ label: 'stimulus', content_text: passage }],
      items: [{ item_type: 'sub_mcq', prompt_text: 'কোন চরণে এই ভাবটি আছে?',
        prompt_json: { options: ['প্রথম চরণ', 'দ্বিতীয় চরণ'] }, answer_json: { correct: 0 }, marks: '1.00' }],
    }
    api.get.mockImplementation(url => url === '/writer/curriculum'
      ? Promise.resolve({ data: { data: { class_levels: [{ id: 4, name_bn: 'অষ্টম শ্রেণি' }], subjects: [{ id: 3, name_bn: 'বাংলা ১ম পত্র', class_level_ids: [4], chapters: [] }], curriculum_versions: [] } } })
      : url === '/writer/question-types'
        ? Promise.resolve({ data: { data: [{ id: 9, slug: 'stimulus_mcq_group', name_bn: 'উদ্দীপকভিত্তিক বহুনির্বাচনী প্রশ্ন', structure: 'passage_mcq' }] } })
        : Promise.resolve({ data: { data: [question], meta: { current_page: 1, last_page: 1, total: 1, per_page: 16, facets: { question_types: [], source_types: [], years: [] } } } }))
    renderPage()

    await screen.findByText('প্রথম চরণ')
    const card = document.querySelector('[data-question="113"]')
    expect(card.textContent.split(passage).length - 1).toBe(1)
    expect(card).toHaveTextContent('উদ্দীপকটি পড়ে উত্তর দাও:')
    expect(card).toHaveTextContent('কোন চরণে এই ভাবটি আছে?')
    expect(card).not.toHaveTextContent('সঠিক')
  })
})
