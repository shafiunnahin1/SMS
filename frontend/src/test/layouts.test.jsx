import { vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import { buildNav } from '../nav/menu'
import SidebarClassicLayout from '../layouts/SidebarClassicLayout'
import SidebarMiniLayout from '../layouts/SidebarMiniLayout'
import TopNavLayout from '../layouts/TopNavLayout'
import MobileCompactLayout from '../layouts/MobileCompactLayout'

// docs/THEMING.md "Tests": every layout renders the same nav (Layout Contract), the institution, the bell and the page content
vi.mock('../api/axios', () => ({ bindAuthStore: () => {}, default: { get: vi.fn(() => Promise.resolve({ data: { data: [], meta: { unread: 2 } } })), patch: vi.fn() } }))
const nav = buildNav('admin', { modules: ['students', 'enrollments', 'fees'], settings: {}, roles: ['admin'], release: 'R1' }, k => k)
const props = { nav, user: { name: 'Admin', role: 'admin' }, institution: { name: 'Demo School', status: 'active' }, theme: { white_label: false } }
const leaves = nav.flatMap(i => i.children ?? [i])
const topLevelLeaves = nav.filter(i => !i.children).map(i => i.path)
const wrap = (ui) => <QueryClientProvider client={new QueryClient()}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>

// what each layout shows without a click: the classic sidebar all leaves; the icon rail and the top bar the top-level items (groups open
// on click); the tab bar the `primary` items
const EXPECTED = {
  'sidebar-classic': leaves.map(i => i.path),
  'sidebar-mini': topLevelLeaves,
  'topnav': topLevelLeaves,
  'mobile-compact': leaves.filter(i => i.primary).map(i => i.path),
}

describe.each([['sidebar-classic', SidebarClassicLayout], ['sidebar-mini', SidebarMiniLayout], ['topnav', TopNavLayout], ['mobile-compact', MobileCompactLayout]])('%s', (key, Layout) => {
  it('renders the page, the brand, the bell and the nav links', async () => {
    render(wrap(<Layout {...props}><p>PAGE BODY</p></Layout>))
    expect(screen.getByText('PAGE BODY')).toBeInTheDocument()
    expect(document.querySelector(`[data-layout="${key}"]`)).not.toBeNull()
    expect(screen.getAllByText('D').length + screen.queryAllByText('Demo School').length).toBeGreaterThan(0)
    expect(screen.getByTestId('bell')).toBeInTheDocument()
    // docs/E2E-TESTING.md section 5: the fixed data-testid contract the browser tests rely on
    expect(screen.getAllByTestId('app-nav').length).toBe(1)
    expect(screen.getAllByTestId('app-topbar').length).toBe(1)
    const hrefs = [...document.querySelectorAll('a')].map(a => a.getAttribute('href'))
    EXPECTED[key].forEach(p => expect(hrefs).toContain(p))
  })

  if (key === 'sidebar-classic') it('collapses the desktop menu while keeping the topbar and page viewport fixed', async () => {
    render(wrap(<SidebarClassicLayout {...props}><p>PAGE BODY</p></SidebarClassicLayout>))
    const shell = document.querySelector('[data-layout="sidebar-classic"]')
    const topbar = screen.getByTestId('app-topbar')
    const nav = screen.getByTestId('app-nav')
    expect(shell).toHaveClass('h-dvh', 'overflow-hidden')
    expect(topbar).toHaveClass('shrink-0')
    expect(nav).toHaveClass('min-h-0', 'flex-1', 'overflow-y-auto')
    fireEvent.click(screen.getByRole('button', { name: 'ম্যানুবার সংকুচিত করুন' }))
    expect(shell).toHaveAttribute('data-sidebar-collapsed', 'true')
  })

  it('shows the suspended banner only for a suspended institution', () => {
    const { unmount } = render(wrap(<Layout {...props}><p>x</p></Layout>))
    expect(screen.queryByRole('alert')).toBeNull()
    unmount()
    render(wrap(<Layout {...props} institution={{ name: 'Demo School', status: 'suspended' }}><p>x</p></Layout>))
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
