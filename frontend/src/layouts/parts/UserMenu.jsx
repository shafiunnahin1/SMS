import { useTranslation } from 'react-i18next'
import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'

// Layout Contract: user name + logout (profile, password change and the light/dark toggle come with Step 3.5)
export default function UserMenu({ user, compact = false }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const logout = async () => {
    try { await api.post('/auth/logout') } catch { /* the token is dropped anyway */ }
    useAuthStore.getState().clearAuth()
    navigate('/login', { replace: true })
  }
  return (
    <div className="flex items-center gap-2 min-w-0">
      {!compact && <span dir="auto" className="hidden sm:inline text-sm truncate max-w-[10rem]">{user?.name}</span>}
      <button type="button" onClick={logout} className="inline-flex items-center gap-1 h-9 px-2 rounded-token text-sm hover:bg-primary-soft" data-testid="logout">
        <LogOut aria-hidden="true" className="h-4 w-4" /><span className={compact ? 'sr-only' : 'sr-only sm:not-sr-only'}>{t('common.logout')}</span>
      </button>
    </div>
  )
}
