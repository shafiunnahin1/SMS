import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import { Input, Select } from '../../components/FormField'
import Button from '../../components/Button'
import { ErrorState } from '../../components/StateViews'

// D165 ST.1/ST.2/ST.5 /student/my-class: the own class (learners) or the program's class (institution), the SSC/HSC exam batch,
// and for an institution's student the move of their purchases to their own account
export default function LearnerProfile() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const profile = useQuery({ queryKey: ['learner-profile'], queryFn: () => api.get('/learner/profile').then(r => r.data.data) })
  const classes = useQuery({ queryKey: ['learner-class-levels'], queryFn: () => api.get('/public/learners/class-levels').then(r => r.data.data) })
  const save = async (patch) => {
    const next = { qb_class_level_id: profile.data.qb_class_level_id, qb_exam_batch_id: profile.data.qb_exam_batch_id, ...patch }
    try {
      await api.put('/learner/profile', { qb_class_level_id: next.qb_class_level_id ? Number(next.qb_class_level_id) : null, qb_exam_batch_id: next.qb_exam_batch_id ? Number(next.qb_exam_batch_id) : null })
      useUiStore.getState().addToast(t('common.saved'))
      qc.invalidateQueries({ queryKey: ['learner-profile'] })
    } catch (e) { useUiStore.getState().addToast(e.response?.data?.message ?? t('common.error'), 'error') }
  }
  const name = (c) => (i18n.language === 'en' ? c.name_en : c.name_bn)
  return (
    <div className="flex flex-col gap-4" data-testid="learner-profile">
      <PageHeader title={t('learner.my_class')} />
      <Card className="max-w-md">
        {profile.isPending || classes.isPending ? <Loader type="skeleton" rows={2} /> : profile.isError || classes.isError ? <ErrorState onRetry={() => { profile.refetch(); classes.refetch() }} /> : (
          <div className="flex flex-col gap-3">
            {profile.data.class_editable === false
              ? <p className="text-sm"><span className="text-content-muted">{t('learner.class')}: </span>{profile.data.class_level ? name(profile.data.class_level) : '—'}</p>
              : <Select label={t('learner.class')} placeholder={t('learner.class_pick')} name="qb_class_level_id" value={profile.data.qb_class_level_id ?? ''}
                  onChange={e => save({ qb_class_level_id: e.target.value, qb_exam_batch_id: null })} options={classes.data.map(c => ({ value: c.id, label: name(c) }))} />}
            {(profile.data.batches ?? []).length > 0 && (   // D165 ST.2: SSC / HSC - purchases last until this exam ends
              <Select label={t('learner.batch')} placeholder={t('learner.batch_none')} name="qb_exam_batch_id" value={profile.data.qb_exam_batch_id ?? ''}
                onChange={e => save({ qb_exam_batch_id: e.target.value || null })} options={profile.data.batches.map(b => ({ value: b.id, label: b.name }))} />)}
            <p className="text-xs text-content-muted">{t('learner.validity_hint')}</p>
          </div>
        )}
      </Card>
      {profile.data?.class_editable === false && <MoveToOwn />}
    </div>
  )
}

// D165 ST.5: an institution's student keeps what they bought by moving it to their own account (own mobile, a code)
function MoveToOwn() {
  const { t } = useTranslation()
  const [sent, setSent] = useState(null)
  const [done, setDone] = useState(null)
  const [v, setV] = useState({ phone: '', password: '', password_confirmation: '', code: '', accept_terms: false })
  const [busy, setBusy] = useState(false)
  const call = async (fn) => { setBusy(true); try { await fn() } catch (e) { useUiStore.getState().addToast(e.response?.data?.message ?? t('common.error'), 'error') } finally { setBusy(false) } }
  const start = () => call(async () => setSent((await api.post('/learner/move', { phone: v.phone, password: v.password || null, password_confirmation: v.password_confirmation || null, accept_terms: v.accept_terms })).data.data))
  const verify = () => call(async () => setDone((await api.post('/learner/move/verify', { code: v.code })).data.data))
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  return (
    <Card className="max-w-md flex flex-col gap-3" data-testid="learner-move">
      <h2 className="font-semibold">{t('learner.move_title')}</h2>
      <p className="text-xs text-content-muted">{t('learner.move_hint')}</p>
      {done ? <p className="text-sm" role="status" data-testid="learner-move-done">{t('learner.move_done', { n: done.moved, host: done.login_host })}</p>
        : sent ? <>
          <p className="text-sm">{t('learner.code_sent', { phone: sent.phone })}</p>
          <Input label={t('learner.code')} ltr inputMode="numeric" name="code" value={v.code} onChange={set('code')} />
          <div><Button onClick={verify} loading={busy} disabled={!v.code} data-action="move-verify">{t('learner.verify')}</Button></div>
        </> : <>
          <Input label={t('learner.phone')} ltr inputMode="tel" name="phone" placeholder="01XXXXXXXXX" value={v.phone} onChange={set('phone')} />
          <Input label={t('learner.move_password')} type="password" name="password" autoComplete="new-password" value={v.password} onChange={set('password')} />
          <Input label={t('learner.password_again')} type="password" name="password_confirmation" autoComplete="new-password" value={v.password_confirmation} onChange={set('password_confirmation')} />
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="accept_terms" checked={v.accept_terms} onChange={set('accept_terms')} /><span>{t('learner.accept')}</span></label>
          <div><Button onClick={start} loading={busy} disabled={!v.phone || !v.accept_terms} data-action="move-start">{t('learner.move_start')}</Button></div>
        </>}
    </Card>
  )
}
