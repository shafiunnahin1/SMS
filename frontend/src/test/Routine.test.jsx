import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import { useUiStore } from '../store/uiStore'
import RoutineBuilder from '../pages/routine/RoutineBuilder'
import MyRoutine from '../pages/routine/MyRoutine'
import { usePrint } from '../hooks/usePrint'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() }, bindAuthStore: () => {} }))

const slot = { id: 5, day_of_week: 'sun', start_time: '09:00', end_time: '09:45', subject: 'Bangla', teacher: 'Karim', batch: 'A', room_no: '101', program_id: 1, batch_id: 3, subject_id: 7, teacher_id: 9 }
const data = { '/programs': [{ id: 1, name: 'Class 10' }], '/batches': [{ id: 3, name: 'A', program_id: 1 }], '/subjects': [{ id: 7, name: 'Bangla' }], '/teachers': [{ id: 9, name: 'Karim' }], '/routines': [slot], '/routines/teacher': [slot] }
const at = (el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>)

// D193 RTN.1: the builder shows the week, sends a slot and shows the server's clash message; a teacher reads their own week
describe('class routine (D193 RTN.1)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put', 'delete']) api[f].mockReset()
    i18n.changeLanguage('en')
    api.get.mockImplementation((url) => Promise.resolve({ data: { data: data[url] ?? [] } }))
    useUiStore.setState({ toasts: [] })
  })

  it('adds a period and shows a clash', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 422, data: { error: 'routine_conflict', message: 'This slot clashes: the room is in use then.' } } })
    at(<RoutineBuilder />)
    await screen.findByRole('option', { name: 'Class 10' })
    fireEvent.change(screen.getByLabelText('program'), { target: { value: '1' } })
    expect(await screen.findByText('Bangla')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Add a period'))
    await screen.findByRole('option', { name: 'Karim' })
    fireEvent.change(await screen.findByLabelText('Subject'), { target: { value: '7' } })
    fireEvent.change(screen.getByLabelText('Teacher'), { target: { value: '9' } })
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '09:30' } })
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: '10:15' } })
    fireEvent.change(screen.getByLabelText('Room'), { target: { value: '101' } })
    fireEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/routines', expect.objectContaining({ program_id: 1, subject_id: 7, teacher_id: 9, day_of_week: 'sun', start_time: '09:30', end_time: '10:15', room_no: '101' })))
    await waitFor(() => expect(useUiStore.getState().toasts.map(x => x.message)).toContain('This slot clashes: the room is in use then.'))
  })

  it('a teacher reads their own week', async () => {
    useAuthStore.setState({ role: 'teacher' })
    at(<MyRoutine />)
    expect(await screen.findByText('Bangla')).toBeInTheDocument()
    expect(api.get).toHaveBeenCalledWith('/routines/teacher')
    expect(screen.getAllByText('No classes').length).toBe(5)
  })

  it('a refused PDF shows the server message', async () => {
    const blob = new Blob([JSON.stringify({ message: 'Complete the exam schedule first' })], { type: 'application/json' })
    api.get.mockRejectedValue({ response: { status: 422, data: blob } })
    let print
    const Probe = () => { print = usePrint(); return null }
    at(<Probe />)
    await print.download('/exams/1/admit-cards/bulk', 'x.pdf')
    await waitFor(() => expect(useUiStore.getState().toasts.map(x => x.message)).toContain('Complete the exam schedule first'))
  })
})
