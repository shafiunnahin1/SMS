import { useTranslation } from 'react-i18next'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate } from '../../i18n/format'
import { fmtHijri } from './hijri'
import { useHijri } from './useHijri'

// D214 MAD.2 (madrasa.md section 2): the dashboard header shows today's date with the Hijri date beside it when the institution
// turned the Hijri calendar on; nothing otherwise (other institutions' dashboards stay as they were)
export default function HijriToday() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const { on, offset } = useHijri()
  if (!on) return null
  const now = new Date()
  const hijri = fmtHijri(now, locale, offset)
  return hijri ? <p className="text-sm text-content-muted -mt-2" data-testid="hijri-today">{t('hijri.today_line', { date: fmtDate(now, locale), hijri })}</p> : null
}
