import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState } from '../../components/StateViews'
import { PublicLayout } from './PublicSite'

// D243 ALM.2 /alumni on the institution's public website: verified alumni only - name, year, profession, current institution; no contact data
export default function PublicAlumni() {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['public', 'alumni'], retry: false, queryFn: () => api.get('/public/alumni').then(r => r.data.data) })
  return (
    <PublicLayout>
      <h1 className="text-2xl font-semibold">{t('alm.public_title')}</h1>
      {q.isPending ? <Loader type="skeleton" rows={4} /> : q.isError || !q.data.length ? <EmptyState title={t('alm.public_none')} /> : (
        <Card><ul className="flex flex-col divide-y divide-line" data-testid="public-alumni">{q.data.map((a, i) => (
          <li key={`${a.name}-${i}`} className="py-2 flex flex-wrap items-baseline gap-2">
            <span className="font-medium" dir="auto">{a.name}</span><Ltr className="text-sm text-content-muted">{a.graduation_year}</Ltr>
            {(a.current_profession || a.current_institution) && <span className="text-sm" dir="auto">{[a.current_profession, a.current_institution].filter(Boolean).join(' · ')}</span>}
          </li>
        ))}</ul></Card>
      )}
    </PublicLayout>
  )
}
