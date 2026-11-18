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
import ClassCard from '../../features/online-class/ClassCard'

// D231 OCL.2 /student/online-class and /parent/online-class: upcoming classes with Join, past ones with the recording
export default function MyOnlineClasses() {
  const { t } = useTranslation()
  const parent = useAuthStore((s) => s.user?.role) === 'parent'
  const children = useQuery({ queryKey: ['parent', 'children'], enabled: parent, queryFn: () => api.get('/parent/children').then(r => r.data.data) })
  const [chosen, setChosen] = useState(null)
  const child = chosen ?? children.data?.[0]?.id
  const q = useQuery({ queryKey: ['online-classes', 'family', parent ? child : 'me'], enabled: !parent || !!child,
    queryFn: () => api.get(parent ? `/parent/children/${child}/online-classes` : '/student/online-classes').then(r => r.data.data) })
  if (parent && children.isPending) return <Loader type="page" />
  if (parent && children.isError) return <ErrorState onRetry={children.refetch} />
  const upcoming = (q.data ?? []).filter(c => ['scheduled', 'live'].includes(c.status))
  const past = (q.data ?? []).filter(c => !['scheduled', 'live'].includes(c.status)).reverse()
  return (
    <div className="flex flex-col gap-4" data-testid="my-online-classes">
      <PageHeader title={t('ocl.title')} />
      {parent && (children.data ?? []).length > 1 && <Select name="child" label={t('hw.child')} value={String(child)} onChange={(e) => setChosen(Number(e.target.value))} className="sm:w-64"
        options={children.data.map(c => ({ value: String(c.id), label: c.name }))} />}
      {q.isPending ? <Loader type="skeleton" rows={3} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.length ? <EmptyState title={t('ocl.none_mine')} /> : (
        <>
          <Card><h2 className="font-semibold">{t('ocl.tabs.upcoming')}</h2>
            {upcoming.length ? <ul className="flex flex-col divide-y divide-line">{upcoming.map(c => <ClassCard key={c.id} c={c} />)}</ul> : <p className="text-sm text-content-muted py-2">{t('ocl.none_upcoming')}</p>}
          </Card>
          {past.length > 0 && <Card><h2 className="font-semibold">{t('ocl.tabs.past')}</h2><ul className="flex flex-col divide-y divide-line">{past.map(c => <ClassCard key={c.id} c={c} />)}</ul></Card>}
        </>
      )}
    </div>
  )
}
