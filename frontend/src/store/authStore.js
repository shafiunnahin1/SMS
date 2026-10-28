import { create } from 'zustand'
import api, { bindAuthStore } from '../api/axios'
import { useStaffDepartmentStore } from './staffDepartmentStore'
import { clearAllSelections } from '../features/qb/keptSelection'

// docs/templates/react-core-files.md "authStore" + decision D51: the web logs in with an HttpOnly session cookie; NO token is held in
// JavaScript (the server keeps it in the session). After a reload, restore() asks GET /auth/me whether the session is still alive.
// `checked` = that question has been answered, so routes can wait instead of bouncing to /login.
export const useAuthStore = create((set, get) => ({
  token: null,                 // only a non-web client would ever set one; the web leaves it null
  user: null,
  role: null,
  isAuthenticated: false,
  checked: false,

  setAuth: (token, user) => set({ token, user, role: user.role, isAuthenticated: true, checked: true }),
  updateUser: (userData) => set((state) => ({ user: { ...state.user, ...userData } })),
  clearAuth: () => { useStaffDepartmentStore.getState().clear(); clearAllSelections(); set({ token: null, user: null, role: null, isAuthenticated: false, checked: true }) },   // D169: the department goes with the session

  restore: async () => {
    try {
      const { data } = await api.get('/auth/me', { skipAuthRedirect: true })
      get().setAuth(null, (data.data ?? data).user)
    } catch {
      set({ checked: true })
    }
  },

  hasRole: (role) => (Array.isArray(role) ? role.includes(get().role) : get().role === role),
}))

/** Sanctum's CSRF cookie (XSRF-TOKEN) must exist before the first POST of a session; axios then sends it back on same-origin requests */
export const ensureCsrf = () => api.get('/sanctum/csrf-cookie', { skipAuthRedirect: true }).catch(() => {})

bindAuthStore(useAuthStore)
