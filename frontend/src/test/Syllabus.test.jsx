import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import SyllabusTeacher from '../pages/syllabus/SyllabusTeacher'
import SyllabusFamily from '../pages/syllabus/SyllabusFamily'
import StaffLessonPlans from '../pages/syllabus/StaffLessonPlans'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const assignment = { batch_id: 3, batch: 'A', program_id: 1, subject_id: 7, subject: 'Math', teacher_id: 9, teacher: 'Rahim' }
const coverage = { percent: '50.00', covered: 1, leaves: 2, tree: [{ id: 10, title: 'Fractions', term: '1st', leaf: false, covered: false, covered_on: null,
  children: [{ id: 11, title: 'Add', leaf: true, covered: true, covered_on: '2026-11-05', children: [] }, { id: 12, title: 'Subtract', leaf: true, covered: false, covered_on: null, children: [] }] }] }
const units = [{ id: 10, parent_id: null, title: 'Fractions' }, { id: 11, parent_id: 10, title: 'Add' }, { id: 12, parent_id: 10, title: 'Subtract' }]

// D224 SYL.3 / D225: the teacher ticks lessons and writes plans, staff write plans for a teacher, the family sees completed chapters
describe('syllabus screens (D224)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put', 'delete']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {}, openConfirm: (c) => c.onConfirm() })
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/lesson-plans/assignments' ? [assignment] : u === '/syllabus/coverage' ? coverage
      : u === '/syllabus/units' ? units : u === '/lesson-plans' ? [{ id: 5, batch_id: 3, subject_id: 7, unit_id: 12, planned_date: '2026-11-20', objective: 'Borrowing', status: 'planned' }] : [] } }))
    for (const f of ['post', 'delete']) api[f].mockResolvedValue({ data: { data: {} } })
  })

  it('the teacher sees the percent, ticks a lesson and marks a plan taught', async () => {
    wrap(<SyllabusTeacher />)
    expect(await screen.findByTestId('coverage-percent')).toHaveTextContent('50.00%')
    fireEvent.click(await screen.findByLabelText('Subtract'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/syllabus/coverage', { batch_id: 3, unit_id: 12 }))
    fireEvent.click(screen.getByLabelText('Add'))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/syllabus/coverage', { data: { batch_id: 3, unit_id: 11 } }))
    const plan = await screen.findByTestId('plan')
    expect(plan).toHaveTextContent('Subtract')
    fireEvent.click(plan.querySelector('[data-action=taught]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/lesson-plans/5/taught'))
  })

  it('staff write a plan in the teacher\'s name', async () => {
    wrap(<StaffLessonPlans />)
    const form = await screen.findByTestId('plan-form')
    expect(form.querySelector('[name=unit_id]')).toBeNull()
    fireEvent.change(form.querySelector('[name=objective]'), { target: { value: 'Revision' } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/lesson-plans', expect.objectContaining({ batch_id: 3, subject_id: 7, teacher_id: 9, objective: 'Revision' })))
  })

  it('the student sees completed chapters, or a note when the institution keeps it hidden', async () => {
    useAuthStore.setState({ user: { role: 'student' } })
    api.get.mockResolvedValueOnce({ data: { data: [{ subject: 'Math', chapters: ['Fractions'], total_chapters: 3 }] } })
    const { unmount } = wrap(<SyllabusFamily />)
    expect(await screen.findByTestId('family-subject')).toHaveTextContent('1 of 3 chapters done')
    unmount()
    api.get.mockRejectedValueOnce({ response: { status: 403 } })
    wrap(<SyllabusFamily />)
    expect(await screen.findByText('The institution does not show the syllabus to parents and students')).toBeInTheDocument()
  })
})
