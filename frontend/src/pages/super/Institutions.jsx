import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { Plus } from 'lucide-react'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtMoney, fmtNumber } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import StatusBadge from '../../components/StatusBadge'
import List from '../../ui/variants/List'
import Modal from '../../ui/variants/Modal'
import { Input, Select } from '../../components/FormField'
import Ltr from '../../components/bidi/Ltr'
import { takeCredentials } from '../../features/super/OneTimePassword'

export const TYPES = ['school', 'college', 'coaching', 'private_batch']
const STATUSES = ['active', 'trial', 'expired', 'suspended', 'inactive']

// Step 5.3 /super-admin/institutions (D55): every institution with search, status and type filters; the Super Admin opens a new
// one together with its first admin (who must change the password on first login).
export default function Institutions() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const navigate = useNavigate()
  const [f, setF] = useState({ q: '', status: '', type: '' })
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const query = useQuery({
    queryKey: ['super', 'institutions', f, page], placeholderData: (prev) => prev,
    queryFn: () => api.get('/super/institutions', { params: { q: f.q || undefined, status: f.status || undefined, type: f.type || undefined, page } }).then(r => r.data),
  })
  const set = (k, v) => { setF(x => ({ ...x, [k]: v })); setPage(1) }
  const columns = [
    { key: 'name', label: t('super.name'), primary: true, render: r => <span dir="auto">{r.name}</span> },
    { key: 'host', label: t('super.address'), render: r => <Ltr>{r.host}</Ltr> },
    { key: 'institution_type', label: t('super.type'), render: r => t(`dashboard.types.${r.institution_type}`) },
    { key: 'students', label: t('dashboard.students'), numeric: true, render: r => fmtNumber(r.students, locale) },
    { key: 'sms_balance', label: t('sms.balance'), numeric: true, render: r => <Ltr>{fmtMoney(r.sms_balance, locale)}</Ltr> },
    { key: 'status', label: t('academic.status'), render: r => <StatusBadge status={r.status} /> },
  ]
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('super.institutions')} actions={<Button onClick={() => setCreating(true)} data-action="new"><Plus aria-hidden="true" className="h-4 w-4" />{t('super.new')}</Button>} />
      <Card className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input type="search" placeholder={t('super.search_hint')} aria-label={t('common.search')} value={f.q} onChange={e => set('q', e.target.value)} />
          <Select aria-label={t('academic.status')} placeholder={t('common.all')} value={f.status} onChange={e => set('status', e.target.value)} options={STATUSES.map(s => ({ value: s, label: t(`status.${s}`) }))} />
          <Select aria-label={t('super.type')} placeholder={t('common.all')} value={f.type} onChange={e => set('type', e.target.value)} options={TYPES.map(s => ({ value: s, label: t(`dashboard.types.${s}`) }))} />
        </div>
        <List columns={columns} rows={query.data?.data ?? []} onRowClick={r => navigate(`/super-admin/institutions/${r.id}`)} loading={query.isPending} error={query.isError} onRetry={query.refetch}
          pagination={query.data?.meta ? { page: query.data.meta.current_page, last: query.data.meta.last_page, onChange: setPage } : null} />
      </Card>
      <CreateInstitution open={creating} onClose={() => setCreating(false)} onCreated={(i) => navigate(`/super-admin/institutions/${i.id}`)} />
    </div>
  )
}

function CreateInstitution({ open, onClose, onCreated }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm({ defaultValues: { institution_type: 'school' } })
  const submit = async (v) => {
    try {
      const { data } = await api.post('/super/institutions', { name: v.name, slug: v.slug, institution_type: v.institution_type, phone: v.phone || null,
        // D170 (2): the first admin is active at once; the server makes a one-time temporary password, shown once on the detail page
        admin: { name: v.admin_name, contact: v.admin_phone ? { channel: 'phone', value: v.admin_phone } : { channel: 'email', value: v.admin_email } } })
      useUiStore.getState().addToast(t('common.saved'))
      qc.invalidateQueries({ queryKey: ['super'] })
      reset(); onClose(); onCreated(takeCredentials(data.data))
    } catch (e) {
      Object.entries(e.response?.data?.errors ?? {}).forEach(([k, m]) => setError(k.startsWith('admin.contact') ? (v.admin_phone ? 'admin_phone' : 'admin_email') : k.replace('admin.', 'admin_'), { message: m[0] }))
    }
  }
  const req = { required: t('super.required') }
  return (
    <Modal open={open} onClose={onClose} title={t('super.new')}>
      <form onSubmit={handleSubmit(submit)} className="grid gap-3 sm:grid-cols-2" noValidate data-testid="new-institution">
        <Input label={t('super.name')} error={errors.name?.message} {...register('name', req)} />
        <Input label={t('super.slug')} ltr hint={t('super.slug_hint')} error={errors.slug?.message} {...register('slug', req)} />
        <Select label={t('super.type')} options={TYPES.map(s => ({ value: s, label: t(`dashboard.types.${s}`) }))} {...register('institution_type')} />
        <Input label={t('super.phone')} ltr inputMode="tel" error={errors.phone?.message} {...register('phone')} />
        <h3 className="sm:col-span-2 font-semibold mt-2">{t('super.first_admin')}</h3>
        <Input label={t('super.name')} error={errors.admin_name?.message} {...register('admin_name', req)} />
        <Input label={t('super.phone')} ltr inputMode="tel" error={errors.admin_phone?.message} {...register('admin_phone', { validate: (val, all) => (val || all.admin_email ? true : t('super.required')) })} />
        <Input label={t('super.email')} ltr type="email" error={errors.admin_email?.message} {...register('admin_email')} />
        <div className="sm:col-span-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
        </div>
      </form>
    </Modal>
  )
}
