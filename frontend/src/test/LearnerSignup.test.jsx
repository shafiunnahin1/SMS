import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import LearnerSignup from '../pages/central/LearnerSignup'
import LearnerProfile from '../pages/learner/LearnerProfile'
import { buildNav } from '../nav/menu'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
vi.mock('../store/authStore', async (orig) => ({ ...(await orig()), ensureCsrf: () => Promise.resolve() }))

const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const classes = [{ id: 8, name_bn: 'অষ্টম শ্রেণি', name_en: 'Class 8' }, { id: 9, name_bn: 'নবম শ্রেণি', name_en: 'Class 9' }]

// D165 (1) ST.1: register with own mobile -> code -> verified, a link to the learners host's login; the profile changes the class
describe('student self-registration (D165)', () => {
  afterEach(() => vi.clearAllMocks())

  it('registers, verifies the mobile code and links to the learners login', async () => {
    api.get.mockResolvedValue({ data: { data: classes } })
    api.post.mockImplementation((url) => Promise.resolve({ data: { data: url === '/public/learners' ? { id: 3, phone: '017******78' } : { login_host: 'learn.schoolapp.com', login: '01712345678' } } }))
    const { container } = wrap(<LearnerSignup />)
    const form = await screen.findByTestId('learner-signup')
    await waitFor(() => expect(form.querySelectorAll('select option').length).toBe(3))
    fireEvent.change(form.querySelector('[name="name"]'), { target: { value: 'Rafi' } })
    fireEvent.change(form.querySelector('[name="phone"]'), { target: { value: '01712345678' } })
    fireEvent.change(form.querySelector('[name="qb_class_level_id"]'), { target: { value: '8' } })
    fireEvent.change(form.querySelector('[name="password"]'), { target: { value: 'Learner@2026' } })
    fireEvent.change(form.querySelector('[name="password_confirmation"]'), { target: { value: 'Learner@2026' } })
    fireEvent.click(form.querySelector('[name="accept_terms"]'))
    fireEvent.submit(form)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/public/learners', expect.objectContaining({ name: 'Rafi', phone: '01712345678', qb_class_level_id: 8, accept_terms: true })))
    const verify = await screen.findByTestId('learner-verify')
    expect(verify.textContent).toContain('017******78')
    fireEvent.change(verify.querySelector('[name="code"]'), { target: { value: '123456' } })
    fireEvent.submit(verify)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/public/learners/3/verify', { code: '123456' }))
    await screen.findByTestId('learner-done')
    expect(container.querySelector('[data-action="go-login"]').getAttribute('href')).toMatch(/\/\/learn\.schoolapp\.com(:\d+)?\/login$/)
  })

  it('does not submit without the terms tick and shows the server field errors', async () => {
    api.get.mockResolvedValue({ data: { data: classes } })
    api.post.mockRejectedValue({ response: { data: { errors: { phone: ['ভুল নম্বর'] } } } })
    wrap(<LearnerSignup />)
    const form = await screen.findByTestId('learner-signup')
    for (const [k, v] of [['name', 'R'], ['phone', '123'], ['password', 'Learner@2026'], ['password_confirmation', 'Learner@2026']]) fireEvent.change(form.querySelector(`[name="${k}"]`), { target: { value: v } })
    fireEvent.submit(form)
    await waitFor(() => expect(form.textContent).toMatch(/টিক দিন|Tick this/))
    expect(api.post).not.toHaveBeenCalled()
    fireEvent.click(form.querySelector('[name="accept_terms"]'))
    fireEvent.submit(form)
    await screen.findByText('ভুল নম্বর')
  })

  it('changes the class on the profile and shows the menu item with the question bank', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/learner/profile' ? { qb_class_level_id: 8, class_level: classes[0] } : classes } }))
    api.put.mockResolvedValue({ data: { data: { qb_class_level_id: 9 } } })
    const { container } = wrap(<LearnerProfile />)
    await screen.findByTestId('learner-profile')
    const select = await waitFor(() => { const s = container.querySelector('[name="qb_class_level_id"]'); expect(s.value).toBe('8'); return s })
    fireEvent.change(select, { target: { value: '9' } })
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/learner/profile', { qb_class_level_id: 9, qb_exam_batch_id: null }))   // ST.2: a new class drops the batch
    const paths = (type) => buildNav('student', { modules: ['question_bank', 'quiz'], institutionType: type }).map(i => i.path)
    expect(paths('learners')).toContain('/student/my-class')
    expect(paths('school')).toContain('/student/my-class')   // ST.5: an institution's student picks the exam batch there too
    expect(buildNav('student', { modules: [], institutionType: 'school' }).map(i => i.path)).not.toContain('/student/my-class')
  })
})
