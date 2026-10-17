import { TrendingDown, TrendingUp } from 'lucide-react'

// docs/design/component-library.md "StatCard" with the UI-PACKS section 6 props (label, value, delta?, icon?, tone?). This is the
// default (`bar`) look; Step 3.6 makes it the `stat_card` slot's default variant. The delta is never colour-only: arrow + sign + text.
export default function StatCard({ label, value, delta, icon: Icon, tone = 'primary', hint }) {
  const up = typeof delta === 'number' ? delta >= 0 : null
  return (
    <div className="bg-surface text-content rounded-token shadow-card p-density [border:var(--card-border)] flex gap-3 border-s-4 border-s-primary" data-tone={tone}>
      {Icon && <span className="h-10 w-10 shrink-0 rounded-token bg-primary-soft text-primary-fg inline-flex items-center justify-center"><Icon aria-hidden="true" className="h-5 w-5" /></span>}
      <div className="min-w-0">
        <p className="text-sm text-content-muted">{label}</p>
        <p className="text-2xl font-semibold text-content" dir="ltr">{value}</p>
        {up !== null && (
          <p className={`text-xs inline-flex items-center gap-1 ${up ? 'text-green-700' : 'text-red-700'}`}>
            {up ? <TrendingUp aria-hidden="true" className="h-3 w-3" /> : <TrendingDown aria-hidden="true" className="h-3 w-3" />}
            <span dir="ltr">{up ? '+' : ''}{delta}%</span>{hint && <span className="text-content-muted"> {hint}</span>}
          </p>
        )}
      </div>
    </div>
  )
}
