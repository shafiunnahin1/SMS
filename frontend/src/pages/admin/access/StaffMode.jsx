import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../../../api/axios'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import Loader from '../../../components/Loader'
import StatusBadge from '../../../components/StatusBadge'
import { EmptyState, ErrorState } from '../../../components/StateViews'
import { Input } from '../../../components/FormField'
import { useUiStore } from '../../../store/uiStore'

// D207 MODE.1 /admin/staff-mode: the D101 switch. Every teacher, accountant and staff account is listed with its linked
// profiles, any problem and its review; once every account is reviewed and nothing is unresolved, the department mode can be
// switched on. Switching back warns first: those accounts are signed out (D101).
export default function StaffMode() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = (m) => useUiStore.getState().addToast(m)
  const q = useQuery({ queryKey: ['staff-mode'], queryFn: () => api.get('/admin/staff-mode').then(r => r.data.data) })
  const reload = () => qc.invalidateQueries({ queryKey: ['staff-mode'] })
  const switchTo = async (mode) => {
    if (mode === 'legacy' && !window.confirm(t('staff_mode.back_confirm'))) return
    try { await api.put('/admin/staff-mode', { mode }); toast(t('common.saved')); reload() } catch { /* the interceptor shows it */ }
  }
  if (q.isPending) return <Loader type="page" />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  const d = q.data
  const ready = d.summary.reviewed === d.summary.users && d.summary.unresolved_identity_collisions === 0
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('staff_mode.title')} />
      <Card className="flex flex-col gap-2" data-testid="staff-mode-state">
        <p className="flex flex-wrap items-center gap-2"><span>{t('staff_mode.now')}</span><strong>{t(`staff_mode.modes.${d.mode}`)}</strong></p>
        <p className="text-sm text-content-muted">{t(`staff_mode.explain.${d.mode}`)}</p>
        <p className="text-sm">{t('staff_mode.progress', { reviewed: d.summary.reviewed, users: d.summary.users })}
          {d.summary.unresolved_identity_collisions > 0 && <> · {t('staff_mode.problems', { n: d.summary.unresolved_identity_collisions })}</>}</p>
        <div className="flex flex-wrap gap-2">
          {d.mode === 'legacy'
            ? <Button disabled={!ready} onClick={() => switchTo('department')}>{t('staff_mode.switch_on')}</Button>
            : <Button variant="secondary" onClick={() => switchTo('legacy')}>{t('staff_mode.switch_back')}</Button>}
        </div>
        {d.mode === 'legacy' && !ready && <p className="text-xs text-content-muted">{t('staff_mode.not_ready')}</p>}
      </Card>
      {!d.users.length ? <EmptyState title={t('staff_mode.no_users')} /> : d.users.map(u => <Account key={u.user_id} u={u} onDone={reload} />)}
    </div>
  )
}

function Account({ u, onDone }) {
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const teacher = u.teachers.length === 1 ? u.teachers[0].id : null
  const staff = u.staff_members.length === 1 ? u.staff_members[0].id : null
  const review = async () => {
    setBusy(true)
    try {
      await api.post('/admin/staff-mode/reviews', { user_id: u.user_id, teacher_id: teacher, staff_member_id: staff, decision: 'keep', note: note || null })
      useUiStore.getState().addToast(t('common.saved')); setNote(''); onDone()
    } catch { /* the interceptor shows it */ } finally { setBusy(false) }
  }
  return (
    <Card className="flex flex-col gap-2" data-testid="staff-mode-account">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span><span className="font-medium" dir="auto">{u.name ?? `#${u.user_id}`}</span> · <span className="text-sm">{t(`staff_mode.roles.${u.role}`, u.role)}</span></span>
        {u.review ? <StatusBadge status="completed" /> : <span className="text-sm text-content-muted">{t('staff_mode.not_reviewed')}</span>}
      </div>
      <p className="text-sm text-content-muted">
        {t('staff_mode.profiles', { teachers: u.teachers.length, staff: u.staff_members.length })}
        {u.issues.length > 0 && <> · <span className="text-red-600">{u.issues.map(i => t(`staff_mode.issues.${i}`, i)).join(', ')}</span></>}
      </p>
      {!u.review && (
        <div className="flex flex-wrap items-end gap-2">
          <Input className="grow" label={t('staff_mode.note')} value={note} onChange={e => setNote(e.target.value)} maxLength={255} />
          <Button loading={busy} disabled={u.issues.length > 0} onClick={review}>{t('staff_mode.confirm')}</Button>
        </div>
      )}
    </Card>
  )
}
