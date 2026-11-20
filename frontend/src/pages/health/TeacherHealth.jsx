import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'

// D235 HLT.2 /teacher/health: the emergency information (blood group, conditions, emergency contact) of the teacher's own batches
export default function TeacherHealth() {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['health', 'mine'], queryFn: () => api.get('/health/my-students').then(r => r.data.data) })
  return (
    <div className="flex flex-col gap-4" data-testid="teacher-health">
      <PageHeader title={t('hlt.teacher_title')} />
      <p className="text-sm text-content-muted">{t('hlt.teacher_hint')}</p>
      {q.isPending ? <Loader type="skeleton" rows={4} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.length ? <EmptyState title={t('hlt.no_students')} /> : (
        <Card><ul className="flex flex-col divide-y divide-line">
          {q.data.map(s => (
            <li key={s.student.id} className="py-2 flex flex-col gap-0.5" data-testid="teacher-health-row">
              <div className="flex flex-wrap items-center gap-2"><span className="font-medium" dir="auto">{s.student.name}</span><Ltr className="text-sm text-content-muted">{s.student.student_id}</Ltr>
                {s.batch && <span className="text-sm text-content-muted" dir="auto">· {s.batch}</span>}
                {s.record.blood_group && <span className="ms-auto rounded-full px-2 py-0.5 text-xs bg-surface-muted font-medium"><Ltr>{s.record.blood_group}</Ltr></span>}</div>
              {s.record.medical_conditions && <p className="text-sm" dir="auto">{t('hlt.f.medical_conditions')}: {s.record.medical_conditions}</p>}
              {(s.record.emergency_contact || s.record.emergency_phone) && <p className="text-sm text-content-muted">{t('hlt.emergency')}: <span dir="auto">{s.record.emergency_contact}</span> {s.record.emergency_phone && <a className="text-primary-fg" href={`tel:${s.record.emergency_phone}`}><Ltr>{s.record.emergency_phone}</Ltr></a>}</p>}
              {!s.exists && <p className="text-sm text-content-muted">{t('hlt.no_record')}</p>}
            </li>
          ))}
        </ul></Card>
      )}
    </div>
  )
}
