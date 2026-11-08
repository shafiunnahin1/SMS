import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { Input, Select } from '../../components/FormField'
import { useUiStore } from '../../store/uiStore'

// D193 EXP.1 (D38) /super-admin/exports: back an institution up (a reason, the Super Admin's own passphrase; never salary data) and
// restore a backup / export as a NEW institution (a new address; nothing that exists is touched).
export default function SuperExports() {
  const { t } = useTranslation()
  const toast = useUiStore.getState().addToast
  const insts = useQuery({ queryKey: ['super', 'institutions', 'all'], queryFn: () => api.get('/super/institutions', { params: { per_page: 100 } }).then(r => r.data.data) })
  const bk = useForm()
  const im = useForm({ defaultValues: { status: 'trial' } })
  const fail = (form) => (e) => {
    const errs = e.response?.data?.errors
    if (errs) Object.entries(errs).forEach(([f, m]) => form.setError(f, { message: m[0] }))
    else toast(e.response?.data?.message, 'error')
  }
  const onBackup = async (v) => {
    try {
      const { data } = await api.post(`/super/institutions/${v.institution_id}/backup`, { reason: v.reason, passphrase: v.passphrase, passphrase_confirmation: v.passphrase_confirmation })
      toast(t('exports.backup_ready', { id: data.data.id }))
      bk.reset({})
    } catch (e) { fail(bk)(e) }
  }
  const onImport = async (v) => {
    try {
      const fd = new FormData()
      if (v.file?.[0]) fd.append('file', v.file[0]); else fd.append('export_id', v.export_id)
      for (const k of ['new_slug', 'passphrase', 'status']) fd.append(k, v[k])
      const { data } = await api.post('/super/institutions/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast(t('exports.imported', { slug: data.data.slug }))
      im.reset({ status: 'trial' })
    } catch (e) { fail(im)(e) }
  }
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('exports.super_title')} />
      <Card>
        <h2 className="mb-2 font-semibold">{t('exports.backup')}</h2>
        <form onSubmit={bk.handleSubmit(onBackup)} className="grid gap-3 sm:grid-cols-2" noValidate>
          <Select label={t('exports.institution')} placeholder={t('exports.choose')} error={bk.formState.errors.institution_id?.message}
            options={(insts.data ?? []).map(i => ({ value: String(i.id), label: `${i.name} (${i.slug})` }))} {...bk.register('institution_id', { required: t('exports.institution') })} />
          <Input label={t('exports.reason')} error={bk.formState.errors.reason?.message} {...bk.register('reason', { required: t('exports.reason') })} />
          <Input type="password" autoComplete="new-password" label={t('exports.passphrase')} hint={t('exports.passphrase_hint')} error={bk.formState.errors.passphrase?.message} {...bk.register('passphrase', { required: t('exports.passphrase') })} />
          <Input type="password" autoComplete="new-password" label={t('exports.passphrase_again')} error={bk.formState.errors.passphrase_confirmation?.message} {...bk.register('passphrase_confirmation', { required: t('exports.passphrase_again') })} />
          <p className="text-sm text-content-muted sm:col-span-2">{t('exports.backup_hint')}</p>
          <div className="sm:col-span-2 flex justify-end"><Button type="submit" loading={bk.formState.isSubmitting}>{t('exports.backup')}</Button></div>
        </form>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">{t('exports.import')}</h2>
        <form onSubmit={im.handleSubmit(onImport)} className="grid gap-3 sm:grid-cols-2" noValidate>
          <Input ltr inputMode="numeric" label={t('exports.export_id')} error={im.formState.errors.export_id?.message} {...im.register('export_id')} />
          <Input type="file" accept=".edux" label={t('exports.or_file')} error={im.formState.errors.file?.message} {...im.register('file')} />
          <Input ltr label={t('exports.new_slug')} error={im.formState.errors.new_slug?.message} {...im.register('new_slug', { required: t('exports.new_slug') })} />
          <Select label={t('exports.new_status')} options={['trial', 'active'].map(s => ({ value: s, label: t(`exports.inst_statuses.${s}`) }))} {...im.register('status')} />
          <Input type="password" autoComplete="off" label={t('exports.passphrase')} error={im.formState.errors.passphrase?.message} {...im.register('passphrase', { required: t('exports.passphrase') })} />
          <p className="text-sm text-content-muted sm:col-span-2">{t('exports.import_hint')}</p>
          <div className="sm:col-span-2 flex justify-end"><Button type="submit" loading={im.formState.isSubmitting}>{t('exports.import')}</Button></div>
        </form>
      </Card>
    </div>
  )
}
