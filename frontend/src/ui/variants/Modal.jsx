import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePick } from './pick'

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

// docs/UI-PACKS.md section 6 "modal": open, onClose, title, children, actions; focus trap, Esc/backdrop close, role="dialog".
// The `dialog` variant; under 768px it rises from the bottom like a sheet in every pack (section 6, pack-neutral responsive rule).
function DialogModal({ open, onClose, title, children, actions }) {
  const { t } = useTranslation()
  const box = useRef(null)
  const titleId = useId()
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    if (!open) return undefined
    const prev = document.activeElement
    box.current?.querySelector(FOCUSABLE)?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') close.current()
      if (e.key === 'Tab') {
        const f = [...box.current.querySelectorAll(FOCUSABLE)]
        if (!f.length) return
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus() }
        else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 md:p-4" onClick={onClose}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={e => e.stopPropagation()}
        className="w-full md:max-w-lg max-h-[90vh] overflow-y-auto bg-surface text-content rounded-t-token md:rounded-token shadow-card p-density flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="p-1 rounded-token text-content-muted hover:bg-primary-soft">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <div>{children}</div>
        {actions && <div className="flex justify-end gap-2">{actions}</div>}
      </div>
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const MODALS = { dialog: DialogModal }

export default function Modal(props) {
  const V = usePick('modal', MODALS, 'dialog')
  return <V {...props} />
}
