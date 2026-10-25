import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus } from 'lucide-react'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import StatusBadge from '../../components/StatusBadge'
import List from '../../ui/variants/List'
import Modal from '../../ui/variants/Modal'
import { Input, Select } from '../../components/FormField'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState } from '../../components/StateViews'

const KEY = ['super', 'qb-pricing']
const AUDIENCES = ['institution', 'student']
const KINDS = ['question_answer', 'concept', 'resource_slide', 'resource_book', 'resource_pdf', 'quiz_package', 'class_pack', 'subject_pack', 'chapter_pack']   // D165 ST.3: *_pack - students only
const TARGETS = ['all', 'item', 'question_type', 'topic', 'chapter', 'subject', 'class_level', 'resource_kind', 'quiz_package']
const METHODS = ['free', 'first_n_items_free', 'first_n_pages_free', 'percent_off', 'amount_off', 'fixed_price', 'free_for_class_level', 'free_first_n_per_buyer']
const NO_VALUE = ['free', 'free_for_class_level']
const when = (v) => (v ? v.slice(0, 16).replace('T', ' ') : '—')

// QB.6 /super-admin/qb/pricing (D66, question-bank.md §4): the prices in force (a change is a new row from a moment on) and the
// free / partly-free / discount rules (switched off, never deleted). A new rule can be previewed on sample items before saving.
export default function QbPricing() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const prices = useQuery({ queryKey: [...KEY, 'prices'], queryFn: () => api.get('/super/qb/prices').then(r => r.data.data) })
  const rules = useQuery({ queryKey: [...KEY, 'rules'], queryFn: () => api.get('/super/qb/price-rules').then(r => r.data.data) })
  const types = useQuery({ queryKey: ['writer', 'types'], queryFn: () => api.get('/writer/question-types').then(r => r.data.data) })
  const [open, setOpen] = useState(null)
  const typeName = (id) => { const ty = types.data?.find(x => x.id === id); return ty ? ((locale === 'bn' ? ty.name_bn : ty.name_en) || ty.name_en) : '—' }
  const refresh = () => qc.invalidateQueries({ queryKey: KEY })
  const switchOff = (r) => useUiStore.getState().openConfirm({
    title: t('qbp.rule_off_confirm'), description: t('qbp.rule_off_hint'), type: 'danger', confirmLabel: t('qb.switch_off'),
    onConfirm: async () => { await api.put(`/super/qb/price-rules/${r.id}`, { is_active: false }); useUiStore.getState().addToast(t('common.saved')); refresh() },
  })

  const priceCols = [
    { key: 'item_kind', label: t('qbp.kind'), primary: true, render: p => `${t(`qbp.kinds.${p.item_kind}`)}${p.qb_question_type_id ? ` · ${typeName(p.qb_question_type_id)}` : ''}` },
    { key: 'audience', label: t('qbp.audience'), render: p => t(`qbp.audiences.${p.audience}`) },
    { key: 'amount', label: t('qbp.amount'), render: p => <Ltr>৳{p.amount}</Ltr> },
    { key: 'effective_from', label: t('qbp.from'), render: p => <Ltr>{when(p.effective_from)}</Ltr> },
  ]
  const ruleCols = [
    { key: 'method', label: t('qbp.method'), primary: true, render: r => <>{t(`qbp.methods.${r.method}`)}{r.value != null && <Ltr> ({r.value})</Ltr>}</> },
    { key: 'target', label: t('qbp.target'), render: r => <>{t(`qbp.targets.${r.target_type}`)}{r.target_ref && <Ltr> {r.target_ref}</Ltr>}</> },
    { key: 'audience', label: t('qbp.audience'), render: r => t(`qbp.audiences.${r.audience}`) },
    { key: 'priority', label: t('qbp.priority'), render: r => <Ltr>{r.priority}</Ltr> },
    { key: 'window', label: t('qbp.window'), render: r => <Ltr>{when(r.starts_at)} → {when(r.ends_at)}</Ltr> },
    { key: 'is_active', label: t('qb.state'), render: r => <StatusBadge status={r.is_active ? 'active' : 'inactive'} /> },
    { key: 'actions', label: t('common.actions'), action: true, render: r => r.is_active && <Button variant="secondary" onClick={() => switchOff(r)} data-action="rule-off">{t('qb.switch_off')}</Button> },
  ]
  return (
    <div className="flex flex-col gap-4" data-testid="qb-pricing">
      <PageHeader title={t('qbp.title')} />
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t('qbp.prices')}</h2>
          <Button onClick={() => setOpen('price')} data-action="new-price"><Plus aria-hidden="true" className="h-4 w-4" />{t('qbp.new_price')}</Button>
        </div>
        <p className="text-xs text-content-muted">{t('qbp.prices_hint')}</p>
        <div data-testid="qb-prices"><List columns={priceCols} rows={prices.data?.current ?? []} loading={prices.isPending} error={prices.isError} onRetry={prices.refetch} empty={<EmptyState title={t('qbp.no_prices')} />} /></div>
      </Card>
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t('qbp.rules')}</h2>
          <Button onClick={() => setOpen('rule')} data-action="new-rule"><Plus aria-hidden="true" className="h-4 w-4" />{t('qbp.new_rule')}</Button>
        </div>
        <p className="text-xs text-content-muted">{t('qbp.rules_hint')}</p>
        <div data-testid="qb-rules"><List columns={ruleCols} rows={rules.data ?? []} loading={rules.isPending} error={rules.isError} onRetry={rules.refetch} empty={<EmptyState title={t('qbp.no_rules')} />} /></div>
      </Card>
      {open === 'price' && <NewPrice types={types.data ?? []} typeName={typeName} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); refresh() }} />}
      {open === 'rule' && <NewRule onClose={() => setOpen(null)} onSaved={() => { setOpen(null); refresh() }} />}
    </div>
  )
}

function NewPrice({ types, typeName, onClose, onSaved }) {
  const { t } = useTranslation()
  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: { audience: 'institution', item_kind: 'question_answer', qb_question_type_id: '', amount: '', effective_from: '' } })
  const submit = async (v) => {
    try {
      await api.post('/super/qb/prices', { audience: v.audience, item_kind: v.item_kind, qb_question_type_id: v.item_kind === 'question_answer' ? Number(v.qb_question_type_id) || null : null,
        amount: v.amount, effective_from: v.effective_from || null })
      useUiStore.getState().addToast(t('common.saved'))
      onSaved()
    } catch (e) {
      Object.entries(e.response?.data?.errors ?? {}).forEach(([k, m]) => setError(k, { message: m[0] }))
    }
  }
  return (
    <Modal open onClose={onClose} title={t('qbp.new_price')}>
      <form onSubmit={handleSubmit(submit)} className="grid gap-3 sm:grid-cols-2" noValidate data-testid="new-price">
        <Select label={t('qbp.audience')} options={AUDIENCES.map(a => ({ value: a, label: t(`qbp.audiences.${a}`) }))} {...register('audience')} />
        <Select label={t('qbp.kind')} options={KINDS.map(k => ({ value: k, label: t(`qbp.kinds.${k}`) }))} {...register('item_kind')} />
        {watch('item_kind') === 'question_answer' && <Select label={t('qb.type')} placeholder={t('qb.pick')} error={errors.qb_question_type_id?.message}
          options={types.map(ty => ({ value: String(ty.id), label: typeName(ty.id) }))} {...register('qb_question_type_id')} />}
        <Input label={t('qbp.amount')} ltr inputMode="decimal" hint={t('qbp.amount_hint')} error={errors.amount?.message} {...register('amount', { required: t('super.required') })} />
        <Input label={t('qbp.from')} ltr type="datetime-local" hint={t('qbp.from_hint')} error={errors.effective_from?.message} {...register('effective_from')} />
        <div className="sm:col-span-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
        </div>
      </form>
    </Modal>
  )
}

function NewRule({ onClose, onSaved }) {
  const { t } = useTranslation()
  const { register, handleSubmit, watch, getValues, setError, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { target_type: 'all', target_ref: '', audience: 'both', method: 'free', value: '', priority: '0', starts_at: '', ends_at: '', note: '', samples: '', quote_audience: 'institution' } })
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const body = (v) => ({ target_type: v.target_type, target_ref: v.target_type === 'all' ? null : v.target_ref, audience: v.audience, method: v.method,
    value: NO_VALUE.includes(v.method) ? null : v.value, priority: Number(v.priority) || 0, starts_at: v.starts_at || null, ends_at: v.ends_at || null, note: v.note || null })
  const fail = (e) => Object.entries(e.response?.data?.errors ?? {}).forEach(([k, m]) => setError(k.startsWith('items') ? 'samples' : k.replace(/\.\d+.*$/, ''), { message: m[0] }))   // a registered field, so the next submit clears it
  const runPreview = async () => {
    const v = getValues()
    const items = v.samples.split(/[\s,]+/).filter(Boolean).map(s => s.split(':')).map(([type, id]) => ({ type, id: Number(id) }))
    setBusy(true)
    try { setPreview((await api.post('/super/qb/price-rules/preview', { ...body(v), quote_audience: v.quote_audience, items })).data.data) } catch (e) { fail(e) } finally { setBusy(false) }
  }
  const submit = async (v) => {
    try { await api.post('/super/qb/price-rules', body(v)); useUiStore.getState().addToast(t('common.saved')); onSaved() } catch (e) { fail(e) }
  }
  const method = watch('method')
  return (
    <Modal open onClose={onClose} title={t('qbp.new_rule')}>
      <form onSubmit={handleSubmit(submit)} className="grid gap-3 sm:grid-cols-2" noValidate data-testid="new-rule">
        <Select label={t('qbp.method')} options={METHODS.map(m => ({ value: m, label: t(`qbp.methods.${m}`) }))} {...register('method')} />
        {!NO_VALUE.includes(method) && <Input label={t('qbp.value')} ltr inputMode="decimal" hint={t(`qbp.value_hint.${method}`)} error={errors.value?.message} {...register('value')} />}
        <Select label={t('qbp.target')} options={TARGETS.map(x => ({ value: x, label: t(`qbp.targets.${x}`) }))} error={errors.target_type?.message} {...register('target_type')} />
        {watch('target_type') !== 'all' && <Input label={t('qbp.target_ref')} ltr hint={t('qbp.target_ref_hint')} error={errors.target_ref?.message} {...register('target_ref')} />}
        <Select label={t('qbp.audience')} options={['both', ...AUDIENCES].map(a => ({ value: a, label: t(`qbp.audiences.${a}`) }))} {...register('audience')} />
        <Input label={t('qbp.priority')} ltr inputMode="numeric" {...register('priority')} />
        <Input label={t('qbp.starts')} ltr type="datetime-local" error={errors.starts_at?.message} {...register('starts_at')} />
        <Input label={t('qbp.ends')} ltr type="datetime-local" error={errors.ends_at?.message} {...register('ends_at')} />
        <Input className="sm:col-span-2" label={t('qbp.note')} {...register('note')} />
        <fieldset className="sm:col-span-2 flex flex-col gap-2 rounded-token [border:1px_solid_var(--line)] p-2" data-testid="rule-preview">
          <legend className="font-semibold px-1">{t('qbp.preview')}</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input className="sm:col-span-2" label={t('qbp.samples')} ltr hint={t('qbp.samples_hint')} error={errors.samples?.message} {...register('samples')} />
            <Select label={t('qbp.audience')} options={AUDIENCES.map(a => ({ value: a, label: t(`qbp.audiences.${a}`) }))} {...register('quote_audience')} />
          </div>
          <div><Button variant="secondary" onClick={runPreview} loading={busy} data-action="preview">{t('qbp.run_preview')}</Button></div>
          {preview && (
            <ul className="flex flex-col gap-1 text-sm" data-testid="preview-result">
              {preview.map(p => (
                <li key={`${p.type}:${p.id}`} className="flex flex-wrap gap-2">
                  <Ltr>{p.type}:{p.id}</Ltr>
                  <span>{t('qbp.before')}: <Ltr>{p.before.price ?? t('qbp.not_for_sale')}</Ltr></span>
                  <span className="font-medium">{t('qbp.after')}: <Ltr>{p.after.price ?? t('qbp.not_for_sale')}</Ltr></span>
                  {p.after.by_this_rule && <span className="text-xs text-content-muted">({t('qbp.by_this_rule')})</span>}
                  {p.after.free_pages && <span className="text-xs text-content-muted">{t('qbp.free_pages', { n: p.after.free_pages })}</span>}
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        <div className="sm:col-span-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" loading={isSubmitting} data-action="save-rule">{t('common.save')}</Button>
        </div>
      </form>
    </Modal>
  )
}
