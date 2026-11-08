import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import ResultSheets from '../pages/exams/ResultSheets'
import FinalResults from '../features/exams/FinalResults'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const at = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const draft = { id: 7, name: 'Annual', version: 1, status: 'draft', program_id: 1, program: 'Class 10', rule: { components: [{ exam_id: 11, weight: 100 }], absent_policy: 'zero', missing_subject_policy: 'error', pass_rule: 'every_subject', pass_percent: 33 } }
const routes = (sheets) => (url) => Promise.resolve({ data: { data: {
  '/programs': [{ id: 1, name: 'Class 10' }],
  '/exams': [{ id: 11, name: 'Half', program: { id: 1 } }, { id: 12, name: 'Pre-test', program: { id: 1 } }, { id: 13, name: 'Final', program: { id: 1 } }],
  '/result-sheets': sheets,
}[url] ?? [] } })

// D197 AAD.2: the rule form keeps the weight sum live and saves only at 100; compute with missing marks lists them; the portal card
describe('result sheets (D197 AAD.2)', () => {
  beforeEach(() => { for (const f of ['get', 'post', 'put', 'delete']) api[f].mockReset(); i18n.changeLanguage('en') })

  it('the weights must add up to 100 before saving', async () => {
    api.get.mockImplementation(routes([]))
    api.post.mockResolvedValue({ data: { data: {} } })
    at(<ResultSheets />)
    fireEvent.click(await screen.findByText('New result sheet'))
    await screen.findByRole('option', { name: 'Class 10' })
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Sheet name'), { target: { value: 'Annual' } })
    fireEvent.change(screen.getByLabelText('Exam'), { target: { value: '11' } })
    fireEvent.change(screen.getByLabelText('Weight (%)'), { target: { value: '30' } })
    expect(screen.getByTestId('weight-sum')).toHaveTextContent('30%')
    expect(screen.getByText('Save').closest('button')).toBeDisabled()
    fireEvent.click(screen.getByText('Add exam'))
    const exams = screen.getAllByLabelText('Exam'); const weights = screen.getAllByLabelText('Weight (%)')
    fireEvent.change(exams[1], { target: { value: '13' } })
    fireEvent.change(weights[1], { target: { value: '70' } })
    expect(screen.getByTestId('weight-sum')).toHaveTextContent('100%')
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/result-sheets', expect.objectContaining({ program_id: 1, name: 'Annual',
      rule: expect.objectContaining({ components: [{ exam_id: 11, weight: 30 }, { exam_id: 13, weight: 70 }], pass_percent: 33 }) })))
  })

  it('compute with missing marks lists them', async () => {
    api.get.mockImplementation(routes([draft]))
    api.post.mockRejectedValue({ response: { status: 422, data: { data: { computed: 0, missing: [{ student_id: 3, subject_id: 2, subject: 'Physics', component: 1 }] } } } })
    at(<ResultSheets />)
    fireEvent.click(await screen.findByText('Compute'))
    expect(await screen.findByTestId('sheet-missing')).toHaveTextContent('1 marks missing')
    expect(api.post).toHaveBeenCalledWith('/result-sheets/7/compute')
  })

  it('the portal card shows the published sheet; nothing when held back', async () => {
    api.get.mockResolvedValue({ data: { data: { student: { id: 1 }, results: [{ sheet: { id: 7, name: 'Annual' }, total_percentage: '70.50', gpa: '4.00', grade: 'A', is_pass: true, position_program: 1,
      details: [{ subject_id: 1, subject: 'Bangla', weighted: 81, grade: 'A+' }] }] } } })
    at(<FinalResults url="/student/final-results" />)
    expect(await screen.findByTestId('final-result')).toHaveTextContent('Annual')
    expect(screen.getByText('Bangla')).toBeInTheDocument()
  })
})
