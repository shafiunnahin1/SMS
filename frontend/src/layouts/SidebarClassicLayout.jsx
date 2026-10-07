import { useTranslation } from 'react-i18next'
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
  return (
    <div className="min-h-screen flex bg-surface-muted text-content" data-layout="sidebar-classic">
      <aside className="hidden lg:flex flex-col w-[260px] shrink-0 bg-sidebar text-on-sidebar border-e print:hidden">
        <div className="h-14 flex items-center px-4 border-b"><BrandLogo institution={institution} theme={theme} /></div>
        <nav aria-label={t('common.menu')} className="flex flex-col gap-1 p-3 overflow-y-auto">
          {nav.map(item => <NavItem key={item.key} item={item} onNavigate={closeSidebar} />)}
        </nav>
      </aside>
      <NavDrawer nav={nav} institution={institution} theme={theme} />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-14 flex items-center gap-3 px-4 bg-surface border-b print:hidden">
          <MenuButton />
          <div className="lg:hidden min-w-0"><BrandLogo institution={institution} theme={theme} compact /></div>
          <div className="ms-auto flex items-center gap-2"><LanguageSwitcher /><NotificationBell /><UserMenu user={user} /></div>
        </header>
        <PlanBanner institution={institution} />
        <main className="flex-1 p-density overflow-y-auto">{children}</main>
        <PoweredBy theme={theme} />
      </div>
    </div>
  )
}
