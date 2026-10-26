import { create } from 'zustand'

// D169 STW.1 (D91): the department a staff member works in right now and the duty keys they hold there. Memory only - never
// browser storage - so a reload asks for the department again; every request still sends it and the API checks it again.
export const useStaffDepartmentStore = create((set) => ({
  department: null,          // { id, name }
  permissions: [],
  select: (department, permissions = []) => set({ department, permissions }),
  clear: () => set({ department: null, permissions: [] }),
}))
