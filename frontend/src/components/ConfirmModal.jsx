import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useUiStore } from '../store/uiStore'
import Button from './Button'

// docs/design/component-library.md "ConfirmModal": opened from anywhere with useUiStore().openConfirm({ title, description, type, onConfirm }).
// One instance in App. Focus goes to Cancel (the safe choice), Esc and the backdrop close it, Tab stays inside (UI-PACKS section 6 modal rules).
export default function ConfirmModal() {
  const { t } = useTranslation()
  const { confirmModal: c, closeConfirm } = useUiStore()
  const box = useRef(null)
  useEffect(() => {
    if (!c) return undefined
    const prev = document.activeElement
    box.current?.querySelector('[data-cancel]')?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') closeConfirm()
      if (e.key === 'Tab') {
        const f = [...box.current.querySelectorAll('button')]
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus() }
        else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.() }
  }, [c, closeConfirm])
  if (!c) return null
  const run = async () => { await c.onConfirm?.(); closeConfirm() }
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={closeConfirm}>
      <div ref={box} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-desc" onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-surface text-content rounded-token shadow-card p-density flex flex-col gap-3">
        <h2 id="confirm-title" className="text-lg font-semibold">{c.title}</h2>
        {c.description && <p id="confirm-desc" className="text-sm text-content-muted">{c.description}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" data-cancel onClick={closeConfirm}>{t('common.cancel')}</Button>
          <Button variant={c.type === 'danger' ? 'danger' : 'primary'} loading={c.loading} onClick={run}>{c.confirmLabel ?? t('common.confirm')}</Button>
        </div>
      </div>
    </div>
  )
}
