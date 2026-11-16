import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Select } from '../../components/FormField'
import LessonPlans, { keyOf } from '../../features/syllabus/LessonPlans'

// D225 /staff/lesson-plans: department staff with the lesson-plan duties work any batch's plans, written in the name of the teacher
// who teaches that subject; each action needs its own key (the server says no otherwise)
export default function StaffLessonPlans() {
  const { t } = useTranslation()
  const rows = useQuery({ queryKey: ['syllabus', 'assignments', 'staff'], queryFn: () => api.get('/lesson-plans/assignments').then(r => r.data.data) })
  const [pick, setPick] = useState('')
  if (rows.isPending) return <Loader type="page" />
  if (rows.isError) return <ErrorState onRetry={rows.refetch} />
  const a = rows.data.find(x => keyOf(x) === pick) ?? rows.data[0]
  return (
    <div className="flex flex-col gap-4" data-testid="staff-lesson-plans">
      <PageHeader title={t('syl.plans')} />
      {!a ? <EmptyState title={t('syl.no_assignment')} /> : <>
        <Select name="assignment" label={t('syl.batch_subject_teacher')} value={keyOf(a)} onChange={(e) => setPick(e.target.value)} className="sm:w-96"
          options={rows.data.map(x => ({ value: keyOf(x), label: `${x.batch} · ${x.subject} · ${x.teacher}` }))} />
        <Card><LessonPlans assignment={a} units={null} /></Card>
      </>}
    </div>
  )
}
