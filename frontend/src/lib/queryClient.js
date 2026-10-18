import { QueryClient } from '@tanstack/react-query'

// docs/architecture/redis-cache-strategy.md "React Query Cache Config" (cacheTime is called gcTime in TanStack Query v5).
// Per-query overrides: attendance 0 (always fresh), dashboard 1 min, programs 1 h.
export const STALE = { attendance: 0, dashboard: 60 * 1000, programs: 60 * 60 * 1000 }

export const makeQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5 * 60 * 1000, gcTime: 10 * 60 * 1000, refetchOnWindowFocus: false, retry: 1 },
  },
})
