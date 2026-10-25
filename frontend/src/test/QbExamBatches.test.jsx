import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import QbExamBatches from '../pages/super/QbExamBatches'
import LearnerProfile from '../pages/learner/LearnerProfile'
import QbStudy from '../pages/student/QbStudy'
import { buildNav } from '../nav/menu'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))

const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const classes = [{ id: 9, name_bn: 'নবম শ্রেণি', name_en: 'Class 9' }, { id: 10, name_bn: 'দশম শ্রেণি', name_en: 'Class 10' }]

// D165 (3) ST.2: the Super Admin's SSC/HSC batches, the learner's batch choice, and the validity shown before buying
describe('exam batches and validity (D165)', () => {
  afterEach(() => vi.clearAllMocks())

  it('creates a batch with its classes and end date', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/super/qb/exam-batches' ? [] : classes } }))
    api.post.mockResolvedValue({ data: { data: { id: 1 } } })
    const { container } = wrap(<QbExamBatches />)
    fireEvent.click(await screen.findByText(/নতুন ব্যাচ|New batch/))
    const form = await screen.findByTestId('exam-batch-form')
    await waitFor(() => expect(form.querySelectorAll('input[type="checkbox"][value]').length).toBe(2))
    fireEvent.change(form.querySelector('[name="name"]'), { target: { value: 'SSC 2027' } })
    fireEvent.change(form.querySelector('[name="exam_ends_on"]'), { target: { value: '2027-05-20' } })
    form.querySelectorAll('input[name="class_level_ids"]').forEach(c => fireEvent.click(c))
    fireEvent.submit(form)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/super/qb/exam-batches', { name: 'SSC 2027', kind: 'ssc', exam_ends_on: '2027-05-20', class_level_ids: [9, 10], is_active: true }))
    expect(container.querySelector('[data-testid="qb-exam-batches"]')).not.toBeNull()
    expect(buildNav('super_admin').flatMap(i => i.children ?? [i]).map(i => i.path)).toContain('/super-admin/qb/exam-batches')
  })

  it('lets a learner pick a batch and shows the validity before buying', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/learner/profile'
      ? { qb_class_level_id: 9, qb_exam_batch_id: null, batches: [{ id: 4, name: 'SSC 2027', kind: 'ssc', exam_ends_on: '2027-05-20' }] }
      : url === '/student/qb/validity' ? { expires_at: '2026-12-31T17:59:59Z', rule: 'year_end', days_left: 12 }
      : url === '/student/qb/curriculum' ? { subjects: [], my_class_level_id: 9 } : url === '/student/qb/questions' ? [] : classes } }))
    api.put.mockResolvedValue({ data: { data: {} } })
    const { container, unmount } = wrap(<LearnerProfile />)
    const batch = await waitFor(() => { const s = container.querySelector('[name="qb_exam_batch_id"]'); expect(s).not.toBeNull(); return s })
    fireEvent.change(batch, { target: { value: '4' } })
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/learner/profile', { qb_class_level_id: 9, qb_exam_batch_id: 4 }))
    unmount()
    wrap(<QbStudy />)
    const note = await screen.findByTestId('qb-validity')
    expect(note.textContent).toMatch(/12/)
    expect(note.textContent).toMatch(/2026|২০২৬/)
  })
})
