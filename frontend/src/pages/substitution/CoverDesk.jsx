import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import PageHeader from '../../components/PageHeader'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'
import SlotCard from '../../features/substitution/SlotCard'

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

// D200 SUBL.5 /admin/academic/substitutions: the periods of approved teacher leaves that still need a substitute (or wait for an
// answer); offer a free teacher, withdraw an offer, and - per leave - see every period, replace a confirmed cover or reopen one
// that a routine change cancelled.
export default function CoverDesk() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [f, setF] = useState({ from: day(0), to: day(14), status: 'unassigned' })
  const [leave, setLeave] = useState(null)
  const list = useQuery({ queryKey: ['cover-needing', f], queryFn: () => api.get('/hr/substitution-slots', { params: f }).then(r => r.data.data) })
  const one = useQuery({ queryKey: ['cover-leave', leave], enabled: Boolean(leave), queryFn: () => api.get(`/hr/leaves/${leave}/substitution-slots`).then(r => r.data.data) })
  const reload = () => { qc.invalidateQueries({ queryKey: ['cover-needing'] }); qc.invalidateQueries({ queryKey: ['cover-leave'] }); qc.invalidateQueries({ queryKey: ['cover-candidates'] }) }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('substitution.desk_title')} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Input type="date" ltr label={t('substitution.from')} value={f.from} onChange={e => setF(x => ({ ...x, from: e.target.value }))} />
        <Input type="date" ltr label={t('substitution.to')} value={f.to} onChange={e => setF(x => ({ ...x, to: e.target.value }))} />
        <Select label={t('substitution.show')} value={f.status} onChange={e => setF(x => ({ ...x, status: e.target.value }))}
          options={['unassigned', 'offered'].map(v => ({ value: v, label: t(`substitution.status.${v}`) }))} />
      </div>
      {list.isPending ? <Loader type="cards" count={2} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : !list.data.slots.length ? <EmptyState title={t('substitution.none')} />
        : list.data.slots.map(s => (
          <div key={s.id} className="flex flex-col gap-1">
            <SlotCard slot={s} as="admin" onDone={reload} />
            <div><Button variant="ghost" onClick={() => setLeave(leave === s.leave_id ? null : s.leave_id)}>{t('substitution.whole_leave')}</Button></div>
          </div>
        ))}
      {leave && (
        <section className="flex flex-col gap-2" data-testid="cover-leave">
          <h2 className="font-semibold">{t('substitution.leave_periods')}</h2>
          {one.isPending ? <Loader /> : one.isError ? <ErrorState onRetry={one.refetch} /> : one.data.slots.map(s => <SlotCard key={s.id} slot={s} as="admin" onDone={reload} />)}
        </section>
      )}
    </div>
  )
}
