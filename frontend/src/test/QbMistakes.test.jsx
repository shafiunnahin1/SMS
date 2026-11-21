import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import QbMistakes from '../pages/student/QbMistakes'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() }, bindAuthStore: () => {} }))
const at = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const tree = { subjects: [{ id: 1, name_en: 'Maths', name_bn: 'গণিত', chapters: [{ id: 11, name_en: 'Ch 1', name_bn: '১' }] }] }
const q = (id) => ({ id, question_text: `Q${id}`, options: [{ label: 'A', content_text: '4' }, { label: 'B', content_text: '5' }] })
const list = [{ question: q(7), subject: { id: 1, name_en: 'Maths' }, chapter: { id: 11, name_en: 'Ch 1' }, your_answer: 'B', times_wrong: 2, last_wrong_at: '2026-11-21T09:00:00+06:00', can_practise: true },
  { question: { id: 8, question_text: 'Fill the gap' }, subject: { id: 1, name_en: 'Maths' }, chapter: null, your_answer: ['x'], times_wrong: 1, last_wrong_at: '2026-11-20T09:00:00+06:00', can_practise: false }]

// D238 MST.2: the list (no right answer), filters, practise from the list (needs a subject), the round's result
describe('my mistakes screen (D238)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {} })
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/student/qb/curriculum' ? tree : list } }))
    api.post.mockImplementation((u) => Promise.resolve({ data: { data: u === '/student/qb/mistakes/practice' ? { id: 31, questions: [q(7)] }
      : { id: 31, total: 1, correct: 1, results: [{ question_id: 7, chosen: 'A', is_right: true, question: { ...q(7), options: [{ label: 'A', content_text: '4', is_correct: true }, { label: 'B', content_text: '5', is_correct: false }], explanation_text: '2+2=4' } }] } } }))
  })

  it('lists the mistakes and filters by subject and chapter', async () => {
    at(<QbMistakes />)
    const rows = await screen.findAllByTestId('mistake')
    expect(rows[0]).toHaveTextContent('Your answer: B')
    expect(rows[0]).toHaveTextContent('Wrong 2 time(s)')
    expect(rows[1]).toHaveTextContent('not a multiple-choice practice question')
    expect(document.querySelector('[data-action=practise]')).toBeDisabled()
    fireEvent.change(document.querySelector('[name=subject]'), { target: { value: '1' } })
    fireEvent.change(document.querySelector('[name=chapter]'), { target: { value: '11' } })
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/student/qb/mistakes', { params: { qb_subject_id: '1', qb_chapter_id: '11' } }))
  })

  it('practises the mistakes and shows the result after marking', async () => {
    at(<QbMistakes />)
    await screen.findAllByTestId('mistake')
    fireEvent.change(document.querySelector('[name=subject]'), { target: { value: '1' } })
    await waitFor(() => expect(document.querySelector('[data-action=practise]')).not.toBeDisabled())
    fireEvent.click(document.querySelector('[data-action=practise]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/student/qb/mistakes/practice', { qb_subject_id: 1, qb_chapter_id: null }))
    const round = await screen.findByTestId('mistake-round')
    expect(round).not.toHaveTextContent('2+2=4')
    fireEvent.click(round.querySelector('input[value=A]'))
    fireEvent.click(round.querySelector('[data-action=submit]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/student/qb/practice/31/submit', { answers: { 7: 'A' } }))
    expect(await screen.findByTestId('mistake-result')).toBeInTheDocument()
    expect(screen.getByTestId('mistake-round')).toHaveTextContent('Right now - off your list')
    expect(screen.getByTestId('mistake-round')).toHaveTextContent('2+2=4')
  })
})
