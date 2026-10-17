import { create } from 'zustand'

// docs/templates/react-core-files.md "uiStore" (the parts the spike uses)
let toastId = 0

export const useUiStore = create((set) => ({
  sidebarOpen: false,
  toasts: [],
  confirmModal: null,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  closeSidebar: () => set({ sidebarOpen: false }),

  addToast: (message, type = 'success', duration = 4000) => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), duration)
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  openConfirm: (config) => set({ confirmModal: config }),
  closeConfirm: () => set({ confirmModal: null }),
}))
