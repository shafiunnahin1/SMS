import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sigma } from 'lucide-react'
import Button from '../../components/Button'
import { Select } from '../../components/FormField'
import Modal from '../../ui/variants/Modal'
import { loadMathlive } from './mathlive'

export const MATH_FONT_STYLES = {
  normal: { fontFamily: 'none', variant: 'normal', variantStyle: '' },
  roman: { fontFamily: 'roman', variant: 'main', variantStyle: 'up' },
  sans: { fontFamily: 'sans-serif', variant: 'sans-serif', variantStyle: 'up' },
  monospace: { fontFamily: 'monospace', variant: 'monospace', variantStyle: 'up' },
  bold: { fontFamily: 'none', variant: 'normal', variantStyle: 'bold' },
  italic: { fontFamily: 'none', variant: 'normal', variantStyle: 'italic' },
  doubleStruck: { fontFamily: 'none', variant: 'double-struck', variantStyle: 'up' },
  calligraphic: { fontFamily: 'none', variant: 'calligraphic', variantStyle: 'up' },
  fraktur: { fontFamily: 'none', variant: 'fraktur', variantStyle: 'up' },
}

export function applyMathFont(field, font) {
  const style = MATH_FONT_STYLES[font]
  if (!field || !style) return false
  field.applyStyle(style)
  field.focus()
  return true
}

// "Insert maths" (D66 QB.3): a mathlive <math-field> to build the formula; Insert hands back `$latex$` for the text field
export default function MathInsert({ onInsert, disabled, compact = false }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const [font, setFont] = useState('roman')
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
            <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Select label={t('qbed.math_font')} value={font} onChange={e => setFont(e.target.value)}
                options={Object.keys(MATH_FONT_STYLES).map(style => ({ value: style, label: t(`qbed.math_fonts.${style}`) }))} />
              <Button variant="secondary" onClick={() => applyMathFont(field.current, font)} data-action="math-font-apply">{t('qbed.apply_math_font')}</Button>
            </div>
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
