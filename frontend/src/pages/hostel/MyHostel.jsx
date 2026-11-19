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

// D233 HST.2 /student/hostel and /parent/hostel: the student's own hostel, room and warden, read-only
export default function MyHostel() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const parent = useAuthStore((s) => s.user?.role) === 'parent'
  const children = useQuery({ queryKey: ['parent', 'children'], enabled: parent, queryFn: () => api.get('/parent/children').then(r => r.data.data) })
  const [chosen, setChosen] = useState(null)
  const child = chosen ?? children.data?.[0]?.id
  const q = useQuery({ queryKey: ['hostel', 'family', parent ? child : 'me'], enabled: !parent || !!child,
    queryFn: () => api.get(parent ? `/parent/children/${child}/hostel` : '/student/hostel').then(r => r.data.data) })
  if (parent && children.isPending) return <Loader type="page" />
  if (parent && children.isError) return <ErrorState onRetry={children.refetch} />
  const d = q.data
  const row = (label, value, ltr) => value || value === 0 ? <div className="flex justify-between gap-3 py-1.5"><dt className="text-content-muted">{label}</dt><dd className="font-medium text-end" dir={ltr ? undefined : 'auto'}>{ltr ? <Ltr>{value}</Ltr> : value}</dd></div> : null
  return (
    <div className="flex flex-col gap-4" data-testid="my-hostel">
      <PageHeader title={t('hst.title')} />
      {parent && (children.data ?? []).length > 1 && <Select name="child" label={t('hw.child')} value={String(child)} onChange={(e) => setChosen(Number(e.target.value))} className="sm:w-64"
        options={children.data.map(c => ({ value: String(c.id), label: c.name }))} />}
      {q.isPending ? <Loader type="skeleton" rows={3} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !d ? <EmptyState title={t('hst.none_mine')} /> : (
        <Card><dl className="flex flex-col divide-y divide-line text-sm" data-testid="my-room">
          {row(t('hst.hostel'), `${d.hostel} (${t(`hst.types.${d.type}`)})`)}
          {row(t('hst.f.room_number'), d.room_number, true)}
          {row(t('hst.f.floor'), String(d.floor), true)}
          {row(t('hst.check_in'), d.check_in_date, true)}
          {row(t('hst.f.monthly_fee'), d.monthly_fee && fmtMoney(d.monthly_fee, locale), true)}
          {row(t('hst.f.warden_name'), d.warden_name)}
          {d.warden_phone && <div className="flex justify-between gap-3 py-1.5"><dt className="text-content-muted">{t('hst.f.warden_phone')}</dt><dd><a className="font-medium text-primary-fg" href={`tel:${d.warden_phone}`}><Ltr>{d.warden_phone}</Ltr></a></dd></div>}
        </dl></Card>
      )}
    </div>
  )
}
