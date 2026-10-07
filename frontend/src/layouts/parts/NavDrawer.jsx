import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import BrandLogo from './BrandLogo'
import NavItem from './NavItem'
import { useUiStore } from '../../store/uiStore'

// The below-1024px drawer shared by the sidebar layouts: it slides in from the inline-start edge (the right in RTL)
export default function NavDrawer({ nav, institution, theme }) {
  const { t } = useTranslation()
  const { sidebarOpen, closeSidebar } = useUiStore()
  if (!sidebarOpen) return null
  return (
    <div className="lg:hidden fixed inset-0 z-40 flex print:hidden" role="dialog" aria-modal="true" aria-label={t('common.menu')}>
      <aside className="w-[260px] max-w-[85vw] bg-sidebar text-on-sidebar flex flex-col shadow-card">
        <div className="h-14 flex items-center justify-between px-4 border-b">
          <BrandLogo institution={institution} theme={theme} />
          <button type="button" onClick={closeSidebar} aria-label={t('common.close')} className="h-9 w-9 inline-flex items-center justify-center"><X aria-hidden="true" className="h-5 w-5" /></button>
        </div>
        <nav aria-label={t('common.menu')} className="flex flex-col gap-1 p-3 overflow-y-auto">
          {nav.map(item => <NavItem key={item.key} item={item} onNavigate={closeSidebar} />)}
        </nav>
      </aside>
      <button type="button" aria-label={t('common.close')} className="flex-1 bg-black/40" onClick={closeSidebar} />
    </div>
  )
}
