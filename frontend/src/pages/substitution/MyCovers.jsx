import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import PageHeader from '../../components/PageHeader'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import SlotCard from '../../features/substitution/SlotCard'

// D200 SUBL.5 /teacher/substitutions: the covers I am asked to give (accept / decline) and already confirmed; and, for my own
// pending leave, the periods where I may name a substitute for the admin to consider.
export default function MyCovers() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const offers = useQuery({ queryKey: ['cover-offers'], queryFn: () => api.get('/teacher/substitution-offers').then(r => r.data.data) })
  const leaves = useQuery({ queryKey: ['my-leaves-pending'], queryFn: () => api.get('/teacher/leave').then(r => (r.data.data ?? []).filter(l => l.status === 'pending')) })
  const mine = useQueries({ queries: (leaves.data ?? []).map(l => ({ queryKey: ['cover-leave', l.id], queryFn: () => api.get(`/hr/leaves/${l.id}/substitution-slots`).then(r => r.data.data) })) })
  const reload = () => { for (const k of ['cover-offers', 'cover-leave', 'cover-candidates']) qc.invalidateQueries({ queryKey: [k] }) }
  const own = mine.flatMap(q => q.data?.slots ?? []).filter(s => s.status !== 'cancelled')
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('substitution.mine_title')} />
      <h2 className="font-semibold">{t('substitution.asked_of_me')}</h2>
      {offers.isPending ? <Loader type="cards" count={1} /> : offers.isError ? <ErrorState onRetry={offers.refetch} /> : !offers.data.length ? <EmptyState title={t('substitution.no_offers')} />
        : offers.data.map(s => <SlotCard key={s.id} slot={s} as="target" onDone={reload} />)}
      {own.length > 0 && <>
        <h2 className="font-semibold">{t('substitution.my_leave_periods')}</h2>
        <p className="text-sm text-content-muted">{t('substitution.nominate_hint')}</p>
        {own.map(s => <SlotCard key={s.id} slot={s} as="applicant" onDone={reload} />)}
      </>}
    </div>
  )
}
