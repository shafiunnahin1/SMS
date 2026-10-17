import { useTranslation } from 'react-i18next'

// docs/design/component-library.md "Loader" + owner request 2026-10-06 (DECISIONS): every page / section loading state is a SKELETON
// shaped like the content it replaces; a spinner is only for an inline action (a saving button). Token colours only, aria-busy,
// no shimmer under prefers-reduced-motion (tokens.css .skeleton).
//   <Loader type="page" />            whole page: title bar, stat cards, table rows
//   <Loader type="skeleton" rows={5}/> table rows (DataTable loading)
//   <Loader type="form" fields={4} />  a form
//   <Loader type="cards" count={3} />  a list of cards
//   <Loader type="spinner" />          inline only
const Bar = ({ className = '' }) => <div className={`skeleton ${className}`} />

function Rows({ rows = 5 }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 h-row">
          <Bar className="h-4 w-1/4" /><Bar className="h-4 w-1/3" /><Bar className="h-4 flex-1" />
        </div>
      ))}
    </div>
  )
}

function Cards({ count = 3 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="bg-surface rounded-token shadow-card p-density [border:var(--card-border)] flex flex-col gap-2">
          <Bar className="h-3 w-1/2" /><Bar className="h-6 w-2/3" />
        </div>
      ))}
    </div>
  )
}

function Fields({ fields = 4 }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-2"><Bar className="h-3 w-24" /><Bar className="h-10 w-full" /></div>
      ))}
      <Bar className="h-10 w-32" />
    </div>
  )
}

export default function Loader({ type = 'page', rows = 5, count = 3, fields = 4, fullScreen = false }) {
  const { t } = useTranslation()
  if (type === 'spinner') {
    return <span role="status" aria-label={t('common.loading')} className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin motion-reduce:animate-none" />
  }
  const body = {
    skeleton: <Rows rows={rows} />,
    cards: <Cards count={count} />,
    form: <Fields fields={fields} />,
    page: (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3"><Bar className="h-7 w-48" /><Bar className="h-9 w-28" /></div>
        <Cards count={count} />
        <div className="bg-surface rounded-token shadow-card p-density [border:var(--card-border)]"><Rows rows={rows} /></div>
      </div>
    ),
  }[type] ?? <Rows rows={rows} />

  return (
    <div role="status" aria-busy="true" aria-live="polite" data-testid={`loader-${type}`} className={fullScreen ? 'min-h-screen p-density bg-surface-muted' : ''}>
      <span className="sr-only">{t('common.loading')}</span>
      {body}
    </div>
  )
}
