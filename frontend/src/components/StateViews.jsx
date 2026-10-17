import { useTranslation } from 'react-i18next'
import { Inbox, TriangleAlert } from 'lucide-react'
import Button from './Button'

// Empty and error states every page shows (AGENTS.md Definition of Done: loading, empty, error)
export function EmptyState({ title, description, action }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-content-muted" data-testid="empty-state">
      <Inbox aria-hidden="true" className="h-10 w-10" />
      <p className="font-medium text-content">{title ?? t('common.empty')}</p>
      {description && <p className="text-sm">{description}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ onRetry, message }) {
  const { t } = useTranslation()
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 py-10 text-center" data-testid="error-state">
      <TriangleAlert aria-hidden="true" className="h-10 w-10 text-red-600" />
      <p className="text-content">{message ?? t('common.error')}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>{t('common.retry')}</Button>}
    </div>
  )
}
