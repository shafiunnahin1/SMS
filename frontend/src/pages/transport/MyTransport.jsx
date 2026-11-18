import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtMoney } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Select } from '../../components/FormField'

// D229 TRN.2 /student/transport and /parent/transport: the student's own route, bus, driver and stop, read-only
export default function MyTransport() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const parent = useAuthStore((s) => s.user?.role) === 'parent'
  const children = useQuery({ queryKey: ['parent', 'children'], enabled: parent, queryFn: () => api.get('/parent/children').then(r => r.data.data) })
  const [chosen, setChosen] = useState(null)
  const child = chosen ?? children.data?.[0]?.id
  const q = useQuery({ queryKey: ['transport', 'family', parent ? child : 'me'], enabled: !parent || !!child,
    queryFn: () => api.get(parent ? `/parent/children/${child}/transport` : '/student/transport').then(r => r.data.data) })
  if (parent && children.isPending) return <Loader type="page" />
  if (parent && children.isError) return <ErrorState onRetry={children.refetch} />
  const d = q.data
  const row = (label, value, ltr) => value ? <div className="flex justify-between gap-3 py-1.5"><dt className="text-content-muted">{label}</dt><dd className="font-medium text-end" dir={ltr ? undefined : 'auto'}>{ltr ? <Ltr>{value}</Ltr> : value}</dd></div> : null
  return (
    <div className="flex flex-col gap-4" data-testid="my-transport">
      <PageHeader title={t('trn.title')} />
      {parent && (children.data ?? []).length > 1 && <Select name="child" label={t('hw.child')} value={String(child)} onChange={(e) => setChosen(Number(e.target.value))} className="sm:w-64"
        options={children.data.map(c => ({ value: String(c.id), label: c.name }))} />}
      {q.isPending ? <Loader type="skeleton" rows={3} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !d ? <EmptyState title={t('trn.none_mine')} /> : (
        <Card><dl className="flex flex-col divide-y divide-line text-sm" data-testid="my-route">
          {row(t('trn.route'), d.route)}
          {row(t('trn.f.vehicle'), [d.vehicle, d.number_plate].filter(Boolean).join(' · '))}
          {row(t('trn.f.driver_name'), d.driver_name)}
          {d.driver_phone && <div className="flex justify-between gap-3 py-1.5"><dt className="text-content-muted">{t('trn.f.driver_phone')}</dt><dd><a className="font-medium text-primary-fg" href={`tel:${d.driver_phone}`}><Ltr>{d.driver_phone}</Ltr></a></dd></div>}
          {row(t('trn.f.helper_name'), d.helper_name)}
          {row(t('trn.stop'), d.stop)}
          {row(t('trn.pickup'), d.pickup_time?.slice(0, 5), true)}
          {row(t('trn.drop'), d.drop_time?.slice(0, 5), true)}
          {row(t('trn.direction'), t(`trn.directions.${d.direction}`))}
          {row(t('trn.f.monthly_fee'), d.monthly_fee && fmtMoney(d.monthly_fee, locale), true)}
        </dl></Card>
      )}
    </div>
  )
}
