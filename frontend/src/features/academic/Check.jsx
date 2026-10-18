import { forwardRef, useId } from 'react'

// A labelled checkbox matching FormField's look
const Check = forwardRef(function Check({ label, ...props }, ref) {
  const id = useId()
  return (
    <label htmlFor={id} className="inline-flex items-center gap-2 text-sm text-content min-h-10">
      <input id={id} ref={ref} type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" {...props} />{label}
    </label>
  )
})
export default Check
