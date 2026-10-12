import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sigma } from 'lucide-react'
import Button from '../../components/Button'
import Modal from '../../ui/variants/Modal'
import { loadMathlive } from './mathlive'

// "Insert maths" (D66 QB.3): a mathlive <math-field> to build the formula; Insert hands back `$latex$` for the text field
export default function MathInsert({ onInsert, disabled, compact = false }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const field = useRef(null)
  useEffect(() => { if (open) loadMathlive().then(() => setReady(true)) }, [open])
  useEffect(() => { if (ready) setTimeout(() => field.current?.focus(), 0) }, [ready])   // the writer types the formula at once
  const insert = () => {
    const latex = field.current?.value?.trim()
    if (latex) onInsert(`$${latex}$`)
    setOpen(false)
  }
  return (
    <>
      {compact
        ? <button type="button" title={t('qb.math')} aria-label={t('qb.math')} onMouseDown={e => e.preventDefault()} onClick={() => setOpen(true)} disabled={disabled} data-action="math"
            className="inline-flex h-9 min-w-9 items-center justify-center rounded-token px-2 text-content hover:bg-primary-soft disabled:opacity-50"><Sigma aria-hidden="true" className="h-4 w-4" /></button>
        : <Button variant="secondary" onClick={() => setOpen(true)} disabled={disabled} data-action="math"><Sigma aria-hidden="true" className="h-4 w-4" />{t('qb.math')}</Button>}
      {open && (
        <Modal open onClose={() => setOpen(false)} title={t('qb.math')}>
          <div className="flex flex-col gap-3">
            {ready ? <math-field ref={field} dir="ltr" class="w-full rounded-token [border:1px_solid_var(--line)] p-2" data-testid="math-field" /> : <p className="text-sm text-content-muted">{t('common.loading')}</p>}
            <p className="text-xs text-content-muted">{t('qb.math_hint')}</p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
              <Button onClick={insert} disabled={!ready} data-action="math-insert">{t('qb.insert')}</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
