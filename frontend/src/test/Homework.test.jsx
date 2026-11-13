import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import HomeworkTeacher from '../pages/homework/HomeworkTeacher'
import HomeworkStudent from '../pages/homework/HomeworkStudent'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const hw = { id: 5, title: 'Essay', subject: { name: 'Bangla' }, program: { name: 'Class 10' }, batch: { name: 'A' }, due_date: '2026-11-20', has_file: false }

// D212 HW.2: the teacher gives homework for a subject they teach (FormData), marks a paper hand-in and grades; a student submits text
describe('homework (D212 HW.2)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ openConfirm: (c) => c.onConfirm() })
    useAuthStore.setState({ user: { role: 'teacher' } })
  })

  it('gives homework, marks paper and grades', async () => {
    api.get.mockImplementation((u) => Promise.resolve({ data: u === '/homework/options'
      ? { data: { subjects: [{ id: 3, name: 'Bangla', program: { id: 1, name: 'Class 10' }, batch_ids: null }], batches: [{ id: 7, name: 'A', program_id: 1 }], teachers: [] } }
      : u === '/homework' ? { data: [hw] }
      : { data: [{ student: { id: 11, name: 'Rafi', student_id: 'S-1' }, submission: null }, { student: { id: 12, name: 'Mim', student_id: 'S-2' }, submission: { id: 90, status: 'submitted', text_answer: 'My school', has_file: false, on_paper: false } }], meta: { submitted: 1, total: 2 } } }))
    api.post.mockResolvedValue({ data: { data: {} } })
    wrap(<HomeworkTeacher />)
    fireEvent.click(await screen.findByText('New homework'))
    const form = screen.getByTestId('hw-form')
    await waitFor(() => expect(form.querySelector('[name=subject_id] option[value="3"]')).not.toBeNull())
    fireEvent.change(form.querySelector('[name=subject_id]'), { target: { value: '3' } })
    fireEvent.change(form.querySelector('[name=batch_id]'), { target: { value: '7' } })
    fireEvent.change(form.querySelector('[name=title]'), { target: { value: 'Essay' } })
    fireEvent.click(form.querySelector('[data-action=save]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/homework', expect.any(FormData)))
    const fd = api.post.mock.calls[0][1]
    expect([fd.get('program_id'), fd.get('subject_id'), fd.get('batch_id'), fd.get('title')]).toEqual(['1', '3', '7', 'Essay'])

    fireEvent.click(screen.getByText('Submissions'))
    const subs = await screen.findByTestId('hw-submissions')
    expect(subs).toHaveTextContent('1 of 2 submitted')
    fireEvent.click(screen.getByText('Handed in on paper'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/homework/5/paper', { student_id: 11 }))
    fireEvent.change(subs.querySelector('[name="grade-12"]'), { target: { value: 'A+' } })
    fireEvent.click(subs.querySelector('[data-action=grade]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/homework/submissions/90/grade', { grade: 'A+', feedback: null }))
  })

  it('a student submits a text answer', async () => {
    useAuthStore.setState({ user: { role: 'student' } })
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/student/homework' ? [hw] : [] } }))
    api.post.mockResolvedValue({ data: { data: {} } })
    wrap(<HomeworkStudent />)
    fireEvent.click(await screen.findByText('Submit'))
    fireEvent.change(screen.getByTestId('submit-form').querySelector('[name=text_answer]'), { target: { value: 'My school is...' } })
    fireEvent.click(screen.getByTestId('submit-form').querySelector('[data-action=submit]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/homework/5/submit', expect.any(FormData)))
    expect(api.post.mock.calls[0][1].get('text_answer')).toBe('My school is...')
  })
})
