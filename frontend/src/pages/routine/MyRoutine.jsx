import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import PageHeader from '../../components/PageHeader'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import WeekView from './WeekView'
import Card from '../../components/Card'
import ClassCard from '../../features/online-class/ClassCard'
import { useModules } from '../../hooks/useModules'

// D193 RTN.1 /teacher/routine and /student/routine: the own week (a teacher's slots; a student's class - chosen by the server)
export default function MyRoutine() {
  const { t } = useTranslation()
  const role = useAuthStore(s => s.role)
  const url = role === 'teacher' ? '/routines/teacher' : '/routines'
  const q = useQuery({ queryKey: ['routines', 'mine', role], queryFn: () => api.get(url).then(r => r.data.data) })
  const { has } = useModules()
  // D231 OCL.2: a student's upcoming online classes also show here (docs/modules/online-class.md "Integration with Student Routine Page")
  const online = useQuery({ queryKey: ['online-classes', 'family', 'me'], enabled: role === 'student' && has('online_class'), queryFn: () => api.get('/student/online-classes').then(r => r.data.data) })
  const upcoming = (online.data ?? []).filter(c => ['scheduled', 'live'].includes(c.status)).slice(0, 5)
  return (
    <div>
      <PageHeader title={t('routine.title')} />
      {q.isPending && <Loader />}
      {q.isError && <ErrorState onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <EmptyState title={t('routine.empty')} />}
      {q.data?.length > 0 && <WeekView rows={q.data} />}
      {upcoming.length > 0 && <Card className="mt-4" data-testid="routine-online"><h2 className="font-semibold">{t('ocl.upcoming_online')}</h2><ul className="flex flex-col divide-y divide-line">{upcoming.map(c => <ClassCard key={c.id} c={c} />)}</ul></Card>}
    </div>
  )
}
