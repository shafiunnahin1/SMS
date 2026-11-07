import { useTranslation } from 'react-i18next'
import Card from '../../components/Card'
import Ltr from '../../components/bidi/Ltr'

export const DAYS = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu']

// D193 RTN.1: a week of routine slots, one card per day (stacks on a phone; direction-neutral layout)
export default function WeekView({ rows, render }) {
  const { t } = useTranslation()
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {DAYS.map(d => {
        const day = rows.filter(r => r.day_of_week === d)
        return (
          <Card key={d}>
            <h3 className="mb-2 font-semibold">{t(`routine.days.${d}`)}</h3>
            {day.length === 0 && <p className="text-sm text-content-muted">{t('routine.free')}</p>}
            <ul className="grid gap-2">
              {day.map(r => (
                <li key={r.id} className="text-sm">
                  <Ltr>{r.start_time}–{r.end_time}</Ltr> · <span dir="auto" className="font-medium">{r.subject}</span>
                  <span className="block text-content-muted" dir="auto">{[r.batch, r.teacher, r.room_no].filter(Boolean).join(' · ')}</span>
                  {render?.(r)}
                </li>
              ))}
            </ul>
          </Card>
        )
      })}
    </div>
  )
}
