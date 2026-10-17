import { useAuthStore } from '../store/authStore'

// docs/design/component-library.md "Can": show children only to the given role(s). UI convenience only - the server's RoleMiddleware decides.
// eslint-disable-next-line react-refresh/only-export-components
export function usePermission() {
  const role = useAuthStore(s => s.role)
  const hasRole = (r) => (Array.isArray(r) ? r.includes(role) : r === role)
  return { role, hasRole, can: hasRole }
}

export default function Can({ role, children, fallback = null }) {
  const { hasRole } = usePermission()
  return hasRole(role) ? children : fallback
}
