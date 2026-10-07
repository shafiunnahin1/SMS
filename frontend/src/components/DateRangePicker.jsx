import { useTranslation } from 'react-i18next'
import { Input } from './FormField'

// docs/design/component-library.md "DateRangePicker": value {from, to} (YYYY-MM-DD, Asia/Dhaka), onChange, presets (this month / last month / this year)
const ymd = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' })
export function rangePreset(key, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth()
  if (key === 'this_month') return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) }
  if (key === 'last_month') return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) }
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

export default function DateRangePicker({ value = {}, onChange, presets = false }) {
  const { t } = useTranslation()
  const set = (part) => (e) => {
    const next = { ...value, [part]: e.target.value }
    if (next.from && next.to && next.from > next.to) next[part === 'from' ? 'to' : 'from'] = e.target.value   // never an inverted range
    onChange?.(next)
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Input type="date" ltr label={t('range.from')} value={value.from ?? ''} onChange={set('from')} className="w-40" />
      <Input type="date" ltr label={t('range.to')} value={value.to ?? ''} onChange={set('to')} className="w-40" />
      {presets && ['this_month', 'last_month', 'this_year'].map(k => (
        <button key={k} type="button" onClick={() => onChange?.(rangePreset(k))} className="h-10 px-3 rounded-token text-sm text-primary-fg hover:bg-primary-soft">{t(`range.${k}`)}</button>
      ))}
    </div>
  )
}
