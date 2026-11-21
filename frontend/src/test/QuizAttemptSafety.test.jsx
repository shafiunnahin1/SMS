import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import QbQuizAttempt, { isAnswered } from '../pages/student/QbQuizAttempt'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() }, bindAuthStore: () => {} }))
const q = (id) => ({ id, question_text: `Question ${id}`, options: [{ label: 'A', text: 'a' }, { label: 'B', text: 'b' }] })
const running = (o = {}) => ({ id: 5, title: 'Physics', submitted_at: null, deadline: new Date(Date.now() + 600e3).toISOString(), given: {}, questions: [q(1), q(2), q(3)], ...o })
const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms) }) }
const open = () => {
  const router = createMemoryRouter([{ path: '/student/quizzes/:id', element: <QbQuizAttempt /> }, { path: '/student/quizzes', element: <p>list</p> }], { initialEntries: ['/student/quizzes/5'] })
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>)
  return router
}
const pick = (qid, label) => fireEvent.click(document.querySelector(`[data-question="${qid}"] input[value="${label}"]`))

// D237 QZ.1: confirm with counts before submit, a visible save status, failed saves keep the answers and retry, warn before leaving
describe('safer quiz submit (D237)', () => {
  let confirm
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    for (const f of ['get', 'post', 'put']) api[f].mockReset()
    i18n.changeLanguage('en')
    confirm = null
    useUiStore.setState({ addToast: () => {}, openConfirm: (c) => { confirm = c } })
    api.get.mockResolvedValue({ data: { data: running() } })
    api.post.mockResolvedValue({ data: { data: running({ submitted_at: '2026-11-21T10:00:00Z', score: 1, total: 3, passed: null, review: [] }) } })
  })
  afterEach(() => { vi.useRealTimers() })

  it('counts answers: text, choices, lists and parts', () => {
    expect([isAnswered(null), isAnswered(''), isAnswered('A'), isAnswered(['', null]), isAnswered(['', 'x']), isAnswered({ a: '' }), isAnswered({ a: 'y' })])
      .toEqual([false, false, true, false, true, false, true])
  })

  it('submit asks first and lists the unanswered questions; going back submits nothing', async () => {
    api.put.mockResolvedValue({ data: { data: {} } })
    open()
    await screen.findByTestId('qb-attempt')
    pick(2, 'B')
    await flush(900)
    expect(api.put).toHaveBeenCalledWith('/student/qb/attempts/5', { answers: { 2: 'B' } })
    expect(screen.getByTestId('quiz-save')).toHaveAttribute('data-state', 'saved')
    fireEvent.click(document.querySelector('[data-action=submit-quiz]'))
    expect(api.post).not.toHaveBeenCalled()
    expect(confirm.description).toContain('Answered 1 of 3; 2 left.')
    expect(confirm.description).toContain('Unanswered: 1, 3.')
    await act(async () => { await confirm.onConfirm() })
    expect(api.post).toHaveBeenCalledWith('/student/qb/attempts/5/submit', { answers: { 2: 'B' } })
  })

  it('a failed save keeps the answer on the page, shows it, retries and warns before leaving', async () => {
    api.put.mockRejectedValueOnce({ response: undefined }).mockResolvedValue({ data: { data: {} } })
    const router = open()
    await screen.findByTestId('qb-attempt')
    pick(1, 'A')
    expect(screen.getByTestId('quiz-save')).toHaveAttribute('data-state', 'saving')
    await flush(900)
    expect(screen.getByTestId('quiz-save')).toHaveAttribute('data-state', 'failed')
    expect(document.querySelector('[data-question="1"] input[value="A"]').checked).toBe(true)
    expect(api.get).toHaveBeenCalledTimes(1)
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await act(async () => { await router.navigate('/student/quizzes') })
    expect(ask).toHaveBeenCalled()
    expect(router.state.location.pathname).toBe('/student/quizzes/5')
    const ev = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    await flush(5100)
    expect(api.put).toHaveBeenCalledTimes(2)
    expect(api.put).toHaveBeenLastCalledWith('/student/qb/attempts/5', { answers: { 1: 'A' } })
    expect(screen.getByTestId('quiz-save')).toHaveAttribute('data-state', 'saved')
    ask.mockRestore()
  })

  it('time-up submits by itself without asking', async () => {
    api.get.mockResolvedValue({ data: { data: running({ deadline: new Date(Date.now() + 2000).toISOString() }) } })
    open()
    await screen.findByTestId('qb-attempt')
    await flush(3500)
    expect(confirm).toBeNull()
    expect(api.post).toHaveBeenCalledWith('/student/qb/attempts/5/submit', { answers: {} })
  })
})
