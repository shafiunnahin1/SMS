import { useQuery } from '@tanstack/react-query'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'

// D206 TDM.4: is this teacher a member of any department (GET /staff/departments)? Only then do they see the department work.
export function useTeacherDepartments() {
  const role = useAuthStore(s => s.role ?? s.user?.role)
  const q = useQuery({ queryKey: ['teacher-departments'], enabled: role === 'teacher', staleTime: 60_000,
    queryFn: () => api.get('/staff/departments').then(r => r.data.data ?? []) })
  return { member: role === 'teacher' && (q.data?.length ?? 0) > 0, departments: q.data ?? [] }
}
