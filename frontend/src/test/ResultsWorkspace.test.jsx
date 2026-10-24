import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import ResultsWorkspace from '../pages/admin/exams/ResultsWorkspace'
import { buildNav } from '../nav/menu'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))

const exams = [
  { id: 1, name: 'Half yearly', academic_year: 2026, program_id: 8, program: { id: 8, name: 'Class 8' }, batch_id: null, exam_type: 'term', status: 'upcoming' },
  { id: 2, name: 'Weekly 1', academic_year: 2026, program_id: 8, program: { id: 8, name: 'Class 8' }, batch_id: 3, batch: { id: 3, name: 'Morning' }, exam_type: 'weekly', status: 'published' },
  { id: 3, name: 'Annual', academic_year: 2025, program_id: 9, program: { id: 9, name: 'Class 9' }, batch_id: null, exam_type: 'term', status: 'published' },
]

const page = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <MemoryRouter initialEntries={['/admin/exams/results']}><ResultsWorkspace /></MemoryRouter></QueryClientProvider>)

// D158 (2): results as folders - year, then class/batch, then the exams as files
describe('results workspace (D158)', () => {
  afterEach(() => vi.clearAllMocks())

  it('opens year, then class/batch folders, then shows the exams as files', async () => {
    api.get.mockResolvedValue({ data: { data: exams } })
    page()
    await screen.findByTestId('results-grid')
    expect(screen.getAllByTestId('results-folder').map(f => f.textContent)).toEqual([expect.stringContaining('2026'), expect.stringContaining('2025')])
    fireEvent.click(screen.getAllByTestId('results-folder')[0].querySelector('button'))
    expect(screen.getAllByTestId('results-folder').map(f => f.textContent)).toEqual([expect.stringContaining('Class 8'), expect.stringContaining('Class 8 — Morning')])
    fireEvent.click(screen.getAllByTestId('results-folder')[1].querySelector('button'))
    expect(screen.getAllByTestId('results-file')).toHaveLength(1)
    expect(screen.getByTestId('results-file')).toHaveTextContent('Weekly 1')
    fireEvent.click(screen.getByTestId('results-breadcrumb').querySelectorAll('button')[1])
    expect(screen.getAllByTestId('results-folder')).toHaveLength(2)
  })

  it('shows an empty state without exams', async () => {
    api.get.mockResolvedValue({ data: { data: [] } })
    page()
    expect(await screen.findByText(/কোনো পরীক্ষা নেই|No exams/)).toBeInTheDocument()
  })

  it('puts exam and question-bank items in one admin "পরীক্ষা" group', () => {
    const nav = buildNav('admin', { modules: ['exams', 'question_bank', 'merit_list'], release: 'R7', roles: ['admin'] })
    const group = nav.find(i => i.key === 'exam-group')
    expect(group.children.map(c => c.key)).toEqual(['results', 'exams', 'question-bank', 'qb-papers', 'study-materials', 'qb-spending', 'merit-list'])
    expect(nav.find(i => i.key === 'question-bank')).toBeUndefined()
  })
})
