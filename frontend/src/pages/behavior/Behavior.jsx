import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'
import { useStaffCan } from '../../features/staff/StaffDepartment'

const fieldErrors = (e) => Object.fromEntries(Object.entries(e.response?.data?.errors ?? {}).map(([k, m]) => [k, m[0]]))
const today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10)
export const TYPES = ['positive', 'negative', 'neutral']
const CATEGORIES = ['discipline', 'academic', 'social', 'achievement', 'other']
const TONE = { positive: 'bg-primary-soft text-primary-fg', negative: 'bg-surface-muted text-content', neutral: 'bg-surface-muted text-content-muted' }

/** one entry (shared with the parent page) */
export function EntryCard({ e, children }) {
  const { t } = useTranslation()
  return (
    <li className="py-2 flex flex-col gap-0.5" data-testid="behavior-entry" data-type={e.type}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE[e.type]}`}>{t(`bhv.types.${e.type}`)}</span>
        <span className="font-medium" dir="auto">{e.title}</span>
        <Ltr className="text-xs text-content-muted">{e.date}</Ltr>
        {e.category && <span className="text-xs text-content-muted">{t(`bhv.categories.${e.category}`)}</span>}
        {e.student?.name && <span className="text-xs" dir="auto">· {e.student.name}</span>}
        {e.parent_notified && e.type !== 'positive' && <span className="text-xs text-content-muted">· {t('bhv.parent_told')}</span>}
      </div>
      {e.description && <p className="text-sm" dir="auto">{e.description}</p>}
      {e.action_taken && <p className="text-sm text-content-muted" dir="auto">{t('bhv.action')}: {e.action_taken}</p>}
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </li>
  )
}

// D235 BHV.2 /admin/behavior, /teacher/behavior, /staff/behavior: recent entries, and one student (found by the ID card number) with
// the summary, the entries and a form; correct (the author teacher, the admin, staff with staff.behavior.manage) and "tell the
// parent" for a negative or neutral entry. Read-only staff get no form or buttons.
export default function Behavior() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const me = useAuthStore((s) => s.user)
  const canManage = useStaffCan('staff.behavior.manage')
  const [type, setType] = useState('')
  const [code, setCode] = useState('')
  const [student, setStudent] = useState(null)
  const [findError, setFindError] = useState(null)
  const recent = useQuery({ queryKey: ['behavior', 'recent', type], queryFn: () => api.get('/behavior', { params: { type: type || undefined } }).then(r => r.data.data) })
  const one = useQuery({ queryKey: ['behavior', 'student', student], enabled: !!student, queryFn: () => api.get(`/students/${student}/behavior`).then(r => r.data.data) })
  const blank = { type: 'positive', category: '', title: '', description: '', action_taken: '', date: today() }
  const [f, setF] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [errors, setErrors] = useState({})
  const refresh = () => qc.invalidateQueries({ queryKey: ['behavior'] })
  const find = async (e) => {
    e.preventDefault(); setFindError(null)
    try { setStudent((await api.get('/behavior/find', { params: { student_code: code.trim() } })).data.data.id); setEditing(null); setF(blank) }
    catch (err) { setFindError(err.response?.data?.errors?.student_code?.[0] ?? err.response?.data?.message ?? t('bhv.not_found')) }
  }
  const save = async (e) => {
    e.preventDefault(); setErrors({})
    const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v]))
    try {
      if (editing) await api.put(`/behavior/${editing}`, body); else await api.post(`/students/${student}/behavior`, body)
      setF(blank); setEditing(null); refresh(); useUiStore.getState().addToast(t('bhv.saved'))
    } catch (err) { setErrors(fieldErrors(err)) }
  }
  const tell = (e) => useUiStore.getState().openConfirm({ title: t('bhv.tell'), description: t('bhv.tell_hint', { title: e.title }), confirmLabel: t('bhv.tell'),
    onConfirm: async () => { try { await api.post(`/behavior/${e.id}/notify-parent`); refresh() } catch { /* shown by the interceptor */ } } })
  const mayEdit = (e) => canManage && (me?.role !== 'teacher' || e.reported_by?.id === me?.id)
  const edit = (e) => { setEditing(e.id); setF({ type: e.type, category: e.category ?? '', title: e.title, description: e.description ?? '', action_taken: e.action_taken ?? '', date: e.date }) }
  return (
    <div className="flex flex-col gap-4" data-testid="behavior">
      <PageHeader title={t('bhv.title')} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <form className="flex flex-wrap items-end gap-2" onSubmit={find} data-testid="find-form">
            <Input name="student_code" label={t('bhv.student_code')} ltr value={code} onChange={(e) => setCode(e.target.value)} error={findError} className="flex-1 min-w-40" required />
            <Button type="submit" data-action="find">{t('bhv.open')}</Button>
          </form>
          {!student ? <p className="text-sm text-content-muted">{t('bhv.find_hint')}</p> : one.isPending ? <Loader type="skeleton" rows={3} /> : one.isError ? <ErrorState onRetry={one.refetch} /> : <>
            <div className="flex flex-wrap items-baseline gap-2"><h2 className="font-semibold" dir="auto">{one.data.student.name}</h2><Ltr className="text-sm text-content-muted">{one.data.student.student_id}</Ltr></div>
            <p className="text-sm" data-testid="behavior-summary">{t('bhv.summary', one.data.summary)}</p>
            {!one.data.entries.length ? <p className="text-sm text-content-muted">{t('bhv.none_student')}</p> : (
              <ul className="flex flex-col divide-y divide-line">{one.data.entries.map(e => (
                <EntryCard key={e.id} e={e}>
                  {mayEdit(e) && <Button variant="ghost" onClick={() => edit(e)} data-action="edit">{t('bhv.correct')}</Button>}
                  {canManage && e.type !== 'positive' && !e.parent_notified && <Button variant="secondary" onClick={() => tell(e)} data-action="tell">{t('bhv.tell')}</Button>}
                </EntryCard>
              ))}</ul>
            )}
            {canManage && <form className="flex flex-col gap-2 border-t border-line pt-3" onSubmit={save} data-testid="behavior-form">
              <h3 className="font-semibold">{editing ? t('bhv.correct') : t('bhv.new')}</h3>
              <div className="grid grid-cols-2 gap-2">
                <Select name="type" label={t('bhv.type')} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} error={errors.type} options={TYPES.map(x => ({ value: x, label: t(`bhv.types.${x}`) }))} />
                <Select name="category" label={t('bhv.category')} placeholder={t('bhv.none')} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} error={errors.category} options={CATEGORIES.map(x => ({ value: x, label: t(`bhv.categories.${x}`) }))} />
              </div>
              <Input name="title" label={t('bhv.f_title')} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} error={errors.title} required />
              <Textarea name="description" label={t('bhv.description')} rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} error={errors.description} />
              <Textarea name="action_taken" label={t('bhv.action')} rows={2} value={f.action_taken} onChange={(e) => setF({ ...f, action_taken: e.target.value })} error={errors.action_taken} />
              <Input name="date" type="date" label={t('bhv.date')} ltr max={today()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} error={errors.date} className="w-44" />
              <p className="text-xs text-content-muted">{t('bhv.visibility_hint')}</p>
              <div className="flex gap-2"><Button type="submit" data-action="save-behavior">{t('common.save')}</Button>{editing && <Button variant="ghost" onClick={() => { setEditing(null); setF(blank) }}>{t('common.cancel')}</Button>}</div>
            </form>}
          </>}
        </Card>
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2"><h2 className="font-semibold me-auto">{t('bhv.recent')}</h2>
            <Select name="type_filter" label={t('bhv.type')} placeholder={t('bhv.all')} value={type} onChange={(e) => setType(e.target.value)} className="w-40" options={TYPES.map(x => ({ value: x, label: t(`bhv.types.${x}`) }))} /></div>
          {recent.isPending ? <Loader type="skeleton" rows={3} /> : recent.isError ? <ErrorState onRetry={recent.refetch} /> : !recent.data.length ? <EmptyState title={t('bhv.none')} /> : (
            <ul className="flex flex-col divide-y divide-line" data-testid="behavior-recent">{recent.data.map(e => <EntryCard key={e.id} e={e} />)}</ul>
          )}
        </Card>
      </div>
    </div>
  )
}
