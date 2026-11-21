import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Select } from '../../components/FormField'

function List({ path }) {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['awards', path], queryFn: () => api.get(path).then(r => r.data.data) })
  if (q.isPending) return <Loader type="skeleton" rows={3} />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  if (!q.data.length) return <EmptyState title={t('evt.no_awards')} />
  return (
    <Card><ul className="flex flex-col divide-y divide-line" data-testid="awards">{q.data.map(a => (
      <li key={a.id} className="py-2 flex flex-col gap-0.5" data-testid="award">
        <span className="font-medium" dir="auto">{a.position ? t('evt.position', { n: a.position }) : ''}{a.award && <> · {a.award}</>}</span>
        <span className="text-sm" dir="auto">{a.event.title} · <Ltr>{a.event.event_date}</Ltr></span>
        <span className="text-xs text-content-muted">{t('evt.points_n', { n: a.points })}{a.certificate_issued && <> · {t('evt.certificate')}</>}</span>
      </li>
    ))}</ul></Card>
  )
}

// D242 EVT.2 /student/awards and /parent/child/awards: the competition results of the student (or the chosen child)
export default function MyAwards() {
  const { t } = useTranslation()
  return <div className="flex flex-col gap-4" data-testid="my-awards"><PageHeader title={t('evt.awards_title')} /><List path="/student/awards" /></div>
}

export function ChildAwards() {
  const { t } = useTranslation()
  const children = useQuery({ queryKey: ['parent', 'children'], queryFn: () => api.get('/parent/children').then(r => r.data.data) })
  const [chosen, setChosen] = useState(null)
  const child = chosen ?? children.data?.[0]?.id
  if (children.isPending) return <Loader type="page" />
  if (children.isError) return <ErrorState onRetry={children.refetch} />
  return (
    <div className="flex flex-col gap-4" data-testid="child-awards">
      <PageHeader title={t('evt.awards_title')} />
      {(children.data ?? []).length > 1 && <Select name="child" label={t('hw.child')} value={String(child)} onChange={(e) => setChosen(Number(e.target.value))} className="sm:w-64"
        options={children.data.map(c => ({ value: String(c.id), label: c.name }))} />}
      {child ? <List key={child} path={`/parent/children/${child}/awards`} /> : <EmptyState title={t('evt.no_awards')} />}
    </div>
  )
}
