import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../../api/axios'
import { useTerms } from '../../hooks/useTerms'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import AttendanceGrants from '../../features/attendance/AttendanceGrants'

// Step 4.1 /teacher/batches (GET /teacher/batches): the batches this teacher is in charge of or teaches a subject in
export default function MyBatches() {
  const { t } = useTranslation()
  const term = useTerms()
  const q = useQuery({ queryKey: ['teacher-batches'], queryFn: () => api.get('/teacher/batches').then(r => r.data.data) })
  return (
    <div>
      <PageHeader title={t('academic.my_title', { units: term('batches') })} />
      {q.isPending ? <Loader type="cards" count={3} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.length ? <EmptyState /> : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="my-batches">
          {q.data.map(b => (
            <li key={b.id} data-row={b.id}>
              <Card className="flex flex-col gap-2">
                <p className="font-semibold" dir="auto">{b.program ? `${b.program.name} — ${b.name}` : b.name}</p>
                <p className="text-sm text-content-muted">{b.is_class_teacher ? t('academic.is_class_teacher') : t('academic.subject_teacher')}</p>
                <Link to="/teacher/attendance" className="text-sm text-primary-fg font-medium">{t('academic.take_attendance')}</Link>
                {b.is_class_teacher && <AttendanceGrants batchId={b.id} />}   {/* D169 STW.5: the teacher in charge */}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
