import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import { ChevronDown, X } from 'lucide-react'
import BrandLogo from './parts/BrandLogo'
import NavItem from './parts/NavItem'
import MenuButton from './parts/MenuButton'
import UserMenu from './parts/UserMenu'
import LanguageSwitcher from './parts/LanguageSwitcher'
import PlanBanner from './parts/PlanBanner'
import PoweredBy from './parts/PoweredBy'
import NotificationBell from '../components/NotificationBell'
import { useUiStore } from '../store/uiStore'

// docs/THEMING.md layout table: a horizontal menu with dropdowns on top, content max-w-7xl in the centre; below 1024px a hamburger
// opens a full-screen menu
export default function TopNavLayout({ nav, user, institution, theme, children }) {
  const { t } = useTranslation()
  const [drop, setDrop] = useState(null)
  const { sidebarOpen, closeSidebar } = useUiStore()
  const item = 'h-10 px-3 inline-flex items-center gap-1 rounded-token text-sm whitespace-nowrap'
  return (
    <div className="min-h-screen flex flex-col bg-surface-muted text-content" data-layout="topnav">
      <header className="bg-sidebar text-on-sidebar border-b print:hidden relative z-30">
        <div className="max-w-7xl mx-auto min-h-14 py-2 flex items-center gap-3 px-4">
          <MenuButton />
          <div className="shrink-0 max-w-[14rem]"><BrandLogo institution={institution} theme={theme} /></div>
          <nav aria-label={t('common.menu')} className="hidden lg:flex flex-1 flex-wrap items-center gap-1 ms-2 min-w-0">
            {nav.map(i => i.children ? (
              <div key={i.key} className="relative">
                <button type="button" aria-expanded={drop === i.key} onClick={() => setDrop(d => (d === i.key ? null : i.key))} className={`${item} hover:bg-primary-soft`}>
                  {i.label}<ChevronDown aria-hidden="true" className="h-4 w-4" />
                </button>
                {drop === i.key && (
                  <div className="absolute start-0 top-11 w-56 bg-surface text-content rounded-token shadow-card [border:var(--card-border)] p-2 flex flex-col gap-1" data-testid="dropdown">
                    {i.children.map(c => <NavItem key={c.key} item={c} onNavigate={() => setDrop(null)} />)}
                  </div>
                )}
              </div>
            ) : (
              <NavLink key={i.key} to={i.path} className={({ isActive }) => `${item} ${isActive ? 'bg-primary-soft font-semibold' : 'hover:bg-primary-soft'}`}>{i.label}</NavLink>
            ))}
          </nav>
          <div className="ms-auto shrink-0 flex items-center gap-2"><LanguageSwitcher /><NotificationBell /><UserMenu user={user} /></div>
        </div>
      </header>
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-surface text-content overflow-y-auto print:hidden" role="dialog" aria-modal="true" aria-label={t('common.menu')}>
          <div className="h-14 flex items-center justify-between px-4 border-b">
            <BrandLogo institution={institution} theme={theme} />
            <button type="button" onClick={closeSidebar} aria-label={t('common.close')} className="h-9 w-9 inline-flex items-center justify-center"><X aria-hidden="true" className="h-5 w-5" /></button>
          </div>
          <nav className="flex flex-col gap-1 p-3">{nav.map(i => <NavItem key={i.key} item={i} onNavigate={closeSidebar} />)}</nav>
        </div>
      )}
      <PlanBanner institution={institution} />
      <main className="flex-1 w-full max-w-7xl mx-auto p-density" onClick={() => drop && setDrop(null)}>{children}</main>
      <PoweredBy theme={theme} />
    </div>
  )
}
