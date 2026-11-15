import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useInstitutionStore } from '../store/institutionStore'
import BatchForm from '../features/academic/BatchForm'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const batch = { id: 4, name: 'A', program_id: 1, status: 'running', max_capacity: 40, teacher_id: null, shift: null,
  subject_teachers: [{ subject_id: 0, teacher_id: 9, pay_type: 'per_class', pay_rate: '250.00' }] }

// D223 TPO.1: with the teacher payouts module on, each subject-teacher row of a batch carries how that teacher is paid
describe('batch teacher pay (D223)', () => {
  beforeEach(() => {
    for (const f of ['get', 'put']) api[f].mockReset()
    i18n.changeLanguage('en')
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: u === '/teachers' ? [{ id: 9, name: 'Rahim' }] : u === '/programs' ? [{ id: 1, name: 'HSC' }] : [] } }))
    api.put.mockResolvedValue({ data: { data: batch } })
  })

  it('edits the pay type and rate and sends them', async () => {
    useInstitutionStore.setState({ modules: ['teacher_payouts'], roles: ['admin', 'teacher'], settings: {} })
    wrap(<BatchForm batch={batch} onDone={() => {}} onCancel={() => {}} />)
    await screen.findByRole('option', { name: 'HSC' }); await screen.findAllByRole('option', { name: 'Rahim' })   // lists loaded
    const type = await screen.findByLabelText('Pay type')
    fireEvent.change(type.closest('form').querySelector('[name=program_id]'), { target: { value: '1' } })   // the list arrived after the form
    expect(type).toHaveValue('per_class')
    fireEvent.change(type, { target: { value: 'percentage' } })
    fireEvent.change(await screen.findByLabelText('Rate (%)'), { target: { value: '12.5' } })
    fireEvent.submit(type.closest('form'))
    await waitFor(() => expect(api.put).toHaveBeenCalled())
    expect(api.put.mock.calls[0][1].subject_teachers).toEqual([{ subject_id: 0, teacher_id: 9, pay_type: 'percentage', pay_rate: '12.5' }])
  })

  it('shows no pay fields without the module', async () => {
    useInstitutionStore.setState({ modules: [], roles: ['admin', 'teacher'], settings: {} })
    wrap(<BatchForm batch={batch} onDone={() => {}} onCancel={() => {}} />)
    await screen.findAllByText(/Teacher/)
    expect(screen.queryByLabelText('Pay type')).toBeNull()
  })
})
