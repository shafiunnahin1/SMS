import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import ResourcePage from '../../features/r3/ResourcePage'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { Input } from '../../components/FormField'
import { EmptyState, ErrorState } from '../../components/StateViews'
import Loader from '../../components/Loader'

// D88-D91 pages: the principal manages staff accounts and departments; a staff member sees only the departments they are an active
// member of and picks one as the working context. The menu only reflects access - every request is still checked by the API (D91).

export function StaffAccounts() {
  return <ResourcePage title="r3.staff.accounts" endpoint="admin/staff" intro="r3.staff.accounts_hint"
    columns={[{ key: 'name', label: 'r3.name' }, { key: 'phone', label: 'r3.phone' }, { key: 'email', label: 'r3.staff.email' }, { key: 'is_active', label: 'r3.active', kind: 'bool' }]}
    create={{ label: 'r3.staff.new_account', defaults: { channel: 'phone' }, fields: [{ name: 'name', label: 'r3.name', required: true },
      { name: 'channel', label: 'r3.staff.channel', kind: 'select', options: ['phone', 'email'] }, { name: 'value', label: 'r3.staff.contact', required: true }],
      transform: ({ channel, value, ...v }) => ({ ...v, contact: { channel, value } }) }}
    edit={{ fields: [{ name: 'name', label: 'r3.name', required: true }, { name: 'is_active', label: 'r3.active', kind: 'checkbox' }] }}
    actions={[{ key: 'activation', label: 'r3.staff.resend', when: r => !r.is_active, path: r => `/admin/staff/${r.id}/activation` }]} />
}

export function Departments() {
  return <ResourcePage title="r3.staff.departments" endpoint="admin/departments"
    columns={[{ key: 'name', label: 'r3.name' }, { key: 'code', label: 'r3.code' }, { key: 'description', label: 'r3.note' }, { key: 'status', label: 'r3.status', kind: 'status' }]}
    create={{ label: 'r3.staff.new_department', fields: [{ name: 'name', label: 'r3.name', required: true }, { name: 'code', label: 'r3.code' }, { name: 'description', label: 'r3.note', wide: true }] }}
    edit={{ fields: [{ name: 'name', label: 'r3.name', required: true }, { name: 'description', label: 'r3.note', wide: true }] }}
    actions={[{ key: 'member', label: 'r3.staff.add_member', when: r => r.status === 'active', path: r => `/admin/departments/${r.id}/members`,
        fields: [{ name: 'user_id', label: 'r3.staff.account', kind: 'select', optionsFrom: 'admin/staff', required: true }, { name: 'starts_at', label: 'r3.from', kind: 'date' }] },
      { key: 'duty', label: 'r3.staff.add_duty', when: r => r.status === 'active', path: r => `/admin/departments/${r.id}/duties`,
        fields: [{ name: 'code', label: 'r3.code', required: true }, { name: 'name', label: 'r3.name', required: true }, { name: 'description', label: 'r3.note', wide: true }] },
      { key: 'archive', label: 'r3.staff.archive', danger: true, when: r => r.status === 'active', path: r => `/admin/departments/${r.id}/archive` }]} />
}

// The staff member's own departments; choosing one shows that department's portal (its allowed work, from the API)
export function MyDepartments() {
  const { t } = useTranslation()
  const [current, setCurrent] = useState(null)
  const list = useQuery({ queryKey: ['staff/departments'], queryFn: () => api.get('/staff/departments').then(r => r.data.data) })
  const portal = useQuery({ queryKey: ['staff/portal', current], queryFn: () => api.get(`/staff/departments/${current}/portal`).then(r => r.data.data), enabled: Boolean(current), retry: false })
  const rows = list.data ?? []
  return (
    <div>
      <PageHeader title={t('r3.staff.my_departments')} subtitle={t('r3.staff.portal_hint')} />
      {list.isPending ? <Loader type="cards" count={2} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : rows.length === 0
        ? <EmptyState title={t('r3.staff.no_department')} description={t('r3.staff.no_department_hint')} />
        : (
          <div className="grid gap-3 sm:grid-cols-2" role="list">
            {rows.map(d => (
              <Card key={d.id} role="listitem">
                <div className="flex items-center justify-between gap-2">
                  <span dir="auto" className="font-medium">{d.name}</span>
                  <Button variant={current === d.id ? 'primary' : 'secondary'} aria-pressed={current === d.id} onClick={() => setCurrent(d.id)}>{t('r3.staff.open')}</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      {current && <Card data-testid="department-portal">
        {portal.isPending ? <Loader type="form" fields={2} /> : portal.isError ? <ErrorState onRetry={portal.refetch} message={t('r3.staff.no_access')} /> : (
          <div>
            <h2 className="mb-2 font-medium" dir="auto">{portal.data.name}</h2>
            <p className="text-sm text-content-muted">{t('r3.staff.portal_ready')}</p>
          </div>
        )}
      </Card>}
    </div>
  )
}

export function MyProfile() {
  const { t } = useTranslation()
  const user = useAuthStore(s => s.user)
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ values: { name: user?.name ?? '' } })
  const save = async (v) => {
    try { await api.patch('/staff/profile', { name: v.name }); useUiStore.getState().addToast(t('common.saved')) }
    catch (e) { Object.entries(e.response?.data?.errors ?? {}).forEach(([f, m]) => setError(f, { message: m[0] })) }
  }
  return (
    <div>
      <PageHeader title={t('r3.staff.profile')} subtitle={t('r3.staff.profile_hint')} />
      <Card><form className="grid gap-3 sm:grid-cols-2" noValidate onSubmit={handleSubmit(save)}>
        <Input label={t('r3.name')} error={errors.name?.message} {...register('name', { required: t('r3.name') })} />
        <div className="flex items-end"><Button type="submit" loading={isSubmitting}>{t('common.save')}</Button></div>
      </form></Card>
    </div>
  )
}
