import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, FileDown } from 'lucide-react'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtMoney } from '../../i18n/format'
import { usePrint } from '../../hooks/usePrint'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import StatusBadge from '../../components/StatusBadge'
import List from '../../ui/variants/List'
import Modal from '../../ui/variants/Modal'
import { Input, Select, Textarea } from '../../components/FormField'
import Ltr from '../../components/bidi/Ltr'
import { clean } from '../academic/useCrud'

// R3.12: one list page for the R3 money/HR screens. The page config names the endpoint, the columns, the create form and the row
// actions; the server decides everything (roles, module, amounts) - a refused action shows the server's message, nothing is computed here.
// Column kinds: money (taka, LTR), status (StatusBadge), date (LTR), text (dir=auto). Field kinds: text, money, date, select, checkbox, textarea.
export function useOptions(endpoint, label = 'name') {
  const q = useQuery({ queryKey: [endpoint, 'options'], queryFn: () => api.get(`/${endpoint}`).then(r => r.data.data), enabled: Boolean(endpoint) })
  return (q.data ?? []).map(o => ({ value: String(o.id), label: typeof label === 'function' ? label(o) : o[label] }))
}

// a teacher or staff member as one select value "teacher:12" / "staff:7", sent as payee_type + payee_id
function usePayees(enabled) {
  const teachers = useOptions(enabled ? 'teachers' : null)
  const staff = useOptions(enabled ? 'hr/staff' : null)
  return [...teachers.map(o => ({ ...o, value: `teacher:${o.value}` })), ...staff.map(o => ({ ...o, value: `staff:${o.value}` }))]
}
const expand = (v) => {
  if (!v.payee) return v
  const { payee, ...rest } = v
  const [payee_type, payee_id] = payee.split(':')
  return { ...rest, payee_type, payee_id: Number(payee_id) }
}

function Field({ f, register, errors, t }) {
  const options = useOptions(f.optionsFrom, f.optionLabel)
  const payees = usePayees(f.kind === 'payee')
  if (f.kind === 'payee') return <Select label={t(f.label)} placeholder="—" options={payees} error={errors[f.name]?.message} {...register(f.name, { required: t(f.label) })} />
  const label = t(f.label)
  const rules = f.required ? { required: label } : {}
  if (f.kind === 'select') {
    const opts = f.options ? f.options.map(o => ({ value: o, label: t(`${f.optionPrefix ?? 'r3.values'}.${o}`, { defaultValue: o }) })) : options
    return <Select label={label} placeholder={f.required ? undefined : '—'} options={opts} error={errors[f.name]?.message} {...register(f.name, rules)} />
  }
  if (f.kind === 'checkbox') return (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" {...register(f.name)} />{label}</label>
  )
  if (f.kind === 'textarea') return <Textarea label={label} error={errors[f.name]?.message} {...register(f.name, rules)} />
  return <Input label={label} type={f.kind === 'date' ? 'date' : 'text'} ltr={f.kind === 'money' || f.kind === 'date'}
    inputMode={f.kind === 'money' ? 'decimal' : undefined} error={errors[f.name]?.message} {...register(f.name, rules)} />
}

function FormModal({ open, title, fields, defaults, onClose, onSubmit }) {
  const { t } = useTranslation()
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } = useForm({ values: defaults })
  const submit = async (v) => { if (await onSubmit(v, setError)) { reset(); onClose() } }
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={handleSubmit(submit)} className="grid gap-3 sm:grid-cols-2" noValidate>
        {fields.map(f => <div key={f.name} className={f.wide ? 'sm:col-span-2' : ''}><Field f={f} register={register} errors={errors} t={t} /></div>)}
        <div className="sm:col-span-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function ResourcePage({ title, endpoint, params, columns, create, edit, actions = [], pdfs = [], intro }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const toast = useUiStore.getState().addToast
  const print = usePrint()
  const [form, setForm] = useState(null)   // { mode: 'create'|'edit'|'action', row, action }
  const list = useQuery({ queryKey: [endpoint, params ?? {}], queryFn: () => api.get(`/${endpoint}`, { params }).then(r => r.data.data) })

  const send = async (method, url, values, setError) => {
    try {
      await api[method](url, expand(values))
      toast(t('common.saved'))
      qc.invalidateQueries({ queryKey: [endpoint] })
      return true
    } catch (e) {
      Object.entries(e.response?.data?.errors ?? {}).forEach(([f, m]) => setError?.(f, { message: m[0] }))
      return false
    }
  }
  const run = (a, row) => {
    if (a.fields) { setForm({ mode: 'action', row, action: a }); return }
    useUiStore.getState().openConfirm({ title: t(a.label), type: a.danger ? 'danger' : undefined, confirmLabel: t(a.label),
      onConfirm: () => send(a.method ?? 'post', a.path(row), a.body?.(row) ?? {}) })
  }

  const cell = (c, r) => {
    const v = typeof c.value === 'function' ? c.value(r) : r[c.key]
    if (c.kind === 'money') return <Ltr>{v === null || v === undefined ? '—' : fmtMoney(v, locale)}</Ltr>
    if (c.kind === 'status') return <StatusBadge status={v} />
    if (c.kind === 'date') return <Ltr>{v ? String(v).slice(0, 10) : '—'}</Ltr>
    if (c.kind === 'bool') return v ? t('r3.yes') : t('r3.no')
    if (c.kind === 'enum') return t(`r3.values.${v}`, { defaultValue: v ?? '—' })
    return <span dir="auto">{v ?? '—'}</span>
  }
  const rowActions = (r) => [
    ...(edit ? [<Button key="edit" variant="ghost" onClick={() => setForm({ mode: 'edit', row: r })}>{t('common.edit')}</Button>] : []),
    ...actions.filter(a => !a.when || a.when(r)).map(a => <Button key={a.key} variant={a.danger ? 'danger' : 'ghost'} onClick={() => run(a, r)}>{t(a.label)}</Button>),
    ...pdfs.filter(p => !p.when || p.when(r)).map(p => (
      <Button key={p.key} variant="ghost" loading={print.loading} onClick={() => print.preview(p.path(r))} aria-label={t(p.label)}><FileDown aria-hidden="true" className="h-4 w-4" />{t(p.label)}</Button>)),
  ]
  const cols = [
    ...columns.map((c, i) => ({ key: c.key, label: t(c.label), primary: i === 0, numeric: c.kind === 'money', render: r => cell(c, r) })),
    ...(edit || actions.length || pdfs.length ? [{ key: 'actions', label: t('common.actions'), action: true, render: r => <div className="flex flex-wrap gap-1">{rowActions(r)}</div> }] : []),
  ]
  const rows = Array.isArray(list.data) ? list.data : (list.data?.data ?? [])
  const modal = form?.mode === 'action'
    ? { title: t(form.action.label), fields: form.action.fields, defaults: {}, submit: async (v, se) => send(form.action.method ?? 'post', form.action.path(form.row), form.action.prepare ? await form.action.prepare(form.row, clean(v)) : { ...(form.action.body?.(form.row) ?? {}), ...clean(v) }, se) }
    : form?.mode === 'edit'
      ? { title: t('common.edit'), fields: edit.fields, defaults: Object.fromEntries(edit.fields.map(f => [f.name, form.row[f.name] ?? ''])),
          submit: (v, se) => send(edit.method ?? 'put', edit.path ? edit.path(form.row) : `/${endpoint}/${form.row.id}`, clean(v), se) }
      : form ? { title: t(create.label), fields: create.fields, defaults: create.defaults ?? {}, submit: async (v, se) => send('post', create.path ?? `/${endpoint}`, create.transform ? await create.transform(clean(v)) : clean(v), se) } : null
  return (
    <div>
      <PageHeader title={t(title)} subtitle={intro ? t(intro) : undefined}
        actions={create ? <Button onClick={() => setForm({ mode: 'create' })}><Plus aria-hidden="true" className="h-4 w-4" />{t(create.label)}</Button> : null} />
      <Card><List columns={cols} rows={rows} loading={list.isPending} error={list.isError} onRetry={list.refetch} /></Card>
      {modal && <FormModal open title={modal.title} fields={modal.fields} defaults={modal.defaults} onClose={() => setForm(null)} onSubmit={modal.submit} />}
    </div>
  )
}
