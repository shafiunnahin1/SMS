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
import { Input, Textarea } from '../../components/FormField'
import { useStaffCan } from '../../features/staff/StaffDepartment'
import Tabs from '../../ui/variants/Tabs'

const fieldErrors = (e) => Object.fromEntries(Object.entries(e.response?.data?.errors ?? {}).map(([k, m]) => [k, m[0]]))
const FIELDS = ['name', 'graduation_year', 'last_class', 'current_institution', 'current_profession', 'phone', 'email', 'address', 'achievements']

// D243 ALM.2 /admin/alumni and /staff/alumni: the list (search, year), add from ended enrollments (many at once) or by hand, edit,
// verify, delete on request, counts per year; the admin's public-directory switch. Read-only staff see, change nothing.
export default function Alumni() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const isAdmin = useAuthStore((s) => s.user?.role) === 'admin'
  const canManage = useStaffCan('staff.alumni.manage')
  const [tab, setTab] = useState('list')
  const [q, setQ] = useState('')
  const [year, setYear] = useState('')
  const [picked, setPicked] = useState([])
  const list = useQuery({ queryKey: ['alumni', q, year], enabled: tab === 'list', queryFn: () => api.get('/alumni', { params: { q: q.trim() || undefined, year: year || undefined } }).then(r => r.data.data) })
  const cands = useQuery({ queryKey: ['alumni', 'candidates'], enabled: tab === 'add' && canManage, queryFn: () => api.get('/alumni/candidates').then(r => r.data.data) })
  const stats = useQuery({ queryKey: ['alumni', 'stats'], enabled: tab === 'stats', queryFn: () => api.get('/alumni/stats').then(r => r.data.data) })
  const settings = useQuery({ queryKey: ['alumni', 'settings'], enabled: isAdmin && tab === 'stats', queryFn: () => api.get('/alumni/settings').then(r => r.data.data) })
  const blank = Object.fromEntries(FIELDS.map(k => [k, '']))
  const [f, setF] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [errors, setErrors] = useState({})
  const refresh = () => qc.invalidateQueries({ queryKey: ['alumni'] })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const toast = (m) => useUiStore.getState().addToast(m)

  const save = async (e) => {
    e.preventDefault(); setErrors({})
    const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v === '' ? null : v]))
    try {
      if (editing) await api.put(`/alumni/${editing}`, body); else await api.post('/alumni', body)
      setF(blank); setEditing(null); refresh(); toast(t('alm.saved'))
    } catch (err) { setErrors(fieldErrors(err)) }
  }
  const addPicked = async () => {
    try { await api.post('/alumni/from-students', { student_ids: picked }); setPicked([]); refresh(); toast(t('alm.added', { n: picked.length })) } catch { /* interceptor */ }
  }
  const verify = async (a) => { try { await api.patch(`/alumni/${a.id}/verify`, { verified: !a.is_verified }); refresh() } catch { /* interceptor */ } }
  const remove = (a) => useUiStore.getState().openConfirm({ title: t('alm.delete'), description: t('alm.delete_hint', { name: a.name }), confirmLabel: t('alm.delete'), type: 'danger',
    onConfirm: async () => { try { await api.delete(`/alumni/${a.id}`); refresh() } catch { /* interceptor */ } } })
  const edit = (a) => { setEditing(a.id); setF(Object.fromEntries(FIELDS.map(k => [k, a[k] ?? '']))); setErrors({}); setTab('add') }
  const directory = async (on) => { try { await api.put('/alumni/settings', { directory: on }); refresh() } catch { /* interceptor */ } }
  const toggle = (id) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]))

  const tabs = ['list', ...(canManage ? ['add'] : []), 'stats']
  return (
    <div className="flex flex-col gap-4" data-testid="alumni">
      <PageHeader title={t('alm.title')} />
      <Tabs items={tabs.map(k => ({ key: k, label: t(`alm.tabs.${k}`) }))} value={tab} onChange={setTab} label={t('alm.title')} />
      {tab === 'list' && <Card className="flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <Input name="q" label={t('alm.search')} value={q} onChange={(e) => setQ(e.target.value)} />
          <Input name="year" type="number" ltr label={t('alm.year')} value={year} onChange={(e) => setYear(e.target.value)} />
        </div>
        {list.isPending ? <Loader type="skeleton" rows={3} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : !list.data.length ? <EmptyState title={t('alm.none')} /> : (
          <ul className="flex flex-col divide-y divide-line" data-testid="alumni-list">{list.data.map(a => (
            <li key={a.id} className="py-2 flex flex-col gap-1" data-testid="alumnus">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium" dir="auto">{a.name}</span><Ltr className="text-sm text-content-muted">{a.graduation_year}</Ltr>
                {a.last_class && <span className="text-xs text-content-muted" dir="auto">{a.last_class}</span>}
                <span className={`rounded-full px-2 py-0.5 text-xs ${a.is_verified ? 'bg-primary-soft text-primary-fg' : 'bg-surface-muted text-content-muted'}`}>{t(a.is_verified ? 'alm.verified' : 'alm.unverified')}</span>
              </div>
              {(a.current_profession || a.current_institution) && <p className="text-sm" dir="auto">{[a.current_profession, a.current_institution].filter(Boolean).join(' · ')}</p>}
              {(a.phone || a.email) && <p className="text-xs text-content-muted">{a.phone && <Ltr>{a.phone}</Ltr>}{a.phone && a.email && ' · '}{a.email && <Ltr>{a.email}</Ltr>}</p>}
              {canManage && <div className="flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => edit(a)} data-action="edit">{t('alm.edit')}</Button>
                <Button variant="ghost" onClick={() => verify(a)} data-action="verify">{t(a.is_verified ? 'alm.unverify' : 'alm.verify')}</Button>
                <Button variant="ghost" onClick={() => remove(a)} data-action="delete">{t('alm.delete')}</Button>
              </div>}
            </li>
          ))}</ul>
        )}
      </Card>}
      {tab === 'add' && canManage && <div className="grid gap-4 lg:grid-cols-2">
        {!editing && <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">{t('alm.from_students')}</h2>
          <p className="text-xs text-content-muted">{t('alm.from_hint')}</p>
          {cands.isPending ? <Loader type="skeleton" rows={3} /> : cands.isError ? <ErrorState onRetry={cands.refetch} /> : !cands.data.length ? <EmptyState title={t('alm.no_candidates')} /> : <>
            <ul className="flex flex-col divide-y divide-line text-sm" data-testid="candidates">{cands.data.map(c => (
              <li key={c.id} className="py-1"><label className="flex flex-wrap items-center gap-2">
                <input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} data-candidate={c.id} />
                <span dir="auto">{c.name}</span><Ltr className="text-content-muted">{c.student_id}</Ltr>
                <span className="text-xs text-content-muted" dir="auto">{c.last_class} · <Ltr>{c.graduation_year}</Ltr> · {t(`alm.ended.${c.status}`)}</span>
              </label></li>
            ))}</ul>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setPicked(cands.data.map(c => c.id))}>{t('alm.pick_all')}</Button>
              <Button onClick={addPicked} disabled={!picked.length} data-action="add-picked">{t('alm.add_picked', { n: picked.length })}</Button>
            </div>
          </>}
        </Card>}
        <Card>
          <form className="flex flex-col gap-2" onSubmit={save} data-testid="alumnus-form">
            <h2 className="font-semibold">{editing ? t('alm.edit') : t('alm.by_hand')}</h2>
            <div className="grid grid-cols-2 gap-2">
              <Input name="name" label={t('alm.f.name')} value={f.name} onChange={set('name')} error={errors.name} required />
              <Input name="graduation_year" type="number" ltr label={t('alm.f.graduation_year')} value={f.graduation_year} onChange={set('graduation_year')} error={errors.graduation_year} required />
              <Input name="last_class" label={t('alm.f.last_class')} value={f.last_class} onChange={set('last_class')} error={errors.last_class} />
              <Input name="current_profession" label={t('alm.f.current_profession')} value={f.current_profession} onChange={set('current_profession')} error={errors.current_profession} />
              <Input name="current_institution" label={t('alm.f.current_institution')} value={f.current_institution} onChange={set('current_institution')} error={errors.current_institution} />
              <Input name="phone" ltr label={t('alm.f.phone')} value={f.phone} onChange={set('phone')} error={errors.phone} />
              <Input name="email" type="email" ltr label={t('alm.f.email')} value={f.email} onChange={set('email')} error={errors.email} />
            </div>
            <Textarea name="address" label={t('alm.f.address')} rows={2} value={f.address} onChange={set('address')} error={errors.address} />
            <Textarea name="achievements" label={t('alm.f.achievements')} rows={2} value={f.achievements} onChange={set('achievements')} error={errors.achievements} />
            <p className="text-xs text-content-muted">{t('alm.privacy_hint')}</p>
            <div className="flex gap-2"><Button type="submit" data-action="save-alumnus">{t('common.save')}</Button>
              {editing && <Button variant="ghost" onClick={() => { setEditing(null); setF(blank); setTab('list') }}>{t('common.cancel')}</Button>}</div>
          </form>
        </Card>
      </div>}
      {tab === 'stats' && <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col gap-2">
          {stats.isPending ? <Loader type="skeleton" rows={3} /> : stats.isError ? <ErrorState onRetry={stats.refetch} /> : <>
            <p className="font-semibold" data-testid="alumni-total">{t('alm.total', { n: stats.data.total })}</p>
            <ul className="text-sm" data-testid="alumni-years">{stats.data.years.map(y => <li key={y.year} className="flex justify-between"><Ltr>{y.year}</Ltr><span>{t('alm.year_counts', { total: y.total, verified: y.verified })}</span></li>)}</ul>
          </>}
        </Card>
        {isAdmin && <Card className="flex flex-col gap-2" data-testid="directory-switch">
          <h2 className="font-semibold">{t('alm.directory')}</h2>
          <p className="text-xs text-content-muted">{t('alm.directory_hint')}</p>
          {settings.isPending ? <Loader type="skeleton" rows={1} /> : settings.isError ? <ErrorState onRetry={settings.refetch} /> : (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="directory" checked={settings.data.directory} onChange={(e) => directory(e.target.checked)} />{t('alm.directory_on')}</label>
          )}
        </Card>}
      </div>}
    </div>
  )
}
