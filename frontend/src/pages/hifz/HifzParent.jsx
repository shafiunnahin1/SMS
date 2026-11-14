import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import { useLocale } from '../../ui/I18nProvider'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Select } from '../../components/FormField'
import { Timeline } from './Hifz'

// D214 MAD.1 /parent/hifz: one child's hifz progress and timeline (read only; only when the institution shows it to parents)
export default function HifzParent() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const children = useQuery({ queryKey: ['parent', 'children'], queryFn: () => api.get('/parent/children').then(r => r.data.data) })
  const [chosen, setChosen] = useState(null)
  const child = chosen ?? children.data?.[0]?.id
  const q = useQuery({ queryKey: ['hifz', 'parent', child], enabled: !!child, retry: false, queryFn: () => api.get(`/parent/children/${child}/hifz`).then(r => r.data.data) })
  if (children.isPending) return <Loader type="page" />
  if (children.isError) return <ErrorState onRetry={children.refetch} />
  if (!children.data.length) return <EmptyState />
  return (
    <div className="flex flex-col gap-4" data-testid="hifz-parent">
      <PageHeader title={t('hifz.title')} />
      {children.data.length > 1 && <Select label={t('hw.child')} value={String(child)} onChange={e => setChosen(Number(e.target.value))} name="child"
        options={children.data.map(c => ({ value: String(c.id), label: c.name }))} className="sm:w-64" />}
      <Card>
        {q.isPending ? <Loader type="skeleton" rows={4} /> : q.isError
          ? (q.error?.response?.status === 403 ? <EmptyState title={t('hifz.hidden')} /> : <ErrorState onRetry={q.refetch} />)
          : <Timeline data={q.data} locale={locale} />}
      </Card>
    </div>
  )
}
