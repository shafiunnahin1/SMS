import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import i18n from '../i18n'
import api from '../api/axios'
import StaffMode from '../pages/admin/access/StaffMode'

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() }, bindAuthStore: () => {} }))
const at = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><StaffMode /></MemoryRouter></QueryClientProvider>)
const user = (id, extra = {}) => ({ user_id: id, name: `User ${id}`, role: 'teacher', teachers: [{ id: 50 + id }], staff_members: [], issues: [], review: null, ...extra })

// D207 MODE.1: review each account (its single linked profile goes with it), switch on only when everything is reviewed, and
// switching back asks first
describe('department mode screen (D207 MODE.1)', () => {
  beforeEach(() => { for (const f of ['get', 'post', 'put']) api[f].mockReset(); i18n.changeLanguage('en'); api.post.mockResolvedValue({ data: {} }); api.put.mockResolvedValue({ data: {} }) })

  it('reviews an account and keeps the switch off until all are reviewed', async () => {
    api.get.mockResolvedValue({ data: { data: { mode: 'legacy', users: [user(1), user(2, { review: { decision: 'keep' } })], profiles_without_valid_login: [], summary: { users: 2, reviewed: 1, unresolved_identity_collisions: 0 } } } })
    at()
    expect(await screen.findByText('1 of 2 accounts reviewed')).toBeInTheDocument()
    expect(screen.getByText('Switch department mode on')).toBeDisabled()
    fireEvent.click(screen.getByText('Looks right, confirm'))
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/staff-mode/reviews', { user_id: 1, teacher_id: 51, staff_member_id: null, decision: 'keep', note: null }))
  })

  it('switches on when ready, and asks before going back', async () => {
    api.get.mockResolvedValue({ data: { data: { mode: 'legacy', users: [user(1, { review: { decision: 'keep' } })], profiles_without_valid_login: [], summary: { users: 1, reviewed: 1, unresolved_identity_collisions: 0 } } } })
    const { unmount } = at()
    fireEvent.click(await screen.findByText('Switch department mode on'))
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/staff-mode', { mode: 'department' }))
    unmount()
    api.get.mockResolvedValue({ data: { data: { mode: 'department', users: [], profiles_without_valid_login: [], summary: { users: 0, reviewed: 0, unresolved_identity_collisions: 0 } } } })
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    at()
    fireEvent.click(await screen.findByText('Back to the old rules'))
    expect(confirm).toHaveBeenCalled()
    expect(api.put).toHaveBeenCalledTimes(1)
    confirm.mockRestore()
  })
})
