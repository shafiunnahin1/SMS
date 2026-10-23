import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import BrandLogo from './parts/BrandLogo'
import NavItem from './parts/NavItem'
import NavDrawer from './parts/NavDrawer'
import MenuButton from './parts/MenuButton'
import UserMenu from './parts/UserMenu'
import LanguageSwitcher from './parts/LanguageSwitcher'
import PlanBanner from './parts/PlanBanner'
import PoweredBy from './parts/PoweredBy'
import NotificationBell from '../components/NotificationBell'
import { useUiStore } from '../store/uiStore'

// docs/THEMING.md layout table: a 260px sidebar at the inline-start edge (right in RTL) + a slim top bar; below 1024px a drawer
export default function SidebarClassicLayout({ nav, user, institution, theme, children }) {
  const { t } = useTranslation()
  const closeSidebar = useUiStore(s => s.closeSidebar)
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="h-dvh min-h-0 flex overflow-hidden bg-surface-muted text-content" data-layout="sidebar-classic" data-sidebar-collapsed={collapsed ? 'true' : 'false'}>
      <aside className={`hidden lg:flex h-dvh min-h-0 flex-col shrink-0 bg-sidebar text-on-sidebar border-e print:hidden transition-[width] ${collapsed ? 'w-[72px]' : 'w-[260px]'}`}>
        <div className={`h-14 shrink-0 flex items-center border-b ${collapsed ? 'justify-center px-2' : 'px-4'}`}><BrandLogo institution={institution} theme={theme} compact={collapsed} /></div>
        <nav aria-label={t('common.menu')} data-testid="app-nav" className={`flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain ${collapsed ? 'items-center px-2 py-3' : 'p-3'}`}>
          {nav.map(item => <NavItem key={item.key} item={item} onNavigate={closeSidebar} compact={collapsed} />)}
        </nav>
      </aside>
      <NavDrawer nav={nav} institution={institution} theme={theme} />
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <header data-testid="app-topbar" className="h-14 shrink-0 flex items-center gap-3 px-4 bg-surface border-b print:hidden">
          <MenuButton />
          <button type="button" onClick={() => setCollapsed(value => !value)} className="hidden lg:inline-flex h-9 w-9 items-center justify-center rounded-token hover:bg-primary-soft"
            aria-label={collapsed ? t('common.sidebar_expand') : t('common.sidebar_collapse')} title={collapsed ? t('common.sidebar_expand') : t('common.sidebar_collapse')}>
            {collapsed ? <PanelLeftOpen aria-hidden="true" className="h-5 w-5" /> : <PanelLeftClose aria-hidden="true" className="h-5 w-5" />}
          </button>
          <div className="lg:hidden min-w-0"><BrandLogo institution={institution} theme={theme} compact /></div>
          <div className="ms-auto flex items-center gap-2"><LanguageSwitcher /><NotificationBell /><UserMenu user={user} /></div>
        </header>
        <PlanBanner institution={institution} />
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-density">{children}</main>
        <PoweredBy theme={theme} />
      </div>
    </div>
  )
}
