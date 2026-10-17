import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import StatusBadge from '../../components/StatusBadge'
import { EmptyState, ErrorState } from '../../components/StateViews'
import Ltr from '../../components/bidi/Ltr'

// Step 4.5 /teacher/marks: exams with the subjects this teacher may enter (GET /results without exam_id) -> the entry sheet
export default function MyMarks() {
  const { t } = useTranslation()
  const exams = useQuery({ queryKey: ['results', 'mine'], queryFn: () => api.get('/results').then(r => r.data.data) })
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('exams.my_marks')} />
      {exams.isPending ? <Loader type="cards" count={2} /> : exams.isError ? <ErrorState onRetry={exams.refetch} />
        : !exams.data.length ? <EmptyState title={t('exams.no_entry')} /> : exams.data.map(e => (
          <Card key={e.id} className="flex flex-col gap-2" data-testid="teacher-exam">
            <h2 className="font-semibold inline-flex items-center gap-2"><span dir="auto">{e.name}</span> <StatusBadge status={e.status} /></h2>
            <p className="text-sm text-content-muted" dir="auto">{e.program}{e.batch ? ` — ${e.batch}` : ''} · <Ltr>{e.academic_year}</Ltr></p>
            <div className="flex flex-wrap gap-2">
              {e.subjects.map(s => (
                <Link key={s.subject_id} to={`/teacher/marks/${e.id}/${s.subject_id}`} className="h-9 px-3 inline-flex items-center rounded-token text-sm [border:1px_solid_var(--line)] hover:bg-primary-soft">
                  <span dir="auto">{s.name}</span>
                </Link>
              ))}
            </div>
          </Card>
        ))}
    </div>
  )
}
