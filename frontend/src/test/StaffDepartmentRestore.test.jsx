import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'
import { useStaffDepartmentStore, storedDepartment } from '../store/staffDepartmentStore'
import { useRestoreStaffDepartment } from '../hooks/useRestoreStaffDepartment'

vi.mock('../api/axios', () => ({ default: { get: vi.fn() }, bindAuthStore: () => {} }))

// D232 STW.6: the department survives a reload in the same tab; the keys come from the server again, never from storage
describe('staff department kept per tab (D232)', () => {
  beforeEach(() => {
    api.get.mockReset()
    sessionStorage.clear()
    useStaffDepartmentStore.setState({ department: null, permissions: [], restoring: false })
    useAuthStore.setState({ user: { id: 33, role: 'institution_staff' } })
  })

  it('stores only the id and name, and clearing removes it', () => {
    useStaffDepartmentStore.getState().select({ id: 2, name: 'Desk' }, ['staff.online_class.read'], 33)
    expect(JSON.parse(sessionStorage.getItem('staff_department'))).toEqual({ id: 2, name: 'Desk', userId: 33 })
    expect(sessionStorage.getItem('staff_department')).not.toContain('staff.online_class')
    expect(localStorage.getItem('staff_department')).toBeNull()
    useStaffDepartmentStore.getState().clear()
    expect(storedDepartment()).toBeNull()
  })

  it('after a reload the kept department is checked again and its keys fetched', async () => {
    sessionStorage.setItem('staff_department', JSON.stringify({ id: 2, name: 'Desk', userId: 33 }))
    api.get.mockResolvedValue({ data: { data: { id: 2, name: 'Desk' }, permissions: ['staff.online_class.read'] } })
    renderHook(() => useRestoreStaffDepartment(true))
    await waitFor(() => expect(useStaffDepartmentStore.getState().department).toEqual({ id: 2, name: 'Desk' }))
    expect(api.get).toHaveBeenCalledWith('/staff/departments/2/portal')
    expect(useStaffDepartmentStore.getState().permissions).toEqual(['staff.online_class.read'])
  })

  it('a department the member left, or another user\'s choice, is dropped', async () => {
    sessionStorage.setItem('staff_department', JSON.stringify({ id: 2, name: 'Desk', userId: 33 }))
    api.get.mockRejectedValue({ response: { status: 403 } })
    renderHook(() => useRestoreStaffDepartment(true))
    await waitFor(() => expect(storedDepartment()).toBeNull())
    expect(useStaffDepartmentStore.getState().department).toBeNull()

    sessionStorage.setItem('staff_department', JSON.stringify({ id: 2, name: 'Desk', userId: 99 }))
    api.get.mockClear()
    renderHook(() => useRestoreStaffDepartment(true))
    expect(api.get).not.toHaveBeenCalled()
    expect(storedDepartment()).toBeNull()
  })

  it('does nothing for a user who is not staff', () => {
    sessionStorage.setItem('staff_department', JSON.stringify({ id: 2, name: 'Desk', userId: 33 }))
    renderHook(() => useRestoreStaffDepartment(false))
    expect(api.get).not.toHaveBeenCalled()
  })
})
