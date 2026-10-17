import { useTranslation } from 'react-i18next'

// Layout Contract: shown unless the plan is white-label
export default function PoweredBy({ theme }) {
  const { t } = useTranslation()
  if (theme?.white_label) return null
  return <p className="text-xs text-content-muted text-center py-3">{t('common.powered_by', { name: import.meta.env.VITE_APP_NAME ?? 'Education Management' })}</p>
}
