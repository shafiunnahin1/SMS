import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import PageHeader from '../../components/PageHeader'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import WeekView from './WeekView'

// D193 RTN.1 /teacher/routine and /student/routine: the own week (a teacher's slots; a student's class - chosen by the server)
export default function MyRoutine() {
  const { t } = useTranslation()
  const role = useAuthStore(s => s.role)
  const url = role === 'teacher' ? '/routines/teacher' : '/routines'
  const q = useQuery({ queryKey: ['routines', 'mine', role], queryFn: () => api.get(url).then(r => r.data.data) })
  return (
    <div>
      <PageHeader title={t('routine.title')} />
      {q.isPending && <Loader />}
      {q.isError && <ErrorState onRetry={() => q.refetch()} />}
      {q.data?.length === 0 && <EmptyState title={t('routine.empty')} />}
      {q.data?.length > 0 && <WeekView rows={q.data} />}
    </div>
  )
}
