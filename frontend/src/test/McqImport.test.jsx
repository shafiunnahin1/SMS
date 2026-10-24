import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '../i18n'
import api from '../api/axios'
import McqImport from '../features/exams/McqImport'
import { aiPrompt, parseJsonRows } from '../features/exams/mcqImport'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))

const rows = [{ student_id: 1, roll_no: 1, batch: 'A', name: 'Mine' }, { student_id: 2, roll_no: 2, batch: 'A', name: 'Other' }]

// D158 (5): the AI prompt carries the student list, the full marks and a JSON example; the pasted answer is previewed, then saved
describe('MCQ import (D158)', () => {
  afterEach(() => vi.clearAllMocks())

  it('builds a prompt with every student and a JSON example, and reads fenced or bare answers', () => {
    const p = aiPrompt({ exam: 'Half yearly', subject: 'Physics', rows, full: 30 })
    expect(p).toContain('MCQ full marks: 30')
    expect(p).toContain('1\tA\tMine')
    expect(p).toContain('2\tA\tOther')
    expect(p).toContain('"results"')
    expect(parseJsonRows('```json\n{"results":[{"roll":2,"mcq":21}]}\n```')).toEqual([{ roll: '2', mcq: 21 }])
    expect(parseJsonRows('[{"roll":"1","batch":"A","mcq":3}]')).toEqual([{ roll: '1', batch: 'A', mcq: 3 }])
    expect(() => parseJsonRows('{"x":1}')).toThrow()
  })

  it('previews first and saves only after the second click', async () => {
    api.post.mockResolvedValueOnce({ data: { data: { mcq_full: 30, saved: 0, rows: [{ line: 1, roll: '2', name: 'Other', mcq: 21, status: 'ok' }, { line: 2, roll: '9', name: null, mcq: 5, status: 'unknown_roll' }] } } })
      .mockResolvedValueOnce({ data: { data: { mcq_full: 30, saved: 1, rows: [] } } })
    const onSaved = vi.fn()
    render(<McqImport examId="4" subjectId="7" exam="E" subject="S" rows={rows} full={30} onSaved={onSaved} />)
    fireEvent.change(screen.getByRole('textbox', { name: /JSON/ }), { target: { value: '{"results":[{"roll":"2","mcq":21},{"roll":"9","mcq":5}]}' } })
    fireEvent.click(screen.getByText(/যাচাই|Check/))
    await screen.findByTestId('mcq-preview')
    expect(api.post).toHaveBeenLastCalledWith('/exams/4/subjects/7/mcq-import', { source: 'json', save: false, rows: [{ roll: '2', mcq: 21 }, { roll: '9', mcq: 5 }] })
    expect(document.querySelectorAll('[data-status="unknown_roll"]')).toHaveLength(1)
    fireEvent.click(document.querySelector('[data-action="save-import"]'))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(api.post.mock.calls[1][1].save).toBe(true)
  })
})
