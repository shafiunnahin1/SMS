import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '../i18n'
import api from '../api/axios'
import SubmissionBar from '../features/exams/SubmissionBar'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))

// D162: the teacher submits a draft, asks to update with a reason once submitted; the head approves or declines a request
describe('marks submission bar (D162)', () => {
  afterEach(() => vi.clearAllMocks())

  it('a teacher submits a draft', async () => {
    api.post.mockResolvedValueOnce({ data: { data: { status: 'submitted' } } })
    const changed = vi.fn()
    const { container } = render(<SubmissionBar examId="3" subjectId="7" state={{ status: 'draft' }} isAdmin={false} onChanged={changed} />)
    fireEvent.click(container.querySelector('[data-action="submit-marks"]'))
    await waitFor(() => expect(changed).toHaveBeenCalled())
    expect(api.post).toHaveBeenCalledWith('/exams/3/subjects/7/submission', { action: 'submit' })
  })

  it('a submitted teacher must give a reason to ask for an update, and cannot submit', async () => {
    api.post.mockResolvedValueOnce({ data: { data: { status: 'unlock_requested' } } })
    const { container } = render(<SubmissionBar examId="3" subjectId="7" state={{ status: 'submitted' }} isAdmin={false} onChanged={() => {}} />)
    expect(container.querySelector('[data-action="submit-marks"]')).toBeNull()
    fireEvent.click(container.querySelector('[data-action="request-update"]'))
    const send = container.querySelector('[data-action="send-request"]')
    expect(send.disabled).toBe(true)
    fireEvent.change(container.querySelector('textarea[name="request_reason"]'), { target: { value: 'typo in roll 1' } })
    fireEvent.click(send)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/exams/3/subjects/7/submission', { action: 'request', reason: 'typo in roll 1' }))
  })

  it('the head sees the reason and approves', async () => {
    api.post.mockResolvedValueOnce({ data: { data: { status: 'unlocked' } } })
    const { container } = render(<SubmissionBar examId="3" subjectId="7" state={{ status: 'unlock_requested', request_reason: 'typo in roll 1' }} isAdmin onChanged={() => {}} />)
    expect(screen.getByText(/typo in roll 1/)).toBeTruthy()
    fireEvent.click(container.querySelector('[data-action="approve-request"]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/exams/3/subjects/7/submission', { action: 'approve' }))
  })
})
