import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import List from '../../ui/variants/List'
import { Input } from '../../components/FormField'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState } from '../../components/StateViews'

// QB.7 /admin/question-bank/spending (D66, question-bank.md §4.4): who bought what from the institution wallet (per person, by
// item type) in a date range; the default monthly cap for teachers and each teacher's own cap (empty = the default).
export default function QbSpending() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [range, setRange] = useState({ from: '', to: '' })
  const q = useQuery({ queryKey: ['qb-spending', range], queryFn: () => api.get('/question-bank/spending', { params: { from: range.from || undefined, to: range.to || undefined } }).then(r => r.data) })
  const [defaultCap, setDefaultCap] = useState(null)
  const [caps, setCaps] = useState({})
  const save = async (body) => {
    try {
      await api.put('/question-bank/caps', body)
      useUiStore.getState().addToast(t('common.saved'))
      qc.invalidateQueries({ queryKey: ['qb-spending'] })
    } catch (e) {
      useUiStore.getState().addToast(Object.values(e.response?.data?.errors ?? {})[0]?.[0] ?? e.response?.data?.message, 'error')
    }
  }
  const capOf = (r) => caps[r.teacher_id] ?? (r.cap ?? '')
  const columns = [
    { key: 'name', label: t('qbs.person'), primary: true, render: r => <span dir="auto">{r.name ?? '—'}</span> },
    { key: 'total', label: t('qbs.total'), render: r => <Ltr>৳{r.total}</Ltr> },
    { key: 'count', label: t('qbs.items'), render: r => <>{r.count} <span className="text-xs text-content-muted">{Object.entries(r.by_type).map(([k, v]) => `${t(`qbs.types.${k}`)} ${v.count}`).join(' · ')}</span></> },
    { key: 'cap', label: t('qbs.cap'), render: r => r.teacher_id ? (
      <div className="flex items-center gap-2">
        <Input ltr inputMode="decimal" aria-label={t('qbs.cap')} className="w-24" name={`cap-${r.teacher_id}`} placeholder={t('qbs.default')} value={capOf(r)}
          onChange={e => setCaps({ ...caps, [r.teacher_id]: e.target.value })} />
        <Button variant="secondary" onClick={() => save({ teachers: [{ id: r.teacher_id, cap: String(capOf(r)).trim() === '' ? null : String(capOf(r)).trim() }] })} data-action="save-cap">{t('common.save')}</Button>
      </div>) : <span className="text-xs text-content-muted">{t('qbs.no_cap')}</span> },
  ]
  const meta = q.data?.meta
  return (
    <div className="flex flex-col gap-4" data-testid="qb-spending">
      <PageHeader title={t('qbs.title')} />
      <Card className="grid gap-3 sm:grid-cols-3">
        <Input label={t('qbs.from')} type="date" ltr value={range.from} onChange={e => setRange({ ...range, from: e.target.value })} name="from" />
        <Input label={t('qbs.to')} type="date" ltr value={range.to} onChange={e => setRange({ ...range, to: e.target.value })} name="to" />
        <div className="flex flex-col justify-end text-sm"><span>{t('qbs.total')}: <Ltr>৳{meta?.total ?? '—'}</Ltr></span>
          <span className="text-xs text-content-muted">{meta && <Ltr>{meta.from} → {meta.to}</Ltr>}</span></div>
      </Card>
      <Card className="flex flex-wrap items-end gap-2">
        <Input label={t('qbs.default_cap')} hint={t('qbs.default_cap_hint')} ltr inputMode="decimal" name="default_cap" className="w-48"
          value={defaultCap ?? meta?.default_cap ?? ''} onChange={e => setDefaultCap(e.target.value)} />
        <Button onClick={() => save({ default_cap: String(defaultCap ?? meta?.default_cap ?? '').trim() === '' ? null : String(defaultCap ?? meta?.default_cap).trim() })} data-action="save-default-cap">{t('common.save')}</Button>
      </Card>
      <Card><List columns={columns} rows={q.data?.data ?? []} loading={q.isPending} error={q.isError} onRetry={q.refetch} empty={<EmptyState title={t('qbs.none')} />} /></Card>
    </div>
  )
}
