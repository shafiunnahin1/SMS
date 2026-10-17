import { lazy } from 'react'

// docs/THEMING.md "layouts/registry.js": layout_key -> lazy component (an unknown key falls back to the default in AppShell)
export const LAYOUTS = {
  'sidebar-classic': lazy(() => import('./SidebarClassicLayout')),
  'sidebar-mini':    lazy(() => import('./SidebarMiniLayout')),
  'topnav':          lazy(() => import('./TopNavLayout')),
  'mobile-compact':  lazy(() => import('./MobileCompactLayout')),
}
export const DEFAULT_LAYOUT = 'sidebar-classic'
