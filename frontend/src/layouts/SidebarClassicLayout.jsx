import { useTranslation } from 'react-i18next'
import { Menu, X } from 'lucide-react'
import BrandLogo from './parts/BrandLogo'
import NavItem from './parts/NavItem'
import UserMenu from './parts/UserMenu'
import LanguageSwitcher from './parts/LanguageSwitcher'
import PoweredBy from './parts/PoweredBy'
import { useUiStore } from '../store/uiStore'

// docs/THEMING.md layout table: a 260px sidebar at the inline-start edge (right in RTL) + a slim top bar; below 1024px a drawer
export default function SidebarClassicLayout({ nav, user, institution, theme, children }) {
  const { t } = useTranslation()
  const { sidebarOpen, toggleSidebar, closeSidebar } = useUiStore()
  const sidebar = (
    <nav aria-label={t('common.menu')} className="flex flex-col gap-1 p-3 overflow-y-auto">
      {nav.map(item => <NavItem key={item.key} item={item} onNavigate={closeSidebar} />)}
    </nav>
  )
  return (
    <div className="min-h-screen flex bg-surface-muted text-content" data-layout="sidebar-classic">
      <aside className="hidden lg:flex flex-col w-[260px] shrink-0 bg-sidebar text-on-sidebar border-e print:hidden">
        <div className="h-14 flex items-center px-4 border-b"><BrandLogo institution={institution} theme={theme} /></div>
        {sidebar}
      </aside>
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex print:hidden">
          <aside className="w-[260px] max-w-[85vw] bg-sidebar text-on-sidebar flex flex-col shadow-card">
            <div className="h-14 flex items-center justify-between px-4 border-b">
              <BrandLogo institution={institution} theme={theme} />
              <button type="button" onClick={closeSidebar} aria-label={t('common.close')} className="h-9 w-9 inline-flex items-center justify-center"><X aria-hidden="true" className="h-5 w-5" /></button>
            </div>
            {sidebar}
          </aside>
          <button type="button" aria-label={t('common.close')} className="flex-1 bg-black/40" onClick={closeSidebar} />
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 flex items-center gap-3 px-4 bg-surface border-b print:hidden">
          <button type="button" onClick={toggleSidebar} className="lg:hidden h-9 w-9 inline-flex items-center justify-center rounded-token hover:bg-primary-soft" aria-label={t('common.menu')}>
            <Menu aria-hidden="true" className="h-5 w-5" />
          </button>
          <div className="lg:hidden min-w-0"><BrandLogo institution={institution} theme={theme} compact /></div>
          <div className="ms-auto flex items-center gap-3"><LanguageSwitcher /><UserMenu user={user} /></div>
        </header>
        <main className="flex-1 p-density overflow-y-auto">{children}</main>
        <PoweredBy theme={theme} />
      </div>
    </div>
  )
}
