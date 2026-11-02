import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import StudentProfile from '../pages/admin/students/StudentProfile'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() }, bindAuthStore: () => {} }))

const student = { id: 5, student_id: '2026000005', name: 'Rahim', guardian_phone: '01711000001', address: '', status: 'active', enrollments: [], consents: [] }

// D160: a student's ID never changes - the profile shows it read-only and never sends it (the server answers 422 when it is sent)
describe('student profile save (D160)', () => {
  it('saves the profile without the student ID', async () => {
    api.get.mockResolvedValue({ data: { data: student } })
    api.post.mockResolvedValue({ data: { data: student } })
    const { container } = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/admin/students/5']}><Routes><Route path="/admin/students/:id" element={<StudentProfile />} /></Routes></MemoryRouter></QueryClientProvider>)
    const idField = await waitFor(() => { const el = container.querySelector('input[name="student_id"]'); if (!el) throw new Error('form'); return el })
    expect(idField.readOnly).toBe(true)
    fireEvent.change(container.querySelector('input[name="address"]'), { target: { value: 'Dhanmondi 27' } })
    fireEvent.submit(idField.closest('form'))
    await waitFor(() => expect(api.post).toHaveBeenCalled())
    const [url, body] = api.post.mock.calls[0]
    expect(url).toBe('/students/5')
    expect(body.has('student_id')).toBe(false)
    expect(body.get('address')).toBe('Dhanmondi 27')
    expect(screen.queryByText(/422/)).toBeNull()
  })
})
