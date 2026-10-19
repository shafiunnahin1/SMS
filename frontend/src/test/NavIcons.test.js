import { MENU } from '../nav/menu'
import { NAV_ICONS } from '../layouts/parts/navIcons'

// every icon name the menu uses has a real icon (an unknown name silently falls back to a plain circle)
describe('nav icons', () => {
  it('cover every menu item', () => {
    const names = new Set()
    const walk = (items) => items.forEach((i) => { if (i.icon) names.add(i.icon); if (i.children) walk(i.children) })
    Object.values(MENU).forEach(walk)
    expect([...names].filter((n) => !NAV_ICONS[n])).toEqual([])
  })
})
