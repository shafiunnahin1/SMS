import { useTranslation } from 'react-i18next'
import { Menu } from 'lucide-react'
import { useUiStore } from '../../store/uiStore'

export default function MenuButton({ className = 'lg:hidden' }) {
  const { t } = useTranslation()
  const toggleSidebar = useUiStore(s => s.toggleSidebar)
  return (
    <button type="button" onClick={toggleSidebar} className={`${className} h-9 w-9 inline-flex items-center justify-center rounded-token hover:bg-primary-soft`} aria-label={t('common.menu')}>
      <Menu aria-hidden="true" className="h-5 w-5" />
    </button>
  )
}
