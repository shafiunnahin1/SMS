import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import api from '../../api/axios'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import List from '../../ui/variants/List'
import Modal from '../../ui/variants/Modal'
import { ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'
import Ltr from '../../components/bidi/Ltr'
import { useUiStore } from '../../store/uiStore'

const CATEGORIES = ['general', 'billing', 'bug', 'how_to', 'feature', 'sms', 'payment', 'domain']
const PRIORITIES = ['low', 'normal', 'high', 'urgent']
const PLATFORM_STATUSES = ['pending_customer', 'pending_platform', 'resolved', 'closed']

// D193 SUP.1: /admin/support (mode "institution": open, reply, close / reopen, rate) and /super-admin/support (mode "super": every
// institution's queue, overdue first response in red, internal notes, status). The server decides what each side may see.
export default function SupportTickets({ mode = 'institution' }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const base = mode === 'super' ? '/super/support/tickets' : '/support/tickets'
  const list = useQuery({ queryKey: ['support', mode], queryFn: () => api.get(base).then(r => r.data.data) })
  const [openId, setOpenId] = useState(null)
  const [adding, setAdding] = useState(false)
  const detail = useQuery({ queryKey: ['support', mode, openId], enabled: Boolean(openId), queryFn: () => api.get(`${base}/${openId}`).then(r => r.data.data) })
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm()
  const reply = useForm()
  const toast = useUiStore.getState().addToast
  const refresh = () => qc.invalidateQueries({ queryKey: ['support', mode] })
  const call = async (fn) => {
    try { await fn(); refresh(); return true } catch (e) {
      const errs = e.response?.data?.errors
      if (errs) Object.entries(errs).forEach(([f, m]) => setError(f, { message: m[0] }))
      else if (e.response?.status === 422) toast(e.response.data.message, 'error')
      return false
    }
  }
  const onCreate = async (v) => { if (await call(() => api.post(base, v))) { toast(t('common.saved')); setAdding(false) } }
  const onReply = async (v) => { if (await call(() => api.post(`${base}/${openId}/messages`, { body: v.body, ...(mode === 'super' ? { is_internal: Boolean(v.is_internal) } : {}) }))) reply.reset() }
  const columns = [
    { key: 'ticket_no', label: t('support.no'), primary: true, render: r => <Ltr>{r.ticket_no}</Ltr> },
    ...(mode === 'super' ? [{ key: 'institution', label: t('support.institution'), render: r => <span dir="auto">{r.institution}</span> }] : []),
    { key: 'subject', label: t('support.subject'), render: r => <span dir="auto" className={r.overdue ? 'font-semibold text-danger' : ''}>{r.subject}{r.overdue ? ` · ${t('support.overdue')}` : ''}</span> },
    { key: 'priority', label: t('support.priority'), render: r => t(`support.priorities.${r.priority}`) },
    { key: 'status', label: t('support.status'), render: r => t(`support.statuses.${r.status}`) },
    { key: 'actions', label: t('common.actions'), action: true, render: r => <Button variant="ghost" onClick={() => setOpenId(r.id)}>{t('support.open')}</Button> },
  ]
  const d = detail.data
  return (
    <div>
      <PageHeader title={t('support.title')} actions={mode === 'institution' && <Button onClick={() => { reset({ category: 'general', priority: 'normal' }); setAdding(true) }}><Plus aria-hidden="true" className="h-4 w-4" />{t('support.new')}</Button>} />
      <Card><List columns={columns} rows={list.data ?? []} loading={list.isPending} error={list.isError} onRetry={list.refetch} /></Card>

      <Modal open={adding} onClose={() => setAdding(false)} title={t('support.new')}>
        <form onSubmit={handleSubmit(onCreate)} className="grid gap-3 sm:grid-cols-2" noValidate>
          <Input className="sm:col-span-2" label={t('support.subject')} error={errors.subject?.message} {...register('subject', { required: t('support.subject') })} />
          <Select label={t('support.category')} options={CATEGORIES.map(c => ({ value: c, label: t(`support.categories.${c}`) }))} {...register('category')} />
          <Select label={t('support.priority')} options={PRIORITIES.map(p => ({ value: p, label: t(`support.priorities.${p}`) }))} {...register('priority')} />
          <Textarea className="sm:col-span-2" label={t('support.body')} hint={t('support.no_personal')} error={errors.body?.message} {...register('body', { required: t('support.body') })} />
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdding(false)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={isSubmitting}>{t('support.send')}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={openId !== null} onClose={() => setOpenId(null)} title={d ? `${d.ticket_no} — ${d.subject}` : t('support.title')}>
        {detail.isPending && <Loader />}
        {detail.isError && <ErrorState onRetry={() => detail.refetch()} />}
        {d && (
          <div className="grid gap-3">
            <p className="text-sm text-content-muted">{t(`support.statuses.${d.status}`)} · {t(`support.priorities.${d.priority}`)}{d.institution ? ` · ${d.institution}` : ''}</p>
            <ul className="grid gap-2">
              {d.messages.map(m => (
                <li key={m.id} className={`rounded border p-2 text-sm ${m.is_internal ? 'border-dashed' : ''}`}>
                  <span className="block text-xs text-content-muted">{m.author_type === 'platform' ? t('support.platform') : (m.author ?? t('support.institution_side'))}{m.is_internal ? ` · ${t('support.internal')}` : ''} · {m.created_at ? fmtDate(m.created_at, locale) : ''}</span>
                  <span className="whitespace-pre-line" dir="auto">{m.body}</span>
                </li>
              ))}
            </ul>
            {d.status !== 'closed' && (
              <form onSubmit={reply.handleSubmit(onReply)} className="grid gap-2" noValidate>
                <Textarea label={t('support.reply')} {...reply.register('body', { required: true })} />
                {mode === 'super' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" {...reply.register('is_internal')} />{t('support.internal_note')}</label>}
                <div className="flex flex-wrap justify-end gap-2">
                  {mode === 'institution' && <Button variant="secondary" onClick={() => call(() => api.post(`${base}/${d.id}/close`))}>{t('support.close')}</Button>}
                  {mode === 'institution' && d.status === 'resolved' && <Button variant="secondary" onClick={() => call(() => api.post(`${base}/${d.id}/reopen`))}>{t('support.reopen')}</Button>}
                  <Button type="submit" loading={reply.formState.isSubmitting}>{t('support.send')}</Button>
                </div>
              </form>
            )}
            {mode === 'super' && d.status !== 'closed' && (
              <Select label={t('support.status')} value={d.status} onChange={e => call(() => api.post(`${base}/${d.id}/status`, { status: e.target.value }))}
                options={[...new Set([d.status, ...PLATFORM_STATUSES])].map(s => ({ value: s, label: t(`support.statuses.${s}`) }))} />
            )}
            {mode === 'institution' && d.status === 'closed' && (d.rating
              ? <p className="text-sm">{t('support.rated', { n: d.rating })}</p>
              : <div className="flex flex-wrap items-center gap-2"><span className="text-sm">{t('support.rate')}</span>
                  {[1, 2, 3, 4, 5].map(n => <Button key={n} variant="secondary" onClick={() => call(() => api.post(`${base}/${d.id}/rate`, { rating: n }))}>{n}</Button>)}</div>)}
          </div>
        )}
      </Modal>
    </div>
  )
}
