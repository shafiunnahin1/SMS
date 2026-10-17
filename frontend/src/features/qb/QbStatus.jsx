import { useTranslation } from 'react-i18next'

// A question's review state (D65 QB.2) as a word on a token-coloured chip - the word is always shown, never colour alone
const CLASS = { draft: 'bg-surface-muted text-content-muted', review: 'bg-primary-soft text-primary-fg', rejected: 'bg-surface-muted text-content', published: 'bg-primary text-on-primary' }

export default function QbStatus({ status }) {
  const { t } = useTranslation()
  return <span data-status={status} className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CLASS[status] ?? CLASS.draft}`}>{t(`qb.status.${status}`)}</span>
}
