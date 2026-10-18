import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { MyDepartments } from '../pages/r3/Staff'

// docs/TESTING.md "DepartmentPortalTest": only the caller's own departments are listed (the API decides); empty / error / one / many
// departments; choosing one loads that department's portal only; a refused department shows the no-access message; Bengali and English.
vi.mock('../api/axios', () => ({ default: { get: vi.fn() }, bindAuthStore: () => {} }))

const view = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MyDepartments /></QueryClientProvider>)

describe('DepartmentPortalTest', () => {
  beforeEach(() => { api.get.mockReset(); i18n.changeLanguage('en') })

  it('shows the empty state when the staff member has no department', async () => {
    api.get.mockResolvedValueOnce({ data: { data: [] } })
    view()
    expect(await screen.findByText('You are not in any department yet')).toBeInTheDocument()
  })

  it('lists only what the API returns and opens the chosen department', async () => {
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: url === '/staff/departments'
      ? [{ id: 3, name: 'Accounts office', code: 'ACC' }, { id: 9, name: 'Library', code: 'LIB' }] : { id: 9, name: 'Library', code: 'LIB' } } }))
    view()
    expect(await screen.findByText('Accounts office')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[1])
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/staff/departments/9/portal'))
    expect(api.get).not.toHaveBeenCalledWith('/staff/departments/3/portal')
    expect(await screen.findByTestId('department-portal')).toHaveTextContent('Library')
    expect(screen.getAllByRole('button', { name: 'Open' })[1]).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows the no-access message when the API refuses the department', async () => {
    api.get.mockImplementation((url) => url === '/staff/departments'
      ? Promise.resolve({ data: { data: [{ id: 4, name: 'Store', code: 'ST' }] } }) : Promise.reject(Object.assign(new Error('403'), { response: { status: 403 } })))
    view()
    fireEvent.click(await screen.findByRole('button', { name: 'Open' }))
    expect(await screen.findByText('This department is not available to you.')).toBeInTheDocument()
  })

  it('shows an error with retry when the list fails, and speaks Bengali', async () => {
    await i18n.changeLanguage('bn')
    api.get.mockRejectedValueOnce(new Error('network'))
    view()
    expect(await screen.findByText('আমার বিভাগ')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /আবার|retry/i })).toBeInTheDocument()
  })
})
