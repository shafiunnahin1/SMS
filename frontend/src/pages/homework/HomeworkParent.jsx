import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import PageHeader from '../../components/PageHeader'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Select } from '../../components/FormField'
import { HomeworkList } from './HomeworkStudent'

// D212 /parent/homework: one child at a time - the homework and the child's submissions (read only)
export default function HomeworkParent() {
  const { t } = useTranslation()
  const children = useQuery({ queryKey: ['parent', 'children'], queryFn: () => api.get('/parent/children').then(r => r.data.data) })
  const [chosen, setChosen] = useState(null)
  const child = chosen ?? children.data?.[0]?.id
  const list = useQuery({ queryKey: ['homework', 'parent', child], enabled: !!child, queryFn: () => api.get('/parent/homework', { params: { student_id: child } }).then(r => r.data.data) })
  const subs = useQuery({ queryKey: ['homework', 'parent', 'subs', child], enabled: !!child, queryFn: () => api.get('/parent/homework/submitted', { params: { student_id: child } }).then(r => r.data.data) })
  if (children.isPending) return <Loader type="page" />
  if (children.isError) return <ErrorState onRetry={children.refetch} />
  if (!children.data.length) return <EmptyState />
  return (
    <div className="flex flex-col gap-4" data-testid="homework-parent">
      <PageHeader title={t('hw.title')} />
      {children.data.length > 1 && <Select label={t('hw.child')} value={String(child)} onChange={e => setChosen(Number(e.target.value))} name="child"
        options={children.data.map(c => ({ value: String(c.id), label: c.name }))} className="sm:w-64" />}
      {list.isPending ? <Loader type="skeleton" rows={4} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : <HomeworkList items={list.data} subs={subs.data} canSubmit={false} />}
    </div>
  )
}
