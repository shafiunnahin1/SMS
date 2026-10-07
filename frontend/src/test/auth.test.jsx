import { vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { act } from 'react'
import '../i18n'

// D51: the session cookie is checked with GET /auth/me after a reload; routes wait for that answer and never hold a token
vi.mock('../api/axios', () => ({ bindAuthStore: () => {}, default: { get: vi.fn() } }))
const { default: api } = await import('../api/axios')
const { useAuthStore } = await import('../store/authStore')
const { default: ProtectedRoute } = await import('../router/ProtectedRoute')

const page = (initial) => render(
  <MemoryRouter initialEntries={[initial]}>
    <Routes>
      <Route path="/login" element={<p>LOGIN</p>} />
      <Route path="/change-password" element={<p>CHANGE</p>} />
      <Route path="/admin/dashboard" element={<ProtectedRoute role="admin"><p>DASH</p></ProtectedRoute>} />
    </Routes>
  </MemoryRouter>,
)

beforeEach(() => act(() => useAuthStore.setState({ token: null, user: null, role: null, isAuthenticated: false, checked: false })))

it('restore() logs in from a live session and keeps no token', async () => {
  api.get.mockResolvedValueOnce({ data: { success: true, data: { user: { id: 1, role: 'admin', name: 'A' } } } })
  await act(() => useAuthStore.getState().restore())
  expect(api.get).toHaveBeenCalledWith('/auth/me', { skipAuthRedirect: true })
  expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: true, checked: true, token: null, role: 'admin' })
})

it('a dead session leaves the user logged out but checked', async () => {
  api.get.mockRejectedValueOnce({ response: { status: 401 } })
  await act(() => useAuthStore.getState().restore())
  expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, checked: true })
})

it('protected pages wait for the check (skeleton), then route by the answer', () => {
  page('/admin/dashboard')
  expect(screen.getByTestId('loader-page')).toBeInTheDocument()
  act(() => useAuthStore.setState({ checked: true }))
  expect(screen.getByText('LOGIN')).toBeInTheDocument()
})

it('a forced password change goes to /change-password first', () => {
  act(() => useAuthStore.getState().setAuth(null, { id: 1, role: 'admin', must_change_password: true }))
  page('/admin/dashboard')
  expect(screen.getByText('CHANGE')).toBeInTheDocument()
})
