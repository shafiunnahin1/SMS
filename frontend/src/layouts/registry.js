import { lazy } from 'react'

// docs/THEMING.md "layouts/registry.js". The walking skeleton builds TWO layouts (walking-skeleton.md S5); sidebar-mini and topnav
// arrive with Step 3.3 and until then fall back to the default (AppShell: LAYOUTS[key] ?? DEFAULT).
export const LAYOUTS = {
  'sidebar-classic': lazy(() => import('./SidebarClassicLayout')),
  'mobile-compact':  lazy(() => import('./MobileCompactLayout')),
}
export const DEFAULT_LAYOUT = 'sidebar-classic'
