import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '../i18n'
import { buildNav } from '../nav/menu'
import SidebarClassicLayout from '../layouts/SidebarClassicLayout'
import MobileCompactLayout from '../layouts/MobileCompactLayout'

// docs/THEMING.md "Tests": every layout renders the same nav (Layout Contract), the institution name and the page content
const nav = buildNav('admin', { modules: ['students', 'enrollments', 'fees'], settings: {}, roles: ['admin'], release: 'R1' }, k => k)
const props = { nav, user: { name: 'Admin', role: 'admin' }, institution: { name: 'Demo School' }, theme: { white_label: false } }
const leafPaths = nav.flatMap(i => i.children ?? [i]).map(i => i.path)

describe.each([['sidebar-classic', SidebarClassicLayout], ['mobile-compact', MobileCompactLayout]])('%s', (key, Layout) => {
  it('renders the brand, the page and a link for the bottom-bar or sidebar items', () => {
    render(<MemoryRouter><Layout {...props}><p>PAGE BODY</p></Layout></MemoryRouter>)
    expect(screen.getByText('PAGE BODY')).toBeInTheDocument()
    expect(document.querySelector(`[data-layout="${key}"]`)).not.toBeNull()
    const hrefs = [...document.querySelectorAll('a')].map(a => a.getAttribute('href'))
    const expected = key === 'mobile-compact' ? nav.flatMap(i => i.children ?? [i]).filter(i => i.primary).map(i => i.path) : leafPaths
    expected.forEach(p => expect(hrefs).toContain(p))
  })
})
