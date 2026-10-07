import { useRef } from 'react'
import { usePick } from './pick'

// docs/UI-PACKS.md section 6 "tabs": items[{key,label,badge?}], value, onChange; role="tablist", arrow keys, aria-selected.
// Arrow keys follow the reading direction: in rtl the left arrow key moves to the next tab (I18N.md section 4.2).
function UnderlineTabs({ items, value, onChange, label }) {
  const list = useRef(null)
  const onKey = (e) => {
    const rtl = getComputedStyle(list.current).direction === 'rtl'
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[e.key]   // theme-lint-ignore: keyboard key names, not icons
    let i = items.findIndex(it => it.key === value)
    if (step) i = (i + step + items.length) % items.length
    else if (e.key === 'Home') i = 0
    else if (e.key === 'End') i = items.length - 1
    else return
    e.preventDefault()
    onChange(items[i].key)
    list.current.querySelectorAll('[role="tab"]')[i]?.focus()
  }
  return (
    <div ref={list} role="tablist" aria-label={label} onKeyDown={onKey} className="flex gap-4 border-b overflow-x-auto">
      {items.map(it => {
        const active = it.key === value
        return (
          <button key={it.key} type="button" role="tab" aria-selected={active} tabIndex={active ? 0 : -1} onClick={() => onChange(it.key)}
            className={`py-2 text-sm whitespace-nowrap border-b-2 -mb-px inline-flex items-center gap-1 ${active ? 'border-primary text-primary-fg font-medium' : 'border-transparent text-content-muted'}`}>
            {it.label}
            {it.badge != null && <span className="rounded-full bg-primary-soft text-primary-fg px-2 text-xs">{it.badge}</span>}
          </button>
        )
      })}
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const TABS = { underline: UnderlineTabs }

export default function Tabs(props) {
  const V = usePick('tabs', TABS, 'underline')
  return <V {...props} />
}
