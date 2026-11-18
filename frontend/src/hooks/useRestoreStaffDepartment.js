import { useEffect } from 'react'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import { storedDepartment, useStaffDepartmentStore } from '../store/staffDepartmentStore'

// D232 STW.6: after a reload, the department kept in this tab is checked again through the existing portal endpoint; its duty keys
// come from the server, never from storage. Another user's or a department the member has left is dropped (the picker shows).
export function useRestoreStaffDepartment(active) {
  const userId = useAuthStore(s => s.user?.id)
  useEffect(() => {
    const store = useStaffDepartmentStore.getState()
    if (!active || !userId || store.department) return
    const saved = storedDepartment()
    if (!saved) return
    if (saved.userId !== userId) { store.clear(); return }
    let gone = false
    store.setRestoring(true)
    api.get(`/staff/departments/${saved.id}/portal`)
      .then(r => { if (!gone) useStaffDepartmentStore.getState().select({ id: r.data.data.id, name: r.data.data.name }, r.data.permissions ?? [], userId) })
      .catch(() => { if (!gone) useStaffDepartmentStore.getState().clear() })
    return () => { gone = true; useStaffDepartmentStore.getState().setRestoring(false) }
  }, [active, userId])
}
