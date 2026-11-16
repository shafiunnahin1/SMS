import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import Library from '../pages/library/Library'
import MyLibrary from '../pages/library/MyLibrary'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const wrap = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)
const book = { id: 4, title: 'Gitanjali', author: 'Tagore', isbn: null, category: 'Poetry', shelf_location: 'A1', total_copies: 2, available_copies: 1, published_year: null }
const fined = { id: 8, book: { id: 4, title: 'Gitanjali' }, student: { id: 2, name: 'Rafi', student_id: '2501010001' }, due_date: '2026-11-01', status: 'returned', fine_amount: '25.00', fine_paid: false }

// D227 LIB.2: books, issue by the student's ID, fines by role, and the student's own list
describe('library screens (D227)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put', 'delete']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {}, openConfirm: (c) => c.onConfirm() })
    api.get.mockImplementation((u) => Promise.resolve({ data: u === '/library/books' ? { data: [book], meta: { categories: ['Poetry'] } } : { data: u === '/library/overdue' ? [fined] : [] } }))
    api.post.mockResolvedValue({ data: { data: { receipt_no: 'R-1', book: { title: 'Gitanjali' }, student: { name: 'Rafi' }, due_date: '2026-11-30' } } })
  })

  it('the admin adds a book and issues it by the student ID', async () => {
    useAuthStore.setState({ user: { role: 'admin' } })
    wrap(<Library />)
    expect(await screen.findByTestId('book')).toHaveTextContent('1 of 2 copies in')
    const form = screen.getByTestId('book-form')
    fireEvent.change(form.querySelector('[name=title]'), { target: { value: 'Agnibina' } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/library/books', expect.objectContaining({ title: 'Agnibina', total_copies: 1, author: null })))
    fireEvent.click(screen.getByRole('tab', { name: 'Issue a book' }))
    const issue = await screen.findByTestId('issue-form')
    await waitFor(() => expect(issue.querySelector('[name=book_id] option[value="4"]')).not.toBeNull())
    fireEvent.change(issue.querySelector('[name=book_id]'), { target: { value: '4' } })
    fireEvent.change(issue.querySelector('[name=student_code]'), { target: { value: ' 2501010001 ' } })
    fireEvent.submit(issue)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/library/issue', { book_id: 4, student_code: '2501010001' }))
    expect(await screen.findByTestId('issued-note')).toHaveTextContent('2026-11-30')
  })

  it('the accountant sees only the fines and collects one; no waive, no return', async () => {
    useAuthStore.setState({ user: { role: 'accountant' } })
    wrap(<Library />)
    const row = await screen.findByTestId('issue-row')
    expect(screen.queryByRole('tab')).toBeNull()
    expect(row.querySelector('[data-action=waive]')).toBeNull()
    expect(row.querySelector('[data-action=return]')).toBeNull()
    fireEvent.click(row.querySelector('[data-action=collect]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/library/issues/8/collect-fine', { method: 'cash' }))
  })

  it('staff have no settings tab and no fine buttons', async () => {
    useAuthStore.setState({ user: { role: 'institution_staff' } })
    wrap(<Library />)
    await screen.findByTestId('book')
    expect(screen.queryByRole('tab', { name: 'Settings' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'Overdue and fines' }))
    const row = await screen.findByTestId('issue-row')
    expect(row.querySelector('[data-action=collect]')).toBeNull()
    expect(row.querySelector('[data-action=waive]')).toBeNull()
  })

  it('the student sees their books and fines', async () => {
    useAuthStore.setState({ user: { role: 'student' } })
    api.get.mockResolvedValue({ data: { data: [fined] } })
    wrap(<MyLibrary />)
    expect(await screen.findByTestId('my-book')).toHaveTextContent('Unpaid')
    expect(api.get).toHaveBeenCalledWith('/student/library')
  })
})
