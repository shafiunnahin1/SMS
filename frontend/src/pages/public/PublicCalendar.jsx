import { useTranslation } from 'react-i18next'
import Card from '../../components/Card'
import MonthCalendar from '../calendar/MonthCalendar'
import { PublicLayout } from './PublicSite'

// D213 CAL.2 /calendar on the institution's public website: holidays, exam dates and public events, no login
export default function PublicCalendar() {
  const { t } = useTranslation()
  return (
    <PublicLayout>
      <h1 className="text-2xl font-semibold">{t('cal.title')}</h1>
      <Card><MonthCalendar endpoint="/public/calendar" /></Card>
    </PublicLayout>
  )
}
