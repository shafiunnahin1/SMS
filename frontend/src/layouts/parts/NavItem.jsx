import { NavLink } from 'react-router-dom'
import { navIcon } from './navIcons'

// Layout Contract: every nav item with an active state. The active mark is border-s (it moves to the right edge in RTL).
export default function NavItem({ item, onNavigate }) {
  if (item.children) {
    const Icon = navIcon(item.icon)
    return (
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 px-3 pt-3 text-xs font-semibold uppercase opacity-70"><Icon aria-hidden="true" className="h-4 w-4" />{item.label}</p>
        {item.children.map(c => <NavItem key={c.key} item={c} onNavigate={onNavigate} />)}
      </div>
    )
  }
  const Icon = item.icon ? navIcon(item.icon) : null
  return (
    <NavLink to={item.path} onClick={onNavigate}
      className={({ isActive }) => `flex items-center gap-3 px-3 h-10 rounded-token text-sm border-s-4 ${isActive ? 'border-primary bg-primary-soft font-semibold' : 'border-transparent hover:bg-primary-soft'}`}>
      {Icon ? <Icon aria-hidden="true" className="h-4 w-4 shrink-0" /> : <span className="w-4" />}
      <span className="truncate">{item.label}</span>
    </NavLink>
  )
}
