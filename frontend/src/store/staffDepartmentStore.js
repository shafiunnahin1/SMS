import { create } from 'zustand'

// D169 STW.1 (D91): the department a staff member works in right now and the duty keys they hold there; every request still sends
// it and the API checks it again. D232 STW.6: the id and name (never the keys) are kept per browser tab in sessionStorage, with the
// user's id, so a reload keeps the department; the keys are fetched again (useRestoreStaffDepartment) and logout clears it.
const KEY = 'staff_department'

const write = (value) => {
  try { value ? sessionStorage.setItem(KEY, JSON.stringify(value)) : sessionStorage.removeItem(KEY) } catch { /* storage off: memory only */ }
}

/** the stored {id, name, userId} or null */
export const storedDepartment = () => {
  try { const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null'); return v && Number.isInteger(v.id) && v.id > 0 ? v : null } catch { return null }
}

export const useStaffDepartmentStore = create((set) => ({
  department: null,          // { id, name }
  permissions: [],
  restoring: false,          // D232: the stored department is being checked again after a reload
  select: (department, permissions = [], userId = null) => {
    write(department ? { id: department.id, name: department.name, userId } : null)
    set({ department, permissions, restoring: false })
  },
  setRestoring: (restoring) => set({ restoring }),
  clear: () => { write(null); set({ department: null, permissions: [], restoring: false }) },
}))
