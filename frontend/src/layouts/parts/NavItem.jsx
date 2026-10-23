import { NavLink } from 'react-router-dom'
import { navIcon } from './navIcons'

// Layout Contract: every nav item with an active state. The active mark is border-s (it moves to the right edge in RTL).
export default function NavItem({ item, onNavigate, compact = false }) {
  if (item.children) {
    const Icon = navIcon(item.icon)
    return (
      <div className="flex flex-col gap-1">
        <p title={item.label} className={`flex items-center px-3 pt-3 text-xs font-semibold uppercase opacity-70 ${compact ? 'justify-center' : 'gap-2'}`}><Icon aria-hidden="true" className="h-4 w-4" />{!compact && item.label}</p>
        {item.children.map(c => <NavItem key={c.key} item={c} onNavigate={onNavigate} compact={compact} />)}
      </div>
    )
  }
  const Icon = item.icon ? navIcon(item.icon) : null
  return (
    <NavLink to={item.path} onClick={onNavigate} title={item.label} aria-label={item.label}
      className={({ isActive }) => `flex items-center h-10 rounded-token text-sm border-s-4 ${compact ? 'justify-center w-11' : 'gap-3 px-3'} ${isActive ? 'border-primary bg-primary-soft font-semibold' : 'border-transparent hover:bg-primary-soft'}`}>
      {Icon ? <Icon aria-hidden="true" className="h-4 w-4 shrink-0" /> : <span className="w-4" />}
      {!compact && <span className="truncate">{item.label}</span>}
    </NavLink>
  )
}
