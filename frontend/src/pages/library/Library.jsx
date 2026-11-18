import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtMoney } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import Tabs from '../../ui/variants/Tabs'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'
import { useStaffCan } from '../../features/staff/StaffDepartment'

const fieldErrors = (e) => Object.fromEntries(Object.entries(e.response?.data?.errors ?? {}).map(([k, m]) => [k, m[0]]))

// D227 LIB.2 /admin|staff|accountant/library: books, issue (by the student's ID), books out with return, overdue with the fine so far
// and unpaid fines (collect: admin / accountant; waive: admin), settings (admin). Staff see the same pages; the server allows each
// action only with its duty key. The accountant sees the fine list only.
export default function Library() {
  const { t } = useTranslation()
  const role = useAuthStore((s) => s.user?.role)
  const circulate = useStaffCan('staff.library.circulate')
  const tabs = role === 'accountant' ? ['overdue'] : ['books', ...(circulate ? ['issue'] : []), 'issued', 'overdue', ...(role === 'admin' ? ['settings'] : [])]
  const [tab, setTab] = useState(tabs[0])
  return (
    <div className="flex flex-col gap-4" data-testid="library">
      <PageHeader title={t('lib.title')} />
      {tabs.length > 1 && <Tabs label={t('lib.title')} value={tab} onChange={setTab} items={tabs.map(k => ({ key: k, label: t(`lib.tabs.${k}`) }))} />}
      {tab === 'books' && <Books />}
      {tab === 'issue' && <Issue />}
      {tab === 'issued' && <Out kind="issued" />}
      {tab === 'overdue' && <Out kind="overdue" role={role} />}
      {tab === 'settings' && <Settings />}
    </div>
  )
}

function Books() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const canManage = useStaffCan('staff.library.manage')
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('')
  const list = useQuery({ queryKey: ['library', 'books', q, category], queryFn: () => api.get('/library/books', { params: { q: q || undefined, category: category || undefined } }).then(r => r.data) })
  const blank = { title: '', author: '', isbn: '', category: '', total_copies: '1', shelf_location: '', published_year: '' }
  const [f, setF] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [errors, setErrors] = useState({})
  const save = async (e) => {
    e.preventDefault(); setErrors({})
    const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : (['total_copies', 'published_year'].includes(k) ? Number(v) : v)]))
    try {
      if (editing) await api.put(`/library/books/${editing}`, body); else await api.post('/library/books', body)
      setF(blank); setEditing(null); qc.invalidateQueries({ queryKey: ['library'] }); useUiStore.getState().addToast(t('lib.saved'))
    } catch (err) { setErrors(fieldErrors(err)) }
  }
  const remove = (b) => useUiStore.getState().openConfirm({ title: t('lib.remove'), description: b.title, confirmLabel: t('common.delete'), type: 'danger',
    onConfirm: async () => { try { await api.delete(`/library/books/${b.id}`); qc.invalidateQueries({ queryKey: ['library'] }) } catch { /* shown by the interceptor */ } } })
  const edit = (b) => { setEditing(b.id); setF(Object.fromEntries(Object.keys(blank).map(k => [k, b[k] == null ? '' : String(b[k])]))) }
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className={`${canManage ? 'lg:col-span-2' : 'lg:col-span-3'} flex flex-col gap-3`}>
        <div className="flex flex-wrap items-end gap-2">
          <Input name="q" label={t('lib.search')} value={q} onChange={(e) => setQ(e.target.value)} className="flex-1 min-w-40" />
          <Select name="category" label={t('lib.category')} placeholder={t('lib.all')} value={category} onChange={(e) => setCategory(e.target.value)} className="min-w-36"
            options={(list.data?.meta?.categories ?? []).map(c => ({ value: c, label: c }))} />
        </div>
        {list.isPending ? <Loader type="skeleton" rows={4} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : !list.data.data.length ? <EmptyState title={t('lib.no_books')} /> : (
          <ul className="flex flex-col divide-y divide-line" data-testid="book-list">
            {list.data.data.map(b => (
              <li key={b.id} className="py-2 flex flex-wrap items-center gap-2" data-testid="book">
                <span className="font-medium" dir="auto">{b.title}</span>
                {b.author && <span className="text-sm text-content-muted" dir="auto">· {b.author}</span>}
                {b.shelf_location && <span className="text-xs text-content-muted" dir="auto">· {b.shelf_location}</span>}
                <span className="ms-auto text-sm">{t('lib.copies', { available: b.available_copies, total: b.total_copies })}</span>
                {canManage && <Button variant="ghost" onClick={() => edit(b)} data-action="edit">{t('common.edit')}</Button>}
                {canManage && <Button variant="ghost" onClick={() => remove(b)} data-action="remove">{t('common.delete')}</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {canManage && <Card>
        <form className="flex flex-col gap-2" onSubmit={save} data-testid="book-form">
          <h2 className="font-semibold">{editing ? t('lib.edit_book') : t('lib.add_book')}</h2>
          {['title', 'author', 'isbn', 'category', 'shelf_location'].map(k => <Input key={k} name={k} label={t(`lib.f.${k}`)} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} error={errors[k]} required={k === 'title'} />)}
          <div className="grid grid-cols-2 gap-2">
            <Input name="total_copies" label={t('lib.f.total_copies')} inputMode="numeric" ltr value={f.total_copies} onChange={(e) => setF({ ...f, total_copies: e.target.value })} error={errors.total_copies} />
            <Input name="published_year" label={t('lib.f.published_year')} inputMode="numeric" ltr value={f.published_year} onChange={(e) => setF({ ...f, published_year: e.target.value })} error={errors.published_year} />
          </div>
          <div className="flex gap-2"><Button type="submit" data-action="save-book">{t('common.save')}</Button>{editing && <Button variant="ghost" onClick={() => { setEditing(null); setF(blank) }}>{t('common.cancel')}</Button>}</div>
        </form>
      </Card>}
    </div>
  )
}

function Issue() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const books = useQuery({ queryKey: ['library', 'issue-books', q], queryFn: () => api.get('/library/books', { params: { q: q || undefined } }).then(r => r.data.data) })
  const [book, setBook] = useState('')
  const [code, setCode] = useState('')
  const [errors, setErrors] = useState({})
  const [done, setDone] = useState(null)
  const issue = async (e) => {
    e.preventDefault(); setErrors({}); setDone(null)
    try { setDone((await api.post('/library/issue', { book_id: Number(book), student_code: code.trim() })).data.data); setCode(''); qc.invalidateQueries({ queryKey: ['library'] }) }
    catch (err) { setErrors(fieldErrors(err)) }
  }
  return (
    <Card className="flex flex-col gap-3">
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={issue} data-testid="issue-form">
        <Input name="book_search" label={t('lib.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <Select name="book_id" label={t('lib.book')} placeholder={t('lib.pick')} value={book} onChange={(e) => setBook(e.target.value)} error={errors.book_id}
          options={(books.data ?? []).filter(b => b.available_copies > 0).map(b => ({ value: String(b.id), label: `${b.title} (${b.available_copies})` }))} />
        <Input name="student_code" label={t('lib.student_code')} ltr value={code} onChange={(e) => setCode(e.target.value)} error={errors.student_code} required />
        <div className="flex items-end"><Button type="submit" disabled={!book || !code.trim()} data-action="issue">{t('lib.issue')}</Button></div>
      </form>
      {done && <p className="text-sm" data-testid="issued-note">{t('lib.issued_note', { title: done.book.title, name: done.student.name ?? '', due: done.due_date })}</p>}
    </Card>
  )
}

function Out({ kind, role }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['library', kind], queryFn: () => api.get(`/library/${kind}`).then(r => r.data.data) })
  const circulate = useStaffCan('staff.library.circulate')
  const [method, setMethod] = useState('cash')
  const run = async (fn) => { try { const r = await fn(); qc.invalidateQueries({ queryKey: ['library'] }); return r } catch { return null } }
  const back = (i) => run(() => api.post(`/library/return/${i.id}`)).then(r => r && useUiStore.getState().addToast(Number(r.data.data.fine_amount) > 0 ? t('lib.returned_fine', { fine: r.data.data.fine_amount }) : t('lib.returned')))
  const collect = (i) => useUiStore.getState().openConfirm({ title: t('lib.collect'), description: t('lib.collect_confirm', { fine: i.fine_amount }), confirmLabel: t('lib.collect'),
    onConfirm: () => run(() => api.post(`/library/issues/${i.id}/collect-fine`, { method })).then(r => r && useUiStore.getState().addToast(t('lib.receipt', { no: r.data.data.receipt_no }))) })
  const waive = (i) => { const reason = window.prompt(t('lib.waive_reason')); if (reason && reason.trim()) run(() => api.post(`/library/issues/${i.id}/waive`, { reason: reason.trim() })) }
  if (q.isPending) return <Loader type="skeleton" rows={4} />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  if (!q.data.length) return <EmptyState title={t(`lib.none_${kind}`)} />
  return (
    <Card className="flex flex-col gap-2">
      {kind === 'overdue' && ['admin', 'accountant'].includes(role) && <Select name="method" label={t('lib.method')} value={method} onChange={(e) => setMethod(e.target.value)} className="sm:w-48"
        options={['cash', 'bkash', 'nagad', 'bank', 'card', 'other'].map(m => ({ value: m, label: t(`lib.methods.${m}`) }))} />}
      <ul className="flex flex-col divide-y divide-line" data-testid={`${kind}-list`}>
        {q.data.map(i => (
          <li key={i.id} className="py-2 flex flex-wrap items-center gap-2" data-testid="issue-row" data-status={i.status}>
            <span className="font-medium" dir="auto">{i.book.title}</span>
            <span className="text-sm" dir="auto">· {i.student.name} <Ltr>{i.student.student_id}</Ltr></span>
            <span className="text-xs text-content-muted">{t('lib.due')} <Ltr>{i.due_date}</Ltr></span>
            <span className="rounded-full px-2 py-0.5 text-xs bg-surface-muted font-medium">{t(`lib.statuses.${i.status}`)}</span>
            {i.fine_so_far && Number(i.fine_so_far) > 0 && <span className="text-sm">{t('lib.so_far')}: <Ltr>{fmtMoney(i.fine_so_far, locale)}</Ltr></span>}
            {i.status === 'returned' && Number(i.fine_amount) > 0 && <span className="text-sm">{t('lib.fine')}: <Ltr>{fmtMoney(i.fine_amount, locale)}</Ltr></span>}
            <span className="ms-auto flex gap-2">
              {i.status !== 'returned' && role !== 'accountant' && circulate && <Button variant="secondary" onClick={() => back(i)} data-action="return">{t('lib.return')}</Button>}
              {i.status === 'returned' && !i.fine_paid && Number(i.fine_amount) > 0 && ['admin', 'accountant'].includes(role) && <Button onClick={() => collect(i)} data-action="collect">{t('lib.collect')}</Button>}
              {i.status === 'returned' && !i.fine_paid && Number(i.fine_amount) > 0 && role === 'admin' && <Button variant="ghost" onClick={() => waive(i)} data-action="waive">{t('lib.waive')}</Button>}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Settings() {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['library', 'settings'], queryFn: () => api.get('/library/settings').then(r => r.data.data) })
  const [f, setF] = useState(null)
  const [errors, setErrors] = useState({})
  if (q.isPending) return <Loader type="skeleton" rows={2} />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  const v = f ?? { loan_days: String(q.data.loan_days), fine_per_day: q.data.fine_per_day }
  const save = async (e) => {
    e.preventDefault(); setErrors({})
    try { await api.put('/library/settings', { loan_days: Number(v.loan_days), fine_per_day: v.fine_per_day }); useUiStore.getState().addToast(t('lib.saved')); q.refetch() } catch (err) { setErrors(fieldErrors(err)) }
  }
  return (
    <Card><form className="flex flex-wrap items-end gap-3" onSubmit={save} data-testid="library-settings">
      <Input name="loan_days" label={t('lib.loan_days')} inputMode="numeric" ltr value={v.loan_days} onChange={(e) => setF({ ...v, loan_days: e.target.value })} error={errors.loan_days} className="w-32" />
      <Input name="fine_per_day" label={t('lib.fine_per_day')} inputMode="decimal" ltr value={v.fine_per_day} onChange={(e) => setF({ ...v, fine_per_day: e.target.value })} error={errors.fine_per_day} className="w-32" />
      <Button type="submit" data-action="save-settings">{t('common.save')}</Button>
    </form></Card>
  )
}
