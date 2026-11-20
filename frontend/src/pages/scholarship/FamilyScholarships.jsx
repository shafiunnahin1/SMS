import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'
import { Benefit } from './Scholarships'

const fieldErrors = (e) => Object.fromEntries(Object.entries(e.response?.data?.errors ?? {}).map(([k, m]) => [k, m[0]]))

/** the open scholarships and the child's (or the student's own) applications; apply once to an open one */
function Panel({ path, childId }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['scholarships', 'family', path], queryFn: () => api.get(path).then(r => r.data.data) })
  const [applying, setApplying] = useState(null)
  const [f, setF] = useState({ reason: '', gpa: '', household_income: '' })
  const [errors, setErrors] = useState({})
  const apply = async (e) => {
    e.preventDefault(); setErrors({})
    const body = { reason: f.reason, gpa: f.gpa || null, household_income: f.household_income || null, ...(childId ? { student_id: childId } : {}) }
    try {
      await api.post(`/scholarships/${applying}/apply`, body)
      setApplying(null); setF({ reason: '', gpa: '', household_income: '' })
      qc.invalidateQueries({ queryKey: ['scholarships', 'family'] }); useUiStore.getState().addToast(t('sch.applied'))
    } catch (err) { setErrors(fieldErrors(err)) }
  }
  if (q.isPending) return <Loader type="skeleton" rows={3} />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">{t('sch.open_title')}</h2>
        {!q.data.open.length ? <EmptyState title={t('sch.none_open')} /> : (
          <ul className="flex flex-col divide-y divide-line" data-testid="open-scholarships">{q.data.open.map(s => (
            <li key={s.id} className="py-2 flex flex-col gap-1" data-testid="open-scholarship">
              <span className="font-medium" dir="auto">{s.name}</span>
              <p className="text-sm"><Benefit s={s} />{s.funded_by && <span className="text-content-muted" dir="auto"> · {s.funded_by}</span>}</p>
              {s.criteria && <p className="text-sm text-content-muted" dir="auto">{t('sch.criteria')}: {s.criteria}</p>}
              {s.description && <p className="text-sm" dir="auto">{s.description}</p>}
              <p className="text-xs text-content-muted">
                {s.total_slots != null && t('sch.slots', { left: s.available_slots, total: s.total_slots })}
                {s.application_deadline && <> · {t('sch.deadline')}: <Ltr>{s.application_deadline}</Ltr></>}
              </p>
              {s.applied ? <p className="text-sm text-content-muted">{t('sch.already')}</p> : applying === s.id ? (
                <form className="flex flex-col gap-2" onSubmit={apply} data-testid="apply-form">
                  <Textarea name="reason" label={t('sch.reason')} rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} error={errors.reason ?? errors.scholarship ?? errors.student_id} required />
                  <div className="grid grid-cols-2 gap-2">
                    <Input name="gpa" type="number" step="0.01" min="0" max="5" ltr label={t('sch.gpa')} value={f.gpa} onChange={(e) => setF({ ...f, gpa: e.target.value })} error={errors.gpa} />
                    <Input name="household_income" label={t('sch.income')} value={f.household_income} onChange={(e) => setF({ ...f, household_income: e.target.value })} error={errors.household_income} />
                  </div>
                  <div className="flex gap-2"><Button type="submit" data-action="submit-apply">{t('sch.apply')}</Button><Button variant="ghost" onClick={() => setApplying(null)}>{t('common.cancel')}</Button></div>
                </form>
              ) : <div><Button onClick={() => { setApplying(s.id); setErrors({}) }} data-action="apply">{t('sch.apply')}</Button></div>}
            </li>
          ))}</ul>
        )}
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="font-semibold">{t('sch.my_applications')}</h2>
        {!q.data.applications.length ? <EmptyState title={t('sch.none_mine')} /> : (
          <ul className="flex flex-col divide-y divide-line" data-testid="my-applications">{q.data.applications.map(a => (
            <li key={a.id} className="py-2 flex flex-col gap-1" data-testid="my-application" data-status={a.status}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium" dir="auto">{a.scholarship.name}</span>
                <span className="rounded-full px-2 py-0.5 text-xs bg-surface-muted text-content">{t(`sch.app_statuses.${a.status}`)}</span>
              </div>
              <p className="text-sm"><Benefit s={a.scholarship} /></p>
              {a.status === 'approved' && <p className="text-xs text-content-muted">{a.scholarship.benefit === 'percentage' ? t('sch.pct_family_hint') : t('sch.amount_family_hint')}</p>}
            </li>
          ))}</ul>
        )}
      </Card>
    </div>
  )
}

// D236 SCH.3 /parent/child/scholarships (choose a child) and /student/scholarships (the student's own)
export function ChildScholarships() {
  const { t } = useTranslation()
  const children = useQuery({ queryKey: ['parent', 'children'], queryFn: () => api.get('/parent/children').then(r => r.data.data) })
  const [chosen, setChosen] = useState(null)
  const child = chosen ?? children.data?.[0]?.id
  if (children.isPending) return <Loader type="page" />
  if (children.isError) return <ErrorState onRetry={children.refetch} />
  return (
    <div className="flex flex-col gap-4" data-testid="child-scholarships">
      <PageHeader title={t('sch.title')} />
      {(children.data ?? []).length > 1 && <Select name="child" label={t('hw.child')} value={String(child)} onChange={(e) => setChosen(Number(e.target.value))} className="sm:w-64"
        options={children.data.map(c => ({ value: String(c.id), label: c.name }))} />}
      {child ? <Panel key={child} path={`/parent/children/${child}/scholarships`} childId={child} /> : <EmptyState title={t('sch.none_mine')} />}
    </div>
  )
}

export default function MyScholarships() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4" data-testid="my-scholarships">
      <PageHeader title={t('sch.title')} />
      <Panel path="/student/scholarships" />
    </div>
  )
}
