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

const SHOWN = ['blood_group', 'height_cm', 'weight_kg', 'vision_left', 'vision_right', 'medical_conditions', 'emergency_contact', 'emergency_phone', 'doctor_name', 'doctor_phone', 'last_checkup_date', 'notes']
const LTR = ['blood_group', 'height_cm', 'weight_kg', 'vision_left', 'vision_right', 'emergency_phone', 'doctor_phone', 'last_checkup_date']

// D235 HLT.2 /parent/child/health: the child's health record as the school keeps it, read-only
export default function ChildHealth() {
  const { t } = useTranslation()
  const children = useQuery({ queryKey: ['parent', 'children'], queryFn: () => api.get('/parent/children').then(r => r.data.data) })
  const [chosen, setChosen] = useState(null)
  const child = chosen ?? children.data?.[0]?.id
  const q = useQuery({ queryKey: ['health', 'child', child], enabled: !!child, queryFn: () => api.get(`/parent/children/${child}/health`).then(r => r.data.data) })
  if (children.isPending) return <Loader type="page" />
  if (children.isError) return <ErrorState onRetry={children.refetch} />
  return (
    <div className="flex flex-col gap-4" data-testid="child-health">
      <PageHeader title={t('hlt.child_title')} />
      {(children.data ?? []).length > 1 && <Select name="child" label={t('hw.child')} value={String(child)} onChange={(e) => setChosen(Number(e.target.value))} className="sm:w-64"
        options={children.data.map(c => ({ value: String(c.id), label: c.name }))} />}
      {!child ? <EmptyState title={t('hlt.no_students')} /> : q.isPending ? <Loader type="skeleton" rows={4} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.exists ? <EmptyState title={t('hlt.child_none')} /> : (
        <Card><dl className="flex flex-col divide-y divide-line text-sm" data-testid="child-health-record">
          {SHOWN.filter(k => q.data.record[k]).map(k => (
            <div key={k} className="flex justify-between gap-3 py-1.5"><dt className="text-content-muted">{t(`hlt.f.${k}`)}</dt><dd className="font-medium text-end" dir={LTR.includes(k) ? undefined : 'auto'}>{LTR.includes(k) ? <Ltr>{q.data.record[k]}</Ltr> : q.data.record[k]}</dd></div>
          ))}
          {q.data.updated_at && <p className="pt-2 text-xs text-content-muted">{t('hlt.updated', { at: q.data.updated_at })}</p>}
        </dl></Card>
      )}
    </div>
  )
}
