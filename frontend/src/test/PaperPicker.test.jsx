import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import PaperPicker from '../features/exams/PaperPicker'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))

const folders = [{ id: 1, parent_id: null, name: 'Term' }]
const papers = [
  { id: 7, title: 'Physics final', status: 'final', qb_paper_folder_id: 1 },
  { id: 8, title: 'Physics draft', status: 'draft', qb_paper_folder_id: 1 },
  { id: 9, title: 'Loose final', status: 'final', qb_paper_folder_id: null },
]

// D158 (3): the paper picker works like a file-open dialog over the paper folders; only final papers can be picked
describe('PaperPicker', () => {
  afterEach(() => vi.clearAllMocks())
  it('opens folders and picks a final paper, never a draft', async () => {
    api.get.mockImplementation(path => Promise.resolve({ data: { data: path.endsWith('paper-folders') ? folders : papers } }))
    const onPick = vi.fn()
    render(<QueryClientProvider client={new QueryClient()}><PaperPicker open onClose={() => {}} onPick={onPick} /></QueryClientProvider>)
    expect(await screen.findByText('Loose final')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Term'))
    expect(screen.getByText('Physics final')).toBeInTheDocument()
    expect(screen.queryByText('Physics draft')).toBeNull()
    fireEvent.click(screen.getByText('Physics final'))
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }), null))
  })

  it('asks which subject block of a multi-subject paper to take (D159)', async () => {
    // the list has no subjects (as the API answers); the picker asks the paper itself
    api.get.mockImplementation(path => Promise.resolve({ data: { data: path.endsWith('paper-folders') ? []
      : path.endsWith('/papers/5') ? { id: 5, subjects: [{ id: 1, name: 'গণিত' }, { id: 2, name: 'বিজ্ঞান' }] }
      : [{ id: 5, title: 'Class test', status: 'final', qb_paper_folder_id: null }] } }))
    const onPick = vi.fn()
    render(<QueryClientProvider client={new QueryClient()}><PaperPicker open onClose={() => {}} onPick={onPick} /></QueryClientProvider>)
    fireEvent.click(await screen.findByText('Class test'))
    fireEvent.click(await screen.findByText('বিজ্ঞান'))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }), 2)
  })
})
