import { create } from 'zustand'

// docs/templates/react-core-files.md "authStore", EXCEPT the token is kept in memory only: guardrail G8 forbids tokens in
// localStorage/sessionStorage (AUTHORIZATION.md says localStorage; the guardrail ranks higher - DECISIONS 2026-10-06 S (S5)).
// A reload therefore asks for the password again until Spike S7 settles Bearer vs cookie-SPA.
export const useAuthStore = create((set, get) => ({
  token: null,
  user: null,
  role: null,
  isAuthenticated: false,

  setAuth: (token, user) => set({ token, user, role: user.role, isAuthenticated: true }),
  updateUser: (userData) => set((state) => ({ user: { ...state.user, ...userData } })),
  clearAuth: () => set({ token: null, user: null, role: null, isAuthenticated: false }),

  hasRole: (role) => (Array.isArray(role) ? role.includes(get().role) : get().role === role),
}))
