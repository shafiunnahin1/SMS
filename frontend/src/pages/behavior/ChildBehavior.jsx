import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Select } from '../../components/FormField'
import { EntryCard } from './Behavior'

// D235 BHV.2 /parent/child/behavior: the child's positive entries and the ones the school told the parents about
export default function ChildBehavior() {
  const { t } = useTranslation()
  const children = useQuery({ queryKey: ['parent', 'children'], queryFn: () => api.get('/parent/children').then(r => r.data.data) })
  const [chosen, setChosen] = useState(null)
  const child = chosen ?? children.data?.[0]?.id
  const q = useQuery({ queryKey: ['behavior', 'child', child], enabled: !!child, queryFn: () => api.get(`/parent/children/${child}/behavior`).then(r => r.data.data) })
  if (children.isPending) return <Loader type="page" />
  if (children.isError) return <ErrorState onRetry={children.refetch} />
  return (
    <div className="flex flex-col gap-4" data-testid="child-behavior">
      <PageHeader title={t('bhv.child_title')} />
      {(children.data ?? []).length > 1 && <Select name="child" label={t('hw.child')} value={String(child)} onChange={(e) => setChosen(Number(e.target.value))} className="sm:w-64"
        options={children.data.map(c => ({ value: String(c.id), label: c.name }))} />}
      {q.isPending ? <Loader type="skeleton" rows={3} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.entries.length ? <EmptyState title={t('bhv.child_none')} /> : (
        <Card className="flex flex-col gap-2">
          <p className="text-sm" data-testid="child-behavior-summary">{t('bhv.summary', q.data.summary)}</p>
          <ul className="flex flex-col divide-y divide-line">{q.data.entries.map(e => <EntryCard key={e.id} e={e} />)}</ul>
        </Card>
      )}
    </div>
  )
}
