import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Select } from '../../components/FormField'

// D224 SYL.3 /parent/syllabus and /student/syllabus: the completed chapters of each subject - only when the institution shows it;
// no percent per teacher, nothing "behind"
export default function SyllabusFamily() {
  const { t } = useTranslation()
  const parent = useAuthStore((s) => s.user?.role) === 'parent'
  const children = useQuery({ queryKey: ['parent', 'children'], enabled: parent, queryFn: () => api.get('/parent/children').then(r => r.data.data) })
  const [chosen, setChosen] = useState(null)
  const child = chosen ?? children.data?.[0]?.id
  const q = useQuery({ queryKey: ['syllabus', 'family', parent ? child : 'me'], enabled: !parent || !!child, retry: false,
    queryFn: () => api.get(parent ? `/parent/children/${child}/syllabus` : '/student/syllabus').then(r => r.data.data) })
  if (parent && children.isPending) return <Loader type="page" />
  if (parent && children.isError) return <ErrorState onRetry={children.refetch} />
  return (
    <div className="flex flex-col gap-4" data-testid="syllabus-family">
      <PageHeader title={t('syl.title')} />
      {parent && (children.data ?? []).length > 1 && <Select name="child" label={t('hw.child')} value={String(child)} onChange={(e) => setChosen(Number(e.target.value))} className="sm:w-64"
        options={children.data.map(c => ({ value: String(c.id), label: c.name }))} />}
      {q.isPending ? <Loader type="skeleton" rows={4} /> : q.isError ? (q.error?.response?.status === 403 ? <EmptyState title={t('syl.hidden')} /> : <ErrorState onRetry={q.refetch} />)
        : !q.data.length ? <EmptyState title={t('syl.no_units')} /> : q.data.map(s => (
          <Card key={s.subject} className="flex flex-col gap-1" data-testid="family-subject">
            <h2 className="font-semibold" dir="auto">{s.subject}</h2>
            <p className="text-sm text-content-muted">{t('syl.chapters_done', { done: s.chapters.length, total: s.total_chapters })}</p>
            {s.chapters.length > 0 && <ul className="text-sm list-disc ps-5">{s.chapters.map(c => <li key={c} dir="auto">{c}</li>)}</ul>}
          </Card>
        ))}
    </div>
  )
}
