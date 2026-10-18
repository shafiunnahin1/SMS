import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import BrandLogo from './parts/BrandLogo'
import NavItem from './parts/NavItem'
import NavDrawer from './parts/NavDrawer'
import MenuButton from './parts/MenuButton'
import UserMenu from './parts/UserMenu'
import LanguageSwitcher from './parts/LanguageSwitcher'
import PlanBanner from './parts/PlanBanner'
import PoweredBy from './parts/PoweredBy'
import NotificationBell from '../components/NotificationBell'
import { navIcon } from './parts/navIcons'

// docs/THEMING.md layout table: a 72px icon rail at the inline-start edge; a group opens a flyout towards the content (inline-end;
// the left in RTL); a large content area. Below 1024px the same drawer as sidebar-classic.
export default function SidebarMiniLayout({ nav, user, institution, theme, children }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(null)
  const group = nav.find(i => i.key === open)
  return (
    <div className="min-h-screen flex bg-surface-muted text-content" data-layout="sidebar-mini">
      <aside className="hidden lg:flex flex-col items-center w-[72px] shrink-0 bg-sidebar text-on-sidebar border-e print:hidden relative z-30">
        <div className="h-14 flex items-center justify-center"><BrandLogo institution={institution} theme={theme} compact /></div>
        <nav aria-label={t('common.menu')} data-testid="app-nav" className="flex flex-col items-center gap-1 py-2 overflow-y-auto">
          {nav.map(item => {
            const Icon = navIcon(item.icon)
            if (item.children) return (
              <button key={item.key} type="button" title={item.label} aria-label={item.label} aria-expanded={open === item.key}
                onClick={() => setOpen(o => (o === item.key ? null : item.key))}
                className={`h-11 w-11 inline-flex items-center justify-center rounded-token ${open === item.key ? 'bg-primary-soft' : 'hover:bg-primary-soft'}`}>
                <Icon aria-hidden="true" className="h-5 w-5" />
              </button>
            )
            return (
              <NavLink key={item.key} to={item.path} title={item.label} aria-label={item.label} onClick={() => setOpen(null)}
                className={({ isActive }) => `h-11 w-11 inline-flex items-center justify-center rounded-token ${isActive ? 'bg-primary text-on-primary' : 'hover:bg-primary-soft'}`}>
                <Icon aria-hidden="true" className="h-5 w-5" />
              </NavLink>
            )
          })}
        </nav>
        {group && (
          <div className="absolute top-0 start-full h-full w-60 bg-sidebar text-on-sidebar border-e shadow-card p-3 flex flex-col gap-1" data-testid="flyout">
            <p className="px-3 py-2 text-xs font-semibold uppercase opacity-70">{group.label}</p>
            {group.children.map(c => <NavItem key={c.key} item={c} onNavigate={() => setOpen(null)} />)}
          </div>
        )}
      </aside>
      <NavDrawer nav={nav} institution={institution} theme={theme} />
      <div className="flex-1 min-w-0 flex flex-col" onClick={() => open && setOpen(null)}>
        <header data-testid="app-topbar" className="h-14 flex items-center gap-3 px-4 bg-surface border-b print:hidden">
          <MenuButton />
          <div className="min-w-0"><BrandLogo institution={institution} theme={theme} /></div>
          <div className="ms-auto flex items-center gap-2"><LanguageSwitcher /><NotificationBell /><UserMenu user={user} /></div>
        </header>
        <PlanBanner institution={institution} />
        <main className="flex-1 p-density overflow-y-auto">{children}</main>
        <PoweredBy theme={theme} />
      </div>
    </div>
  )
}
