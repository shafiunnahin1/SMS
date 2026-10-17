import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Trash2 } from 'lucide-react'
import api from '../../../api/axios'
import { useTerms } from '../../../hooks/useTerms'
import { useInstitutionStore } from '../../../store/institutionStore'
import { fmtMoney } from '../../../i18n/format'
import { useLocale } from '../../../ui/I18nProvider'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import Loader from '../../../components/Loader'
import StatusBadge from '../../../components/StatusBadge'
import { ErrorState } from '../../../components/StateViews'
import List from '../../../ui/variants/List'
import Modal from '../../../ui/variants/Modal'
import Ltr from '../../../components/bidi/Ltr'
import BatchForm from '../../../features/academic/BatchForm'
import { useCrud } from '../../../features/academic/useCrud'

// Step 4.1 /admin/batches/:id: details, teacher in charge and subject teachers, and the members (active enrollments)
export default function BatchDetail() {
  const { id } = useParams()
  const { t } = useTranslation()
  const term = useTerms()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const hasTeachers = (useInstitutionStore(s => s.roles) ?? []).includes('teacher')
  const { remove } = useCrud('batches')
  const [editing, setEditing] = useState(false)
  const batch = useQuery({ queryKey: ['batches', 'one', id], queryFn: () => api.get(`/batches/${id}`).then(r => r.data.data) })
  const members = useQuery({ queryKey: ['batches', 'students', id], queryFn: () => api.get(`/batches/${id}/students`).then(r => r.data.data) })

  if (batch.isPending) return <Loader type="page" />
  if (batch.isError) return <ErrorState onRetry={batch.refetch} />
  const b = batch.data
  const facts = [
    [term('program'), b.program?.name], [t('academic.class_teacher'), b.teacher?.name ?? t('academic.no_teacher')],
    [t('academic.shift'), b.shift ? t(`academic.shifts.${b.shift}`) : '—'], [t('academic.room'), b.room ?? '—'],
    [t('academic.capacity'), <Ltr key="c">{b.students_count} / {b.max_capacity}</Ltr>],
    [t('academic.monthly_fee'), b.monthly_fee ? <Ltr key="f">{fmtMoney(b.monthly_fee, locale)}</Ltr> : '—'],
  ]
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={b.name} actions={<>
        <Button variant="secondary" onClick={() => setEditing(true)}><Pencil aria-hidden="true" className="h-4 w-4" />{t('common.edit')}</Button>
        <Button variant="secondary" onClick={() => remove(b, () => navigate('/admin/batches'))}><Trash2 aria-hidden="true" className="h-4 w-4" />{t('common.delete')}</Button>
      </>} />
      <Card>
        <div className="flex items-center justify-between mb-2"><h2 className="font-semibold">{t('academic.details')}</h2><StatusBadge status={b.status} /></div>
        <dl className="grid gap-2 sm:grid-cols-3 text-sm">
          {facts.map(([k, v]) => <div key={k}><dt className="text-content-muted">{k}</dt><dd dir="auto">{v}</dd></div>)}
        </dl>
      </Card>
      {hasTeachers && (
        <Card>
          <h2 className="font-semibold mb-2">{t('academic.subject_teachers')}</h2>
          <List columns={[
            { key: 'subject', label: t('academic.subject'), primary: true, render: r => <span dir="auto">{r.subject ?? t('academic.all_subjects')}</span> },
            { key: 'teacher', label: t('academic.teacher'), render: r => <span dir="auto">{r.teacher}</span> },
          ]} rows={(b.subject_teachers ?? []).map((r, i) => ({ ...r, id: i }))} />
        </Card>
      )}
      <Card>
        <h2 className="font-semibold mb-2">{t('academic.members', { unit: term('batch') })}</h2>
        <List columns={[
          { key: 'roll_no', label: t('academic.roll'), numeric: true },
          { key: 'name', label: t('academic.name'), primary: true, render: r => <span dir="auto">{r.name}</span> },
          { key: 'code', label: t('students.student_id'), render: r => <Ltr>{r.code}</Ltr> },
          { key: 'guardian_phone', label: t('students.guardian_phone'), render: r => <Ltr>{r.guardian_phone}</Ltr> },
        ]} rows={(members.data ?? []).map(r => ({ ...r, id: r.enrollment_id }))} loading={members.isPending} error={members.isError} onRetry={members.refetch} />
      </Card>
      <Modal open={editing} onClose={() => setEditing(false)} title={t('academic.edit_unit', { unit: term('batch') })}>
        {editing && <BatchForm batch={b} onDone={() => { setEditing(false); qc.invalidateQueries({ queryKey: ['batches'] }) }} onCancel={() => setEditing(false)} />}
      </Modal>
    </div>
  )
}
