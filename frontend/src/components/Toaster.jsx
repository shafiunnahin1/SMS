import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useUiStore } from '../store/uiStore'

const TONE = { success: 'bg-green-600 text-white', error: 'bg-red-600 text-white', warning: 'bg-amber-500 text-white', info: 'bg-primary text-on-primary' }

export default function Toaster() {
  const { t } = useTranslation()
  const { toasts, removeToast } = useUiStore()
  return (
    <div aria-live="assertive" className="fixed bottom-20 md:bottom-4 inset-x-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none">
      {toasts.map(x => (
        <div key={x.id} role="status" className={`pointer-events-auto flex items-center gap-3 rounded-token px-4 py-2 text-sm shadow-card max-w-md ${TONE[x.type] ?? TONE.info}`}>
          <span>{x.message}</span>
          <button type="button" onClick={() => removeToast(x.id)} aria-label={t('common.close')}><X aria-hidden="true" className="h-4 w-4" /></button>
        </div>
      ))}
    </div>
  )
}
