import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import SubjectsEditor from '../features/exams/SubjectsEditor'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const at = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)

// D197 AAD.6: the admin sets a subject's marks entry deadline; it is sent as "YYYY-MM-DD HH:mm"
describe('marks entry deadline (D197 AAD.6)', () => {
  beforeEach(() => { api.put.mockReset(); i18n.changeLanguage('en') })

  it('sends the deadline with the subjects', async () => {
    api.put.mockResolvedValue({ data: { data: [] } })
    at(<SubjectsEditor examId={3} locked={false} onSaved={() => {}} subjects={[{ subject_id: 1, name: 'Bangla', full_marks: 100, pass_marks: 33, entry_deadline: null }]} />)
    fireEvent.change(screen.getByLabelText('Marks due by'), { target: { value: '2026-11-11T17:00' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/exams/3/subjects', { subjects: [expect.objectContaining({ subject_id: 1, entry_deadline: '2026-11-11 17:00' })] }))
  })
})
