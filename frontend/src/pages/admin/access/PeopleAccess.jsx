import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../../../api/axios'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import Loader from '../../../components/Loader'
import { EmptyState, ErrorState } from '../../../components/StateViews'
import { Select } from '../../../components/FormField'
import { useUiStore } from '../../../store/uiStore'

const FEATURES = ['attendance', 'period_attendance', 'marks', 'question_bank', 'ai_assistant', 'student_leave', 'substitution', 'referrals', 'salary', 'own_leave', 'notices']
const list = (r) => (Array.isArray(r.data.data) ? r.data.data : r.data.data?.data ?? [])

// D205 PERM.3 /admin/access: access per person. Above, the teacher features switched off for every teacher; below, pick one teacher
// (their exceptions: as the institution says / on / off) or one staff member (their departments, duties and duty keys - add a
// department, give or take a duty, end a membership). A switch only takes away; the server checks every action again.
export default function PeopleAccess() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = (m) => useUiStore.getState().addToast(m)
  const [person, setPerson] = useState('')
  const all = useQuery({ queryKey: ['teacher-features-institution'], queryFn: () => api.get('/admin/teacher-features').then(r => r.data.data) })
  const teachers = useQuery({ queryKey: ['teachers', 'access'], queryFn: () => api.get('/teachers', { params: { per_page: 100 } }).then(list) })
  const staff = useQuery({ queryKey: ['admin-staff', 'access'], queryFn: () => api.get('/admin/staff', { params: { per_page: 100 } }).then(list) })
  const people = [...(teachers.data ?? []).filter(x => x.user_id).map(x => ({ value: String(x.user_id), label: `${x.name} · ${t('access.teacher')}` })),
    ...(staff.data ?? []).map(x => ({ value: String(x.id), label: `${x.name} · ${t('access.staff')}` }))]
  const one = useQuery({ queryKey: ['user-access', person], enabled: Boolean(person), queryFn: () => api.get(`/admin/users/${person}/access`).then(r => r.data.data) })
  const reload = () => { qc.invalidateQueries({ queryKey: ['user-access'] }); qc.invalidateQueries({ queryKey: ['teacher-features-institution'] }) }
  const run = async (fn) => { try { await fn(); toast(t('common.saved')); reload() } catch { /* the interceptor shows it */ } }

  const toggleAll = (key) => {
    const off = all.data.off.includes(key) ? all.data.off.filter(k => k !== key) : [...all.data.off, key]
    run(() => api.put('/admin/teacher-features', { off }))
  }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('access.title')} />
      <p className="text-sm text-content-muted">{t('access.hint')}</p>
      <Card className="flex flex-col gap-2" data-testid="access-all-teachers">
        <h2 className="font-semibold">{t('access.all_teachers')}</h2>
        {all.isPending ? <Loader type="skeleton" rows={3} /> : all.isError ? <ErrorState onRetry={all.refetch} /> : (
          <div className="grid gap-2 sm:grid-cols-2">
            {FEATURES.map(k => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" checked={!all.data.off.includes(k)} onChange={() => toggleAll(k)} />
                {t(`access.features.${k}`)}
              </label>
            ))}
          </div>
        )}
      </Card>
      <div className="max-w-md">
        <Select label={t('access.person')} placeholder={t('access.pick')} value={person} onChange={e => setPerson(e.target.value)} options={people} />
      </div>
      {!person ? <EmptyState title={t('access.pick_hint')} /> : one.isPending ? <Loader type="cards" count={1} /> : one.isError ? <ErrorState onRetry={one.refetch} />
        : one.data.role === 'teacher' ? <><TeacherAccess d={one.data} run={run} /><StaffAccess d={one.data} run={run} /></> : <StaffAccess d={one.data} run={run} />}   {/* D206 TDM.4: a teacher's departments too */}
    </div>
  )
}

function TeacherAccess({ d, run }) {
  const { t } = useTranslation()
  const set = (key, value) => run(() => api.put(`/admin/users/${d.user_id}/teacher-features`, { overrides: { [key]: value || null } }))
  return (
    <Card className="flex flex-col gap-2" data-testid="access-teacher">
      <h2 className="font-semibold" dir="auto">{d.name}</h2>
      {FEATURES.map(k => (
        <div key={k} className="grid gap-2 sm:grid-cols-3 items-center text-sm" data-testid={`access-feature-${k}`}>
          <span>{t(`access.features.${k}`)}</span>
          <Select aria-label={t(`access.features.${k}`)} value={d.teacher.overrides[k] ?? ''} onChange={e => set(k, e.target.value)}
            options={[{ value: '', label: t(d.teacher.institution_off.includes(k) ? 'access.as_institution_off' : 'access.as_institution_on') },
              { value: 'allowed', label: t('access.on_for_this') }, { value: 'blocked', label: t('access.off_for_this') }]} />
          <span className={d.teacher.off.includes(k) ? 'text-content-muted' : 'font-medium'}>{t(d.teacher.off.includes(k) ? 'access.now_off' : 'access.now_on')}</span>
        </div>
      ))}
    </Card>
  )
}

function StaffAccess({ d, run }) {
  const { t } = useTranslation()
  const [dept, setDept] = useState('')
  const departments = useQuery({ queryKey: ['admin-departments', 'access'], queryFn: () => api.get('/admin/departments', { params: { per_page: 100 } }).then(list) })
  const active = (d.memberships ?? []).filter(m => m.status === 'active')
  const free = (departments.data ?? []).filter(x => x.status === 'active' && !active.some(m => m.department_id === x.id))
  return (
    <Card className="flex flex-col gap-3" data-testid="access-staff">
      <h2 className="font-semibold" dir="auto">{d.name}</h2>
      {!active.length && <p className="text-sm text-content-muted">{t('access.no_department')}</p>}
      {active.map(m => <Membership key={m.id} m={m} run={run} />)}
      <div className="flex flex-wrap items-end gap-2">
        <Select label={t('access.add_department')} placeholder="—" value={dept} onChange={e => setDept(e.target.value)} options={free.map(x => ({ value: String(x.id), label: x.name }))} />
        <Button disabled={!dept} onClick={() => run(() => api.post(`/admin/departments/${dept}/members`, { user_id: d.user_id })).then(() => setDept(''))}>{t('access.add')}</Button>
      </div>
    </Card>
  )
}

function Membership({ m, run }) {
  const { t } = useTranslation()
  const [duty, setDuty] = useState('')
  const duties = useQuery({ queryKey: ['department-duties', m.department_id], queryFn: () => api.get(`/admin/departments/${m.department_id}/duties`, { params: { per_page: 100 } }).then(list) })
  const ids = m.duties.map(x => x.id)
  const assign = (next) => run(() => api.put(`/admin/department-memberships/${m.id}/duties`, { duty_ids: next }))
  const choices = (duties.data ?? []).filter(x => x.status === 'active' && !ids.includes(x.id))
  return (
    <div className="flex flex-col gap-2 rounded-token p-3 [border:1px_solid_var(--line)]" data-testid="access-membership">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium" dir="auto">{m.department}</span>
        <Button variant="ghost" onClick={() => window.confirm(t('access.end_confirm', { name: m.department })) && run(() => api.patch(`/admin/department-memberships/${m.id}`, { status: 'ended' }))}>{t('access.end')}</Button>
      </div>
      {!m.duties.length ? <p className="text-sm text-content-muted">{t('access.no_duty')}</p> : m.duties.map(x => (
        <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span><span dir="auto">{x.name}</span> · <span className="text-content-muted">{x.permission_keys.length} {t('access.keys')}</span></span>
          <Button variant="ghost" onClick={() => assign(ids.filter(i => i !== x.id))}>{t('access.take_duty')}</Button>
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2">
        <Select label={t('access.give_duty')} placeholder="—" value={duty} onChange={e => setDuty(e.target.value)} options={choices.map(x => ({ value: String(x.id), label: x.name }))} />
        <Button disabled={!duty} onClick={() => assign([...ids, Number(duty)]).then(() => setDuty(''))}>{t('access.add')}</Button>
      </div>
    </div>
  )
}
