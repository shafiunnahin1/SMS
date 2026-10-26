import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../api/axios'
import { useTerms } from '../../hooks/useTerms'
import { useStaffDepartmentStore } from '../../store/staffDepartmentStore'
import { RequireDepartment } from '../../features/staff/StaffDepartment'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import DataTable from '../../components/DataTable'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { Input } from '../../components/FormField'
import { EmptyState, ErrorState } from '../../components/StateViews'
import Button from '../../components/Button'
import StudentAdd from '../admin/students/StudentAdd'

// D169 STW.2: the staff student view - read only, the selected department's key (staff.student.index / .show), the full core
// profile (D169 (3)); no edit, delete, consent, file or enrollment actions, and never a fee override (the API leaves it out too)
export function StaffStudents() {
  const { t } = useTranslation()
  return <RequireDepartment permission="staff.student.index"><StudentList t={t} /></RequireDepartment>
}

function StudentList({ t }) {
  const nav = useNavigate()
  const term = useTerms()
  const department = useStaffDepartmentStore(s => s.department)
  const permissions = useStaffDepartmentStore(s => s.permissions)
  const [q, setQ] = useState('')
  const list = useQuery({ queryKey: ['staff-students', department?.id, q], queryFn: () => api.get('/students', { params: { q: q || undefined, per_page: 50 } }).then(r => r.data.data) })
  const cols = [
    { key: 'student_id', label: t('students.student_id'), render: r => <Ltr>{r.student_id}</Ltr> },
    { key: 'name', label: t('students.name'), primary: true, render: r => <span dir="auto">{r.name}</span> },
    { key: 'batch', label: term('batch'), render: r => <span dir="auto">{r.batch?.name ?? '—'}</span> },
    { key: 'roll_no', label: t('students.roll'), render: r => <Ltr>{r.roll_no ?? '—'}</Ltr> },
    { key: 'guardian_phone', label: t('students.guardian_phone'), render: r => <Ltr>{r.guardian_phone}</Ltr> },
  ]
  return (
    <div className="flex flex-col gap-4" data-testid="staff-students">
      <PageHeader title={t('students.title')} actions={permissions.includes('staff.student.store') && <Button onClick={() => nav('/staff/students/new')} data-action="admit">{t('students.add')}</Button>} />
      <Input label={t('students.search_hint')} value={q} onChange={e => setQ(e.target.value)} maxLength={50} className="sm:w-80" />
      <Card>
        <DataTable columns={cols} data={list.data ?? []} loading={list.isPending} error={list.isError} onRetry={list.refetch}
          onRowClick={r => nav(`/staff/students/${r.id}`)} empty={<EmptyState title={t('common.empty')} />} />
      </Card>
    </div>
  )
}

/** D169 STW.3: admission by staff - the admin form in staff mode, behind staff.student.store in the selected department */
export function StaffStudentAdd() {
  return <RequireDepartment permission="staff.student.store"><StudentAdd staff /></RequireDepartment>
}

export function StaffStudentProfile() {
  return <RequireDepartment permission="staff.student.show"><Profile /></RequireDepartment>
}

function Profile() {
  const { t } = useTranslation()
  const term = useTerms()
  const { id } = useParams()
  const department = useStaffDepartmentStore(s => s.department)
  const one = useQuery({ queryKey: ['staff-student', department?.id, id], queryFn: () => api.get(`/students/${id}`).then(r => r.data.data) })
  if (one.isPending) return <Loader type="form" fields={6} />
  if (one.isError) return <ErrorState onRetry={one.refetch} />
  const s = one.data
  const rows = [
    ['students.student_id', <Ltr key="i">{s.student_id}</Ltr>], ['students.guardian_phone', <Ltr key="p">{s.guardian_phone}</Ltr>],
    ['students.father_name', s.father_name], ['students.mother_name', s.mother_name], ['students.gender', s.gender],
    ['students.date_of_birth', s.date_of_birth && <Ltr key="d">{s.date_of_birth}</Ltr>], ['students.address', s.address],
    ['students.blood_group', s.blood_group && <Ltr key="b">{s.blood_group}</Ltr>], ['students.religion', s.religion],
    ['students.studying_at', s.studying_at], ['students.admission_date', s.admission_date && <Ltr key="a">{s.admission_date}</Ltr>],
  ]
  return (
    <div className="flex flex-col gap-4" data-testid="staff-student-profile">
      <PageHeader title={<span dir="auto">{s.name}</span>} />
      <Card className="flex flex-col gap-4 sm:flex-row">
        {s.photo_url && <img src={s.photo_url} alt={s.name} className="h-28 w-28 rounded-token object-cover" />}
        <dl className="grid flex-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k}><dt className="text-xs text-content-muted">{t(k)}</dt><dd dir="auto">{v || '—'}</dd></div>
          ))}
        </dl>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">{t('students.enrollments')}</h2>
        {(s.enrollments ?? []).length === 0 ? <EmptyState title={t('common.empty')} /> : (
          <ul className="flex flex-col gap-1 text-sm" data-testid="staff-student-enrollments">
            {s.enrollments.map(e => (
              <li key={e.id} dir="auto">{e.program?.name} — {term('batch')}: {e.batch?.name}{e.roll_no != null && <> · {t('students.roll')} <Ltr>{e.roll_no}</Ltr></>}{e.is_primary && <> · {t('students.primary')}</>}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
