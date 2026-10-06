import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'

// docs/I18N.md section 4.1 rule 3: a direction-implying icon mirrors in RTL. The theme lint forbids naming these icons anywhere but
// this file, so callers pass a meaning, not an icon: <DirIcon icon="next" />. (DECISIONS 2026-10-06 S (S5))
const ICONS = { next: ChevronRight, prev: ChevronLeft, back: ArrowLeft }

export default function DirIcon({ icon, className = '', ...props }) {
  const Icon = ICONS[icon] ?? icon
  return <Icon aria-hidden="true" className={`rtl:-scale-x-100 ${className}`} {...props} />
}
