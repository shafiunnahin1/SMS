import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '../i18n'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import QbQuestionEdit from '../pages/writer/QbQuestionEdit'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() }, bindAuthStore: () => {} }))

// D142 R2.1.2-gap-fill-authoring: Bangla passages take inline blanks like any other (the passage follows the text direction), the
// answer key shows only in the writer's answer preview, and a question written the old way (one sentence per blank) still opens
// with each sentence editable next to its own answer.
const base = { id: 6, qb_question_type_id: 1, qb_subject_id: 1, qb_chapter_id: null, qb_topic_id: null, difficulty: 3, marks: '1.00', language: 'bn',
  content_mode: 'mixed', answer_text: '', explanation_text: '', status: 'draft', review_note: null, created_by: 1, class_level_ids: [], options: [],
  creative_parts: [], occurrences: [], media: [], stimuli: [] }

function open(question) {
  api.get.mockImplementation(url => Promise.resolve({ data: url === '/writer/curriculum' ? { data: { class_levels: [], subjects: [] } }
    : url === '/writer/question-types' ? { data: [{ id: 1, slug: 'gap_fill', name_bn: 'শূন্যস্থান', name_en: 'Gap fill', family: 'fill_gap', structure: 'gap' }] }
      : url === '/writer/questions/6/revisions' ? { data: [] } : { data: { ...base, ...question } } }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/writer/questions/6']}><Routes><Route path="/writer/questions/:id" element={<QbQuestionEdit />} /></Routes></MemoryRouter></QueryClientProvider>)
}

describe('inline gap-fill authoring (D142)', () => {
  beforeEach(() => useAuthStore.setState({ user: { role: 'content_writer' }, role: 'content_writer' }))

  it('adds blanks inside a Bangla passage, in order, each with its own answer', async () => {
    open({ question_text: 'বাংলাদেশ একটি দেশ।', items: [] })
    const box = await screen.findByTestId('qb-gaps')
    const passage = screen.getByRole('textbox', { name: 'প্রশ্ন' })
    expect(passage).toHaveAttribute('dir', 'auto')
    passage.setSelectionRange(9, 9)
    fireEvent.click(box.querySelector('[data-action="add-gap-blank"]'))
    passage.setSelectionRange(passage.value.length - 1, passage.value.length - 1)
    fireEvent.click(box.querySelector('[data-action="add-gap-blank"]'))
    expect(passage.value).toBe('বাংলাদেশ (a) — একটি দেশ (b) — ।')   // a space keeps the blank apart from the next text
    fireEvent.change(box.querySelector('[name="structured.gaps.0.answers"]'), { target: { value: 'নদীমাতৃক' } })
    fireEvent.change(box.querySelector('[name="structured.gaps.1.answers"]'), { target: { value: 'স্বাধীন' } })
    expect(screen.getByTestId('qb-gap-passage-preview').textContent).toMatch(/বাংলাদেশ\s*\(a\)\s*—.*\(b\)\s*—/)
    expect([...box.querySelectorAll('input[name$=".answers"]')].map(i => i.value)).toEqual(['নদীমাতৃক', 'স্বাধীন'])
  })

  it('opens an old sentence-per-blank question with each sentence editable next to its answer', async () => {
    open({ question_text: 'Fill in the blanks.', items: [
      { item_type: 'gap', prompt_text: 'He (a) ___ to', answer_json: { answers: ['went'] }, prompt_json: null, marks: '1.00' },
      { item_type: 'gap', prompt_text: '(b) ___ at nine.', answer_json: { answers: ['school'] }, prompt_json: null, marks: '1.00' },
    ] })
    const box = await screen.findByTestId('qb-gaps')
    const sentences = [...box.querySelectorAll('textarea[name$=".prompt"]')]
    expect(sentences.map(s => s.value)).toEqual(['He (a) ___ to', '(b) ___ at nine.'])
    expect([...box.querySelectorAll('input[name$=".answers"]')].map(i => i.value)).toEqual(['went', 'school'])
    fireEvent.change(sentences[1], { target: { value: '(b) ___ at ten.' } })
    expect(screen.getByTestId('qb-structured-preview')).toHaveTextContent('at ten.')
  })
})
