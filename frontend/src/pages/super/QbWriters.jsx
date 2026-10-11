import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus } from 'lucide-react'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import StatusBadge from '../../components/StatusBadge'
import List from '../../ui/variants/List'
import Modal from '../../ui/variants/Modal'
import { Input, Select } from '../../components/FormField'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState } from '../../components/StateViews'

const KEY = ['super', 'qb-writers']
const ROLES = ['content_writer', 'content_moderator']

// QB.2 /super-admin/qb/writers (D65): the platform's question-bank writers and moderators. The Super Admin adds one with a first
// password (changed at the first login, which always takes a one-time code) and switches them off instead of deleting them.
export default function QbWriters() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: KEY, queryFn: () => api.get('/super/qb/writers').then(r => r.data.data) })
  const [adding, setAdding] = useState(false)
  const toggle = (row) => useUiStore.getState().openConfirm({
    title: t(row.is_active ? 'qb.writer_off_confirm' : 'qb.writer_on_confirm', { name: row.name }), description: row.is_active ? t('qb.writer_off_hint') : '',
    type: row.is_active ? 'danger' : 'info', confirmLabel: t(row.is_active ? 'qb.switch_off' : 'qb.switch_on'),
    onConfirm: async () => {
      await api.patch(`/super/qb/writers/${row.id}`, { is_active: !row.is_active })
      useUiStore.getState().addToast(t('common.saved'))
      qc.invalidateQueries({ queryKey: KEY })
    },
  })
  const columns = [
    { key: 'name', label: t('qb.writer_name'), primary: true, render: r => <span dir="auto">{r.name}</span> },
    { key: 'role', label: t('qb.writer_role'), render: r => t(`qb.roles.${r.role}`) },
    { key: 'phone', label: t('qb.phone'), render: r => <Ltr>{r.phone}</Ltr> },
    { key: 'questions', label: t('qb.questions_count'), render: r => Object.entries(r.questions ?? {}).map(([s, n]) => `${t(`qb.status.${s}`)}: ${n}`).join(' · ') || '—' },
    { key: 'is_active', label: t('qb.state'), render: r => <StatusBadge status={r.is_active ? 'active' : 'inactive'} /> },
    { key: 'actions', label: t('common.actions'), action: true, render: r => <Button variant="secondary" onClick={() => toggle(r)} data-action="toggle">{t(r.is_active ? 'qb.switch_off' : 'qb.switch_on')}</Button> },
  ]
  return (
    <div className="flex flex-col gap-4" data-testid="qb-writers">
      <PageHeader title={t('qb.writers')} actions={<Button onClick={() => setAdding(true)} data-action="new"><Plus aria-hidden="true" className="h-4 w-4" />{t('qb.add_writer')}</Button>} />
      <Card><List columns={columns} rows={q.data ?? []} loading={q.isPending} error={q.isError} onRetry={q.refetch} empty={<EmptyState title={t('qb.no_writers')} />} /></Card>
      {adding && <AddWriter onClose={() => setAdding(false)} onSaved={() => { setAdding(false); qc.invalidateQueries({ queryKey: KEY }) }} />}
    </div>
  )
}

function AddWriter({ onClose, onSaved }) {
  const { t } = useTranslation()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: { role: 'content_writer' } })
  const submit = async (v) => {
    try {
      await api.post('/super/qb/writers', { name: v.name, role: v.role, phone: v.phone, email: v.email || null, password: v.password })
      useUiStore.getState().addToast(t('common.saved'))
      onSaved()
    } catch (e) {
      Object.entries(e.response?.data?.errors ?? {}).forEach(([k, m]) => setError(k, { message: m[0] }))
    }
  }
  const req = { required: t('super.required') }
  return (
    <Modal open onClose={onClose} title={t('qb.add_writer')}>
      <form onSubmit={handleSubmit(submit)} className="grid gap-3 sm:grid-cols-2" noValidate data-testid="new-writer">
        <Input label={t('qb.writer_name')} error={errors.name?.message} {...register('name', req)} />
        <Select label={t('qb.writer_role')} options={ROLES.map(r => ({ value: r, label: t(`qb.roles.${r}`) }))} {...register('role')} />
        <Input label={t('qb.phone')} ltr inputMode="tel" hint={t('qb.phone_hint')} error={errors.phone?.message} {...register('phone', req)} />
        <Input label={t('super.email')} ltr type="email" error={errors.email?.message} {...register('email')} />
        <Input label={t('super.password')} ltr type="text" autoComplete="off" hint={t('super.password_hint')} error={errors.password?.message} {...register('password', req)} />
        <div className="sm:col-span-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
        </div>
      </form>
    </Modal>
  )
}
