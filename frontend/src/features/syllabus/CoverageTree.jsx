import { useTranslation } from 'react-i18next'
import Ltr from '../../components/bidi/Ltr'

// D224 SYL.3: a subject's unit tree with its coverage - lessons have a tick (when onToggle is given), chapters show covered when all
// their lessons are (derived by the server)
export default function CoverageTree({ data, onToggle, busy }) {
  const { t } = useTranslation()
  const node = (n, depth) => (
    <li key={n.id} className="flex flex-col gap-1">
      <div className={`flex items-center gap-2 ${depth ? 'ps-6' : ''}`}>
        {n.leaf && onToggle
          ? <input type="checkbox" checked={n.covered} disabled={busy} onChange={() => onToggle(n)} aria-label={n.title} data-unit={n.id} className="h-4 w-4" />
          : <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${n.covered ? 'bg-primary' : 'bg-surface-muted'}`} />}
        <span className={n.leaf ? '' : 'font-semibold'} dir="auto">{n.title}</span>
        {n.term && <span className="text-xs text-content-muted" dir="auto">· {n.term}</span>}
        {n.covered_on && <span className="text-xs text-content-muted"><Ltr>{n.covered_on}</Ltr></span>}
      </div>
      {n.children?.length > 0 && <ul className="flex flex-col gap-1">{n.children.map(c => node(c, depth + 1))}</ul>}
    </li>
  )
  return (
    <div className="flex flex-col gap-2" data-testid="coverage-tree">
      <p className="text-sm font-semibold" data-testid="coverage-percent">{t('syl.done', { percent: data.percent, covered: data.covered, leaves: data.leaves })}</p>
      {data.tree.length ? <ul className="flex flex-col gap-2">{data.tree.map(n => node(n, 0))}</ul> : <p className="text-sm text-content-muted">{t('syl.no_units')}</p>}
    </div>
  )
}
