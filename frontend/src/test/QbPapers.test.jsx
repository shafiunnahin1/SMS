import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import { useUiStore } from '../store/uiStore'
import QbPapers from '../pages/qb/QbPapers'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))

const folderData = [
  { id: 1, parent_id: null, name: 'Exam', papers: 1 },
  { id: 2, parent_id: 1, name: 'Term', papers: 0 },
]
const paperData = [
  { id: 9, title: 'Draft paper', status: 'draft', total_marks: '10.00', qb_paper_folder_id: null },
  { id: 10, title: 'Final paper', status: 'final', total_marks: '20.00', qb_paper_folder_id: 1 },
]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/admin/question-bank/papers']}><QbPapers /></MemoryRouter></QueryClientProvider>)
}

describe('question paper grid (D133)', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { role: 'admin' } })
    api.get.mockImplementation(path => Promise.resolve({ data: { data: path.endsWith('paper-folders') ? folderData : paperData } }))
  })
  afterEach(() => { vi.clearAllMocks() })

  it('shows folders and papers as cards and follows folder breadcrumbs', async () => {
    renderPage()
    await screen.findByTestId('qb-paper-grid')
    expect(screen.getByTestId('qb-paper-folder-card')).toHaveTextContent('Exam')
    expect(screen.getByTestId('qb-paper-card')).toHaveTextContent('Draft paper')

    fireEvent.click(screen.getByTestId('qb-paper-folder-card').querySelector('[data-action="open-folder"]'))
    expect(screen.getByTestId('qb-paper-breadcrumb')).toHaveTextContent('Exam')
    expect(screen.getByTestId('qb-paper-grid')).toHaveTextContent('Term')
    expect(screen.getByTestId('qb-paper-grid')).toHaveTextContent('Final paper')
    fireEvent.click(screen.getByRole('button', { name: 'পেছনে' }))
    expect(screen.getByTestId('qb-paper-grid')).toHaveTextContent('Draft paper')
  })

  it('offers draft deletion only and only offers folder deletion for an empty folder', async () => {
    renderPage()
    await screen.findByTestId('qb-paper-grid')
    const draft = document.querySelector('[data-paper-id="9"]')
    fireEvent.click(within(draft).getByRole('button', { name: /কাজ/ }))
    expect(within(draft).getByRole('button', { name: 'মুছুন' })).toBeInTheDocument()

    fireEvent.click(document.querySelector('[data-folder-id="1"] [data-action="open-folder"]'))
    const final = document.querySelector('[data-paper-id="10"]')
    fireEvent.click(within(final).getByRole('button', { name: /কাজ/ }))
    expect(within(final).queryByRole('button', { name: 'মুছুন' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'প্রশ্নপত্র' }))
    const examCard = document.querySelector('[data-folder-id="1"]')
    fireEvent.click(within(examCard).getByRole('button', { name: /ফোল্ডারের কাজ/ }))
    expect(within(examCard).queryByRole('button', { name: 'মুছুন' })).toBeNull()
    fireEvent.click(within(examCard).getByRole('button', { name: 'খুলুন' }))
    await waitFor(() => expect(screen.getByTestId('qb-paper-grid')).toHaveTextContent('Term'))
    const termCard = document.querySelector('[data-folder-id="2"]')
    fireEvent.click(within(termCard).getByRole('button', { name: /ফোল্ডারের কাজ/ }))
    expect(within(termCard).getByRole('button', { name: 'মুছুন' })).toBeInTheDocument()
  })
})
