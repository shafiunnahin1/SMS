import { describe, it, expect } from 'vitest'
import { occurrenceToSource, questionCode, sourceToOccurrence } from '../features/qb/questionMeta'

// D73 (QB.13): qbank's question code and the source history in the existing occurrence fields
describe('question meta', () => {
  it('builds qbank-style codes', () => {
    expect(questionCode('creative_question', 1)).toBe('QAE-CQ-000001')
    expect(questionCode('mcq', 12)).toBe('QAE-MCQ-000012')
    expect(questionCode('cloze_test_with_clues', 7)).toBe('QAE-CTWC-000007')
    expect(questionCode('creative', 3)).toBe('QAE-CQ-000003')
    expect(questionCode('mcq', null)).toBeNull()
  })
  it('keeps a source row through the occurrence fields', () => {
    const s = { type: 'board', full: 'ঢাকা বোর্ড', short: 'ঢা.বো.', exam_type: 'SSC', year: '2023' }
    expect(sourceToOccurrence(s)).toEqual({ note: 'board', institution_name: 'ঢাকা বোর্ড', board: 'ঢা.বো.', exam_type: 'SSC', question_number: null, set_label: null, page_reference: null, year: 2023 })
    expect(occurrenceToSource(sourceToOccurrence(s))).toEqual({ ...s, question_number: '', set_label: '', page_reference: '' })
  })
})
