import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import { useUiStore } from '../store/uiStore'
import { useAuthStore } from '../store/authStore'
import { useStaffDepartmentStore } from '../store/staffDepartmentStore'
import Behavior from '../pages/behavior/Behavior'
import ChildBehavior from '../pages/behavior/ChildBehavior'
import { StaffBehavior } from '../pages/staff/StaffCampus'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() }, bindAuthStore: () => {} }))
const at = (path, el) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>{el}</MemoryRouter></QueryClientProvider>)
const rafi = { id: 7, name: 'Rafi', student_id: '2501010001' }
const entry = (o) => ({ id: 1, type: 'negative', category: 'discipline', title: 'Phone in class', description: null, action_taken: 'Kept till evening', date: '2026-11-19', parent_notified: false, reported_by: { id: 50, name: 'Rahim' }, student: rafi, ...o })
const data = (u) => u === '/behavior' ? [entry({})] : u === '/behavior/find' ? rafi
  : u === '/students/7/behavior' ? { student: rafi, summary: { positive: 1, negative: 1, neutral: 0 }, entries: [entry({}), entry({ id: 2, type: 'positive', title: 'Best speaker', reported_by: { id: 99, name: 'Other' } })] }
  : u === '/parent/children' ? [{ id: 7, name: 'Rafi' }] : u === '/parent/children/7/behavior' ? { summary: { positive: 1, negative: 0, neutral: 0 }, entries: [{ id: 2, type: 'positive', category: null, title: 'Best speaker', description: null, action_taken: null, date: '2026-11-18' }] } : []

// D235 BHV.2: open a student by ID, add an entry, tell the parent, a teacher corrects only their own entries, read-only staff,
// the parent's view
describe('behaviour screens (D235)', () => {
  beforeEach(() => {
    for (const f of ['get', 'post', 'put']) api[f].mockReset()
    i18n.changeLanguage('en')
    useUiStore.setState({ addToast: () => {}, openConfirm: (c) => c.onConfirm() })
    useStaffDepartmentStore.getState().clear()
    api.get.mockImplementation((u) => Promise.resolve({ data: { data: data(u) } }))
    for (const f of ['post', 'put']) api[f].mockResolvedValue({ data: { data: {} } })
  })

  it('a teacher opens a student by ID, adds an entry, tells the parent and corrects only their own', async () => {
    useAuthStore.setState({ user: { id: 50, role: 'teacher' } })
    at('/teacher/behavior', <Behavior />)
    const find = await screen.findByTestId('find-form')
    fireEvent.change(find.querySelector('[name=student_code]'), { target: { value: ' 2501010001 ' } })
    fireEvent.submit(find)
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/behavior/find', { params: { student_code: '2501010001' } }))
    expect(await screen.findByTestId('behavior-summary')).toHaveTextContent('Positive 1 · Negative 1')
    const entries = screen.getAllByTestId('behavior-entry').filter(e => e.closest('[data-testid=behavior-recent]') === null)
    expect(entries[0].querySelector('[data-action=edit]')).not.toBeNull()
    expect(entries[1].querySelector('[data-action=edit]')).toBeNull()
    expect(entries[1].querySelector('[data-action=tell]')).toBeNull()
    fireEvent.click(entries[0].querySelector('[data-action=tell]'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/behavior/1/notify-parent'))
    const form = screen.getByTestId('behavior-form')
    fireEvent.change(form.querySelector('[name=title]'), { target: { value: 'Helped a friend' } })
    fireEvent.submit(form)
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/students/7/behavior', expect.objectContaining({ type: 'positive', title: 'Helped a friend', category: null })))
  })

  it('read-only staff see the entries without the form or buttons', async () => {
    useAuthStore.setState({ user: { id: 60, role: 'institution_staff' } })
    useStaffDepartmentStore.getState().select({ id: 2, name: 'Office' }, ['staff.behavior.read'])
    at('/staff/behavior', <StaffBehavior />)
    const find = await screen.findByTestId('find-form')
    fireEvent.change(find.querySelector('[name=student_code]'), { target: { value: '2501010001' } })
    fireEvent.submit(find)
    await screen.findByTestId('behavior-summary')
    expect(screen.queryByTestId('behavior-form')).toBeNull()
    expect(document.querySelector('[data-action=tell]')).toBeNull()
  })

  it('the parent sees what was shared', async () => {
    useAuthStore.setState({ user: { role: 'parent' } })
    at('/parent/child/behavior', <ChildBehavior />)
    expect(await screen.findByTestId('child-behavior-summary')).toHaveTextContent('Positive 1')
    expect(screen.getByTestId('behavior-entry')).toHaveTextContent('Best speaker')
  })
})
