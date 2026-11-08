import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Users } from 'lucide-react'
import api from '../../api/axios'
import { useLocale } from '../../ui/I18nProvider'
import { useTerms } from '../../hooks/useTerms'
import { fmtDate } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import List from '../../ui/variants/List'
import Modal from '../../ui/variants/Modal'
import { Input, Select, Textarea } from '../../components/FormField'
import { useCrud, clean } from '../../features/academic/useCrud'

const TARGETS = ['all', 'students', 'parents', 'teachers']

// D193 NTC.1 /admin/notices: write, schedule, edit and remove notices; a notice can ask for acknowledgement by a date, and the
// receipts view shows who read / acknowledged it. Program and batch narrow the audience (both empty = the whole institution).
export default function AdminNotices() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const term = useTerms()
  const { list, save, remove } = useCrud('notices')
  const programs = useCrud('programs').list
  const batches = useCrud('batches').list
  const [editing, setEditing] = useState(null)
  const [receiptsOf, setReceiptsOf] = useState(null)
  const receipts = useQuery({ queryKey: ['notices', 'receipts', receiptsOf?.id], enabled: Boolean(receiptsOf), queryFn: () => api.get(`/notices/${receiptsOf.id}/receipts`).then(r => r.data.data) })
  const { register, handleSubmit, reset, watch, setError, formState: { errors, isSubmitting } } = useForm()
  const programId = watch('program_id')
  const requireAck = watch('require_ack')
  const open = (row) => {
    reset(row?.id ? { ...row, program_id: row.program_id ?? '', batch_id: row.batch_id ?? '', published_at: row.published_at?.slice(0, 16) ?? '' } : { target: 'all', require_ack: false })
    setEditing(row ?? {})
  }
  const onSubmit = async (v) => {
    const body = clean({ title: v.title, content: v.content, target: v.target, program_id: v.program_id || null, batch_id: v.batch_id || null,
      published_at: v.published_at || null, require_ack: Boolean(v.require_ack), ack_deadline: v.require_ack ? (v.ack_deadline || null) : null })
    if (await save(body, editing?.id, setError)) setEditing(null)
  }
  const columns = [
    { key: 'title', label: t('notices.notice_title'), primary: true, render: r => <span dir="auto">{r.title}</span> },
    { key: 'target', label: t('notices.target'), render: r => t(`notices.targets.${r.target}`) },
    { key: 'published_at', label: t('notices.published_at'), render: r => r.published_at ? fmtDate(r.published_at, locale) : t('notices.draft') },
    { key: 'require_ack', label: t('notices.require_ack'), render: r => r.require_ack ? (r.ack_deadline ? fmtDate(r.ack_deadline, locale) : t('notices.yes')) : t('notices.no') },
    { key: 'actions', label: t('common.actions'), action: true, render: r => (
      <span className="flex gap-1">
        <Button variant="ghost" onClick={() => setReceiptsOf(r)} aria-label={`${t('notices.receipts')} ${r.title}`}><Users aria-hidden="true" className="h-4 w-4" /></Button>
        <Button variant="ghost" onClick={() => open(r)} aria-label={`${t('common.edit')} ${r.title}`}><Pencil aria-hidden="true" className="h-4 w-4" /></Button>
        <Button variant="ghost" onClick={() => remove({ ...r, name: r.title })} aria-label={`${t('common.delete')} ${r.title}`}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>
      </span>
    ) },
  ]
  return (
    <div>
      <PageHeader title={t('notices.title')} actions={<Button onClick={() => open()}><Plus aria-hidden="true" className="h-4 w-4" />{t('notices.add')}</Button>} />
      <Card><List columns={columns} rows={list.data ?? []} loading={list.isPending} error={list.isError} onRetry={list.refetch} /></Card>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={t(editing?.id ? 'notices.edit' : 'notices.add')}>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2" noValidate>
          <Input className="sm:col-span-2" label={t('notices.notice_title')} error={errors.title?.message} {...register('title', { required: t('notices.notice_title') })} />
          <Textarea className="sm:col-span-2" label={t('notices.content')} error={errors.content?.message} {...register('content', { required: t('notices.content') })} />
          <Select label={t('notices.target')} error={errors.target?.message} options={TARGETS.map(x => ({ value: x, label: t(`notices.targets.${x}`) }))} {...register('target')} />
          <Select label={term('program')} placeholder={t('notices.everyone')} error={errors.program_id?.message}
            options={(programs.data ?? []).map(p => ({ value: String(p.id), label: p.name }))} {...register('program_id')} />
          <Select label={term('batch')} placeholder={t('notices.whole_program')} disabled={!programId} error={errors.batch_id?.message}
            options={(batches.data ?? []).filter(b => String(b.program_id ?? b.program?.id) === String(programId)).map(b => ({ value: String(b.id), label: b.name }))} {...register('batch_id')} />
          <Input type="datetime-local" ltr label={t('notices.published_at')} hint={t('notices.publish_hint')} error={errors.published_at?.message} {...register('published_at')} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" {...register('require_ack')} />{t('notices.require_ack')}</label>
          {requireAck && <Input type="date" ltr label={t('notices.ack_deadline')} error={errors.ack_deadline?.message} {...register('ack_deadline')} />}
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
      <Modal open={receiptsOf !== null} onClose={() => setReceiptsOf(null)} title={t('notices.receipts')}>
        {receipts.data && (
          <div className="grid gap-3">
            <p className="text-sm">{t('notices.receipt_summary', { total: receipts.data.total, read: receipts.data.read, acked: receipts.data.acknowledged })}</p>
            {receipts.data.overdue && <p className="text-sm text-danger">{t('notices.overdue')}</p>}
            <List columns={[
              { key: 'name', label: t('notices.recipient'), primary: true, render: r => <span dir="auto">{r.name}</span> },
              { key: 'read_at', label: t('notices.read'), render: r => r.read_at ? fmtDate(r.read_at, locale) : '—' },
              { key: 'acknowledged_at', label: t('notices.acknowledged'), render: r => r.acknowledged_at ? fmtDate(r.acknowledged_at, locale) : '—' },
            ]} rows={(receipts.data.recipients ?? []).map(r => ({ ...r, id: r.user_id }))} />
          </div>
        )}
        {receipts.isPending && receiptsOf && <p className="text-sm text-content-muted">{t('common.loading')}</p>}
      </Modal>
    </div>
  )
}
