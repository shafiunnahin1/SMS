import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import AdmitCards from '../pages/cards/AdmitCards'
import IdCards from '../pages/cards/IdCards'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn() }, bindAuthStore: () => {} }))

const exam = { id: 7, name: 'Half yearly', exam_type: 'term', academic_year: 2026, program: { id: 1, name: 'Class 10' }, batch: null,
  admit_card_available: false, admit_card_from: null, exam_center: null, admit_card_instructions: null }
const data = { '/exams': [exam], '/batches': [{ id: 3, name: 'A', program: { id: 1, name: 'Class 10' } }], '/programs': [{ id: 1, name: 'Class 10' }] }
const at = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)

// D193 ADM.1: admit-card settings are saved with the exam's own fields; printing asks the server for the PDF (blob)
describe('admit cards and ID cards (D193 ADM.1)', () => {
  beforeEach(() => {
    api.get.mockReset(); api.put.mockReset(); i18n.changeLanguage('en')
    api.get.mockImplementation((url) => Promise.resolve({ data: url in data ? { data: data[url] } : new Blob(['%PDF']) }))
    window.open = vi.fn(() => ({ location: {}, close: vi.fn() }))
    URL.createObjectURL = vi.fn(() => 'blob:x')
  })

  it('saves the settings and prints one batch', async () => {
    api.put.mockResolvedValue({ data: { data: exam } })
    at(<AdmitCards />)
    fireEvent.change(await screen.findByLabelText('Exam'), { target: { value: '7' } })
    fireEvent.change(await screen.findByLabelText('Exam centre'), { target: { value: 'Main building' } })
    fireEvent.click(screen.getByLabelText('Students may download their admit card'))
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/exams/7', expect.objectContaining({ name: 'Half yearly', exam_type: 'term', academic_year: 2026, exam_center: 'Main building', admit_card_available: true })))
    fireEvent.change(screen.getByLabelText('batch'), { target: { value: '3' } })
    fireEvent.click(screen.getByText('Print admit cards'))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/exams/7/admit-cards/bulk', { params: { batch_id: '3' }, responseType: 'blob' }))
  })

  it('prints the ID cards of a class', async () => {
    at(<IdCards />)
    const program = await screen.findByLabelText('program')
    fireEvent.change(program, { target: { value: '1' } })
    fireEvent.click(screen.getByText('Print ID cards'))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/students/id-cards/bulk', { params: { program_id: '1' }, responseType: 'blob' }))
  })
})
