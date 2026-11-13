import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import MonthCalendar from './MonthCalendar'

// D213 CAL.2 /teacher|student|parent/calendar: the month calendar and the upcoming events meant for the reader; a student
// registers for (or cancels) an event that asks for registration.
export default function CalendarView() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4" data-testid="calendar-view">
      <PageHeader title={t('cal.title')} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2"><MonthCalendar /></Card>
        <Card><Upcoming /></Card>
      </div>
    </div>
  )
}

export function Upcoming() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const student = useAuthStore((s) => s.user?.role) === 'student'
  const q = useQuery({ queryKey: ['events', 'upcoming'], queryFn: () => api.get('/events/upcoming').then(r => r.data.data) })
  const act = async (e) => {
    try {
      if (e.registered) await api.delete(`/events/${e.id}/register`)
      else await api.post(`/events/${e.id}/register`)
    } catch { /* the interceptor shows the error */ } finally { qc.invalidateQueries({ queryKey: ['events'] }) }
  }
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-semibold">{t('cal.upcoming')}</h2>
      {q.isLoading ? <Loader /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.length ? <EmptyState title={t('cal.no_events')} /> : (
        <ul className="flex flex-col divide-y divide-line text-sm" data-testid="upcoming">
          {q.data.map(e => (
            <li key={e.id} className="py-2 flex flex-col gap-1">
              <span className="font-medium">{e.title}</span>
              <span className="text-content-muted">{fmtDate(e.event_date, locale)}{e.start_time ? ` · ${e.start_time}` : ''}{e.venue ? ` · ${e.venue}` : ''} · {t(`cal.etype.${e.type}`)}</span>
              {student && e.registration_required && (
                <span className="flex flex-wrap items-center gap-2">
                  {e.registered && <span className="text-content-muted">{t('cal.registered')}</span>}
                  <Button variant={e.registered ? 'ghost' : 'primary'} onClick={() => act(e)} data-action={e.registered ? 'cancel' : 'register'}>{e.registered ? t('cal.cancel_registration') : t('cal.register')}</Button>
                  {e.registration_deadline && <span className="text-content-muted">{t('cal.deadline', { date: fmtDate(e.registration_deadline, locale) })}</span>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
