import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'

// D214 MAD.2: the institution's secondary-calendar setting ({on, offset}); off while loading or on error
export function useHijri() {
  const q = useQuery({ queryKey: ['settings', 'calendar'], staleTime: 5 * 60 * 1000, retry: false, queryFn: () => api.get('/settings/calendar').then(r => r.data.data) })
  return { on: q.data?.secondary === 'hijri', offset: q.data?.hijri_offset ?? 0 }
}
