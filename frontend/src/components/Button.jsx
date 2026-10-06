import Loader from './Loader'

// Primary / secondary / ghost / danger. `loading` shows the only spinner the app uses (an inline action) and blocks double submits.
const VARIANT = {
  primary: 'bg-primary text-on-primary hover:opacity-90',
  secondary: 'bg-surface text-content [border:1px_solid_var(--line)] hover:bg-surface-muted',
  ghost: 'text-primary-fg hover:bg-primary-soft',
  danger: 'bg-red-600 text-white hover:opacity-90',
}

export default function Button({ variant = 'primary', loading = false, disabled, className = '', children, type = 'button', ...props }) {
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-token px-4 h-10 text-sm font-medium transition disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-fg ${VARIANT[variant]} ${className}`}
      {...props}>
      {loading && <Loader type="spinner" />}
      {children}
    </button>
  )
}
