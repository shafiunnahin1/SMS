import { useLocale } from '../../ui/I18nProvider'
import { fmtHijri } from './hijri'
import { useHijri } from './useHijri'

// D214 MAD.2: "(1 Shawwal 1447)" after a Gregorian date when the institution turned the Hijri calendar on; nothing otherwise
export default function HijriDate({ date }) {
  const { locale } = useLocale()
  const { on, offset } = useHijri()
  const text = on && date ? fmtHijri(date, locale, offset) : null
  return text ? <span className="text-content-muted" data-testid="hijri"> ({text})</span> : null
}
