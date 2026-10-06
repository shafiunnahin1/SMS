import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import { Ellipsis } from 'lucide-react'
import BrandLogo from './parts/BrandLogo'
import NavItem from './parts/NavItem'
import UserMenu from './parts/UserMenu'
import LanguageSwitcher from './parts/LanguageSwitcher'
import PoweredBy from './parts/PoweredBy'
import { navIcon } from './parts/navIcons'

// docs/THEMING.md layout table: content max-w-md in the centre, an app-like tab bar at the bottom: up to 4 `primary` items + "More"
const flat = (nav) => nav.flatMap(i => i.children ? i.children.map(c => ({ ...c, icon: c.icon ?? i.icon })) : [i])

export default function MobileCompactLayout({ nav, user, institution, theme, children }) {
  const { t } = useTranslation()
  const [more, setMore] = useState(false)
  const items = flat(nav)
  const tabs = items.filter(i => i.primary).slice(0, 4)
  return (
    <div className="min-h-screen bg-surface-muted text-content" data-layout="mobile-compact">
      <header className="sticky top-0 z-30 bg-sidebar text-on-sidebar border-b print:hidden">
        <div className="max-w-md mx-auto h-14 flex items-center justify-between gap-2 px-4">
          <BrandLogo institution={institution} theme={theme} />
          <UserMenu user={user} compact />
        </div>
      </header>
      <main className="max-w-md mx-auto p-density pb-24">{children}<PoweredBy theme={theme} /></main>
      {more && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-end print:hidden" onClick={() => setMore(false)}>
          <nav aria-label={t('common.more')} className="w-full max-w-md mx-auto bg-surface rounded-t-[var(--radius)] p-3 flex flex-col gap-1 max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-end pb-2"><LanguageSwitcher /></div>
            {items.map(i => <NavItem key={i.key + i.path} item={i} onNavigate={() => setMore(false)} />)}
          </nav>
        </div>
      )}
      <nav aria-label={t('common.menu')} className="fixed bottom-0 inset-x-0 z-30 bg-surface border-t print:hidden">
        <ul className="max-w-md mx-auto grid grid-cols-5">
          {tabs.map(i => {
            const Icon = navIcon(i.icon)
            return (
              <li key={i.key}>
                <NavLink to={i.path} className={({ isActive }) => `flex flex-col items-center justify-center gap-1 h-16 text-xs ${isActive ? 'text-primary-fg font-semibold' : 'text-content-muted'}`}>
                  <Icon aria-hidden="true" className="h-5 w-5" /><span className="truncate max-w-full px-1">{i.label}</span>
                </NavLink>
              </li>
            )
          })}
          <li className={`col-start-5`}>
            <button type="button" onClick={() => setMore(true)} className="w-full flex flex-col items-center justify-center gap-1 h-16 text-xs text-content-muted">
              <Ellipsis aria-hidden="true" className="h-5 w-5" /><span>{t('common.more')}</span>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  )
}
