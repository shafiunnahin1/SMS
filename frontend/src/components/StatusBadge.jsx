import { useTranslation } from 'react-i18next'

// docs/design/component-library.md "StatusBadge": a known status gets its tone and its translated word; never colour alone (the word is shown)
const TONE = {
  active: 'success', paid: 'success', present: 'success', published: 'info', granted: 'success', ongoing: 'info', sent: 'success', failed: 'danger',
  inactive: 'danger', suspended: 'danger', expired: 'danger', trial: 'info', absent: 'danger', due: 'warning', partial: 'warning', pending: 'warning', late: 'warning', leave: 'muted', revoked: 'muted',
  // D209: admission list and cycle states
  list_selected: 'success', list_admitted: 'success', list_waiting: 'warning', list_rejected: 'muted', list_declined: 'muted', cycle_open: 'info', cycle_testing: 'warning', cycle_listing: 'info', memo_issued: 'success', memo_cancelled: 'muted',
}
const CLASS = {
  success: 'bg-green-100 text-green-800', danger: 'bg-red-100 text-red-800', warning: 'bg-amber-100 text-amber-800',
  info: 'bg-primary-soft text-primary-fg', muted: 'bg-surface-muted text-content-muted',
}

export default function StatusBadge({ status, size = 'sm' }) {
  const { t } = useTranslation()
  const tone = TONE[status] ?? 'muted'
  return (
    <span data-status={status} className={`inline-flex items-center rounded-full font-medium ${size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'} ${CLASS[tone]}`}>
      {t(`status.${status}`, { defaultValue: status })}
    </span>
  )
}
