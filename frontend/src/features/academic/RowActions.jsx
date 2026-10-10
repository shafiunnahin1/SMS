import { useTranslation } from 'react-i18next'
import { Pencil, Trash2 } from 'lucide-react'

// Edit / delete buttons of one list row (keyboard reachable; the row click itself stays free for "open")
export default function RowActions({ onEdit, onDelete, name }) {
  const { t } = useTranslation()
  const btn = 'h-9 w-9 inline-flex items-center justify-center rounded-token hover:bg-primary-soft'
  return (
    <span className="inline-flex gap-1" onClick={e => e.stopPropagation()}>
      {onEdit && <button type="button" className={btn} onClick={onEdit} aria-label={`${t('common.edit')} ${name}`}><Pencil aria-hidden="true" className="h-4 w-4" /></button>}
      {onDelete && <button type="button" className={btn} onClick={onDelete} aria-label={`${t('common.delete')} ${name}`}><Trash2 aria-hidden="true" className="h-4 w-4" /></button>}
    </span>
  )
}
