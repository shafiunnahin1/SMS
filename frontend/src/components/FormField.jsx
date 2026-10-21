import { forwardRef, useId } from 'react'
import { Info } from 'lucide-react'
import { useTranslation } from 'react-i18next'

// One labelled input/select with its validation message. `ltr` for phone, ID, numbers (docs/I18N.md section 3.3).
const base = 'w-full h-10 rounded-token bg-surface text-content px-3 [border:1px_solid_var(--line)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-fg'

export const Input = forwardRef(function Input({ label, error, hint, ltr = false, className = '', onHelp, ...props }, ref) {
  const id = useId()
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <FieldLabel id={id} label={label} onHelp={onHelp} />}
      <input id={id} ref={ref} dir={ltr ? 'ltr' : undefined} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-e` : undefined}
        className={`${base} ${ltr ? 'text-start' : ''}`} {...props} />
      {hint && !error && <p className="text-xs text-content-muted">{hint}</p>}
      {error && <p id={`${id}-e`} className="text-xs text-red-600">{error}</p>}
    </div>
  )
})

export const Select = forwardRef(function Select({ label, error, options = [], placeholder, className = '', onHelp, ...props }, ref) {
  const id = useId()
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <FieldLabel id={id} label={label} onHelp={onHelp} />}
      <select id={id} ref={ref} aria-invalid={Boolean(error)} className={base} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
})

function FieldLabel({ id, label, onHelp }) {
  const { t } = useTranslation()
  return <div className="flex items-center justify-between gap-1">
    <label htmlFor={id} className="text-sm font-medium text-content">{label}</label>
    {onHelp && <button type="button" onClick={onHelp} aria-label={t('qbed.help_aria')} title={t('qbed.help_aria')}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-token text-content-muted hover:bg-primary-soft hover:text-primary-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-fg">
      <Info aria-hidden="true" className="h-4 w-4" />
    </button>}
  </div>
}

/** A labelled multi-line field (D65 QB.2: question, answer and explanation text) - same look and error line as Input */
export const Textarea = forwardRef(function Textarea({ label, error, hint, rows = 4, className = '', ...props }, ref) {
  const id = useId()
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <label htmlFor={id} className="text-sm font-medium text-content">{label}</label>}
      <textarea id={id} ref={ref} rows={rows} dir="auto" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-e` : undefined}
        className={base.replace('h-10', 'min-h-20 py-2')} {...props} />
      {hint && !error && <p className="text-xs text-content-muted">{hint}</p>}
      {error && <p id={`${id}-e`} className="text-xs text-red-600">{error}</p>}
    </div>
  )
})
