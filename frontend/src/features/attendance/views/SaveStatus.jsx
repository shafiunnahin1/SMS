import { useTranslation } from 'react-i18next'
import { CircleCheck, CircleDashed, CirclePause } from 'lucide-react'
import { useLocale } from '../../../ui/I18nProvider'
import { fmtTime } from '../../../i18n/format'

// Whether this batch + date was saved before (owner feedback 2026-10-07): every attendance.take view shows the same badge.
// saved = data.saved from GET /attendance; dirty = marks differ from what is saved (or nothing is saved yet).
export default function SaveStatus({ saved, dirty, total }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const was = saved?.count > 0
  const [state, Icon, tone] = was && dirty ? ['changed', CirclePause, 'bg-amber-100 text-amber-800']
    : was ? ['saved', CircleCheck, 'bg-green-100 text-green-800'] : ['new', CircleDashed, 'bg-surface-muted text-content-muted']
  return (
    <p role="status" data-saved-state={state} className={`inline-flex flex-wrap items-center gap-1 rounded-token px-2 py-1 text-xs font-medium ${tone}`}>
      <Icon aria-hidden="true" className="h-4 w-4" />
      {state === 'new' && t('attendance.state.new')}
      {state !== 'new' && t(`attendance.state.${state}`, { count: saved.count, total })}
      {was && saved.first_saved_at && <span className="font-normal">· {t('attendance.state.when', { time: fmtTime(saved.first_saved_at, locale), by: saved.taken_by ?? '—' })}</span>}
    </p>
  )
}
