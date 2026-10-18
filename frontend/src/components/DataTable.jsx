import { useTranslation } from 'react-i18next'
import Loader from './Loader'
import DirIcon from './DirIcon'
import { EmptyState, ErrorState } from './StateViews'

// docs/design/component-library.md "DataTable": loading -> skeleton rows; empty and error states built in.
// Under 768px every pack shows cards (first 3 columns, docs/UI-PACKS.md); the spike ships the classic table >= 768px.
// A column marked `action: true` (row buttons) is never one of the 3 and sits beside the card, so phones keep edit/delete.
export default function DataTable({ columns, data = [], loading, error, onRetry, pagination, onRowClick, empty, rowKey = 'id' }) {
  const { t } = useTranslation()
  if (loading) return <Loader type="skeleton" rows={6} />
  if (error) return <ErrorState onRetry={onRetry} />
  if (!data.length) return empty ?? <EmptyState />

  const cell = (c, row) => (c.render ? c.render(row) : row[c.key])
  const info = columns.filter(c => !c.action)
  const actions = columns.filter(c => c.action)
  return (
    <div>
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-content-muted">{columns.map(c => <th key={c.key} scope="col" className={`py-2 px-3 font-medium ${c.numeric ? 'text-end' : 'text-start'}`}>{c.label}</th>)}</tr></thead>
          <tbody>
            {data.map(row => (
              <tr key={row[rowKey]} onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b h-row ${onRowClick ? 'cursor-pointer hover:bg-primary-soft' : ''}`}>
                {columns.map(c => <td key={c.key} className={`py-2 px-3 ${c.numeric ? 'text-end' : 'text-start'}`}>{cell(c, row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="md:hidden flex flex-col gap-2">
        {data.map(row => (
          <li key={row[rowKey]} className="flex items-start gap-1 bg-surface rounded-token [border:var(--card-border)] shadow-card">
            <button type="button" onClick={onRowClick ? () => onRowClick(row) : undefined}
              className="flex-1 min-w-0 text-start rounded-token p-density flex flex-col gap-1">
              {info.slice(0, 3).map((c, i) => (
                <span key={c.key} className={i === 0 ? 'font-medium text-content' : 'text-sm text-content-muted'}>
                  {i > 0 && <span className="me-1">{c.label}:</span>}{cell(c, row)}
                </span>
              ))}
            </button>
            {/* `action` columns (edit / delete buttons) sit beside the card, never inside its button */}
            {actions.map(c => <span key={c.key} className="p-1">{cell(c, row)}</span>)}
          </li>
        ))}
      </ul>
      {pagination && pagination.last > 1 && (
        <nav className="flex items-center justify-end gap-2 pt-3 text-sm" aria-label={t('common.page', { page: pagination.page, last: pagination.last })}>
          <button type="button" className="h-9 w-9 inline-flex items-center justify-center rounded-token hover:bg-primary-soft disabled:opacity-40" disabled={pagination.page <= 1}
            onClick={() => pagination.onChange(pagination.page - 1)} aria-label={t('common.previous')}><DirIcon icon="prev" className="h-4 w-4" /></button>
          <span className="text-content-muted">{t('common.page', { page: pagination.page, last: pagination.last })}</span>
          <button type="button" className="h-9 w-9 inline-flex items-center justify-center rounded-token hover:bg-primary-soft disabled:opacity-40" disabled={pagination.page >= pagination.last}
            onClick={() => pagination.onChange(pagination.page + 1)} aria-label={t('common.next')}><DirIcon icon="next" className="h-4 w-4" /></button>
        </nav>
      )}
    </div>
  )
}
