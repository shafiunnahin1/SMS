import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import RoutineBlocks from '../features/routine/RoutineBlocks'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))
const at = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)

// D197 AAD.5: the list of fixed blocks; adding one for this program on one day; the classes already inside are listed
describe('routine blocks (D197 AAD.5)', () => {
  beforeEach(() => { for (const f of ['get', 'post', 'delete']) api[f].mockReset(); i18n.changeLanguage('en') })

  it('lists, adds and warns about classes inside', async () => {
    api.get.mockResolvedValue({ data: { data: [{ id: 1, kind: 'break', label: 'Tiffin', start_time: '11:00', end_time: '11:30', day_of_week: null, program_id: null }] } })
    api.post.mockResolvedValue({ data: { data: { id: 2, overlapping_routines: [{ routine_id: 9, day_of_week: 'sun', start_time: '10:00', subject: 'Bangla' }] } } })
    at(<RoutineBlocks programId="4" />)
    expect(await screen.findByText('Tiffin')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'assembly' } })
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: 'sun' } })
    fireEvent.change(screen.getByLabelText('Block starts'), { target: { value: '10:30' } })
    fireEvent.change(screen.getByLabelText('Block ends'), { target: { value: '10:40' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByText('Add block'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/routine-blocks', { kind: 'assembly', label: null, start_time: '10:30', end_time: '10:40', day_of_week: 'sun', program_id: 4 }))
    expect(await screen.findByTestId('block-inside')).toHaveTextContent('Bangla')
  })
})
