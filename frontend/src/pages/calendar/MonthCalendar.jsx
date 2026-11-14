import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import { useLocale } from '../../ui/I18nProvider'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import DirIcon from '../../components/DirIcon'
import { ErrorState } from '../../components/StateViews'
import { fmtDate } from '../../i18n/format'
import HijriDate from '../../features/hijri/HijriDate'

const pad = (n) => String(n).padStart(2, '0')
const TAG = { bn: 'bn-BD-u-nu-latn', en: 'en-BD', ar: 'ar-u-nu-latn' }   // I18N.md 3.4: Latin digits
const ym = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`

// D213 CAL.2: one month - holidays, exams, events and the weekly holiday. `endpoint` is /calendar (signed in) or /public/calendar.
// The week starts on Saturday; each day lists its items with a word (never colour alone).
export default function MonthCalendar({ endpoint = '/calendar' }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const [month, setMonth] = useState(() => ym(new Date()))
  const q = useQuery({ queryKey: ['calendar', endpoint, month], queryFn: () => api.get(endpoint, { params: { month } }).then(r => r.data.data) })
  const [y, m] = month.split('-').map(Number)
  const shift = (n) => setMonth(ym(new Date(y, m - 1 + n, 1)))
  const title = new Intl.DateTimeFormat(TAG[locale] ?? TAG.bn, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(y, m - 1, 1))
  const days = new Date(y, m, 0).getDate()
  const lead = (new Date(y, m - 1, 1).getDay() + 1) % 7   // Saturday first
  const weekdays = [6, 0, 1, 2, 3, 4, 5].map(d => new Intl.DateTimeFormat(TAG[locale] ?? TAG.bn, { weekday: 'short' }).format(new Date(2026, 10, 1 + d)))
  const items = (date) => {
    if (!q.data) return []
    const out = []
    for (const h of q.data.holidays) if (h.date === date) out.push({ kind: 'holiday', label: h.title })
    for (const e of q.data.exams) if (e.start_date <= date && e.end_date >= date) out.push({ kind: 'exam', label: e.name + (e.program ? ` (${e.program})` : '') })
    for (const e of q.data.events) if (e.date === date) out.push({ kind: 'event', label: (e.start_time ? `${e.start_time} ` : '') + e.title })
    return out
  }
  const tone = { holiday: 'text-red-700', exam: 'text-primary-fg', event: 'text-green-700' }   // theme-lint-ignore: the word beside it carries the meaning
  return (
    <div className="flex flex-col gap-3" data-testid="month-calendar">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => shift(-1)} aria-label={t('cal.prev')}><DirIcon icon="prev" /></Button>
        <h2 className="font-semibold" data-testid="month-title">{title}</h2>
        <Button variant="ghost" onClick={() => shift(1)} aria-label={t('cal.next')}><DirIcon icon="next" /></Button>
      </div>
      {q.isLoading ? <Loader /> : q.isError ? <ErrorState onRetry={q.refetch} /> : (
        <>
          <div className="grid grid-cols-7 gap-1 text-xs">
            {weekdays.map((w) => <div key={w} className="text-center text-content-muted py-1">{w}</div>)}
            {Array.from({ length: lead }).map((_, i) => <div key={`x${i}`} />)}
            {Array.from({ length: days }).map((_, i) => {
              const date = `${month}-${pad(i + 1)}`
              const weekly = q.data.weekly_holidays.includes(((new Date(y, m - 1, i + 1).getDay() + 6) % 7) + 1)
              const list = items(date)
              return (
                <div key={date} data-date={date} className={`min-h-16 rounded-token p-1 border border-border-subtle ${weekly ? 'bg-surface-muted' : 'bg-surface'}`}>
                  <div className="text-content-muted">{i + 1}</div>
                  {list.map((it, k) => <div key={k} className={`truncate ${tone[it.kind]}`} title={`${t(`cal.kind.${it.kind}`)}: ${it.label}`}>{it.label}</div>)}
                </div>
              )
            })}
          </div>
          <ul className="flex flex-wrap gap-3 text-xs" aria-label={t('cal.legend')}>
            {['holiday', 'exam', 'event'].map(k => <li key={k} className={tone[k]}>■ {t(`cal.kind.${k}`)}</li>)}
            <li className="text-content-muted">■ {t('cal.kind.weekly')}</li>
          </ul>
          <p className="text-sm">{t('hijri.today')}: {fmtDate(new Date(), locale)}<HijriDate date={new Date().toISOString().slice(0, 10)} /></p>
          <MonthList data={q.data} t={t} locale={locale} />
        </>
      )}
    </div>
  )
}

// the same month as a list (readable on a phone and by screen readers)
function MonthList({ data, t, locale }) {
  const rows = [
    ...data.holidays.map(h => ({ d: h.date, k: 'holiday', l: h.title })),
    ...data.exams.map(e => ({ d: e.start_date, k: 'exam', l: `${e.name}${e.program ? ` (${e.program})` : ''}${e.end_date !== e.start_date ? ` – ${e.end_date}` : ''}` })),
    ...data.events.map(e => ({ d: e.date, k: 'event', l: `${e.title}${e.venue ? ` · ${e.venue}` : ''}` })),
  ].sort((a, b) => a.d.localeCompare(b.d))
  if (!rows.length) return <p className="text-sm text-content-muted">{t('cal.nothing')}</p>
  return (
    <ul className="flex flex-col divide-y divide-line text-sm" data-testid="month-list">
      {rows.map((r, i) => <li key={i} className="py-1"><span className="text-content-muted">{fmtDate(r.d, locale)}</span><HijriDate date={r.d} /> · {t(`cal.kind.${r.k}`)}: {r.l}</li>)}
    </ul>
  )
}
