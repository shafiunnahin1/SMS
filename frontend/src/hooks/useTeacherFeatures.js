import { useQuery } from '@tanstack/react-query'
import api from '../api/axios'
import { useAuthStore } from '../store/authStore'

// D205 PERM.2: the signed-in teacher's switched-off features (GET /teacher/features). The menu and buttons hide them; the server
// refuses them anyway (403 feature_off). Other roles: nothing is off.
export function useTeacherFeatures() {
  const role = useAuthStore(s => s.role ?? s.user?.role)
  const q = useQuery({ queryKey: ['teacher-features'], enabled: role === 'teacher', staleTime: 60_000,
    queryFn: () => api.get('/teacher/features').then(r => r.data.data.off ?? []) })
  const off = role === 'teacher' ? (q.data ?? []) : []
  // a button into a feature waits until the teacher's list is known (no flash of a link that is switched off)
  const known = role !== 'teacher' || q.isSuccess
  return { off, on: (key) => known && !off.includes(key) }
}
