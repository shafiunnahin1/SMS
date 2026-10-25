import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import api from '../../api/axios'
import { ensureCsrf } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import Button from '../../components/Button'
import { Input, Select } from '../../components/FormField'
import AuthFrame from '../auth/AuthFrame'

// D165 (1) ST.1 /learner-signup (central host): a student registers with a name, their own mobile and a password (no guardian, no
// age), picks a class, gets a code on that mobile and enters it; then logs in on the learners host (login_host from the server)
export default function LearnerSignup() {
  const { t, i18n } = useTranslation()
  const [pending, setPending] = useState(null)        // { id, phone }
  const [done, setDone] = useState(null)              // { login_host, login }
  const classes = useQuery({ queryKey: ['learner-class-levels'], queryFn: () => api.get('/public/learners/class-levels').then(r => r.data.data) })
  const { register, handleSubmit, setError, watch, formState: { errors, isSubmitting } } = useForm()
  const code = useForm()
  const toast = (m) => useUiStore.getState().addToast(m, 'error')
  const fieldErrors = (e, set) => {
    const errs = e.response?.data?.errors
    if (errs) Object.entries(errs).forEach(([k, m]) => set(k, { message: m[0] }))
    else toast(e.response?.data?.message ?? t('common.error'))
  }

  const submit = async (v) => {
    try {
      await ensureCsrf()
      const { data } = await api.post('/public/learners', { ...v, qb_class_level_id: v.qb_class_level_id ? Number(v.qb_class_level_id) : null, accept_terms: Boolean(v.accept_terms) })
      setPending(data.data)
    } catch (e) { fieldErrors(e, setError) }
  }
  const verify = async (v) => {
    try { setDone((await api.post(`/public/learners/${pending.id}/verify`, { code: v.code })).data.data) } catch (e) { fieldErrors(e, code.setError) }
  }
  const resend = async () => {
    try { await api.post(`/public/learners/${pending.id}/resend`); useUiStore.getState().addToast(t('learner.code_resent')) } catch (e) { fieldErrors(e, code.setError) }
  }
  const loginUrl = done ? `${window.location.protocol}//${done.login_host}${window.location.port ? `:${window.location.port}` : ''}/login` : null
  const name = (c) => (i18n.language === 'en' ? c.name_en : c.name_bn)

  return (
    <AuthFrame title={t('learner.signup_title')}>
      {done ? (
        <div className="flex flex-col gap-3 text-sm" role="status" data-testid="learner-done">
          <p>{t('learner.done')}</p>
          <a href={loginUrl} className="text-primary-fg" data-action="go-login">{t('learner.go_login')}</a>
        </div>
      ) : pending ? (
        <form onSubmit={code.handleSubmit(verify)} className="flex flex-col gap-4" noValidate data-testid="learner-verify">
          <p className="text-sm">{t('learner.code_sent', { phone: pending.phone })}</p>
          <Input label={t('learner.code')} ltr inputMode="numeric" autoComplete="one-time-code" error={code.formState.errors.code?.message}
            {...code.register('code', { required: t('auth.required') })} />
          <Button type="submit" loading={code.formState.isSubmitting} className="w-full">{t('learner.verify')}</Button>
          <Button type="button" variant="ghost" onClick={resend} data-action="resend">{t('learner.resend')}</Button>
        </form>
      ) : (
        <form onSubmit={handleSubmit(submit)} className="flex flex-col gap-4" noValidate data-testid="learner-signup">
          <Input label={t('learner.name')} autoComplete="name" error={errors.name?.message} {...register('name', { required: t('auth.required') })} />
          <Input label={t('learner.phone')} ltr inputMode="tel" autoComplete="tel" placeholder="01XXXXXXXXX" error={errors.phone?.message} {...register('phone', { required: t('auth.required') })} />
          <Select label={t('learner.class')} placeholder={t('learner.class_pick')} error={errors.qb_class_level_id?.message}
            options={(classes.data ?? []).map(c => ({ value: c.id, label: name(c) }))} {...register('qb_class_level_id')} />
          <Input label={t('learner.password')} type="password" autoComplete="new-password" error={errors.password?.message} {...register('password', { required: t('auth.required') })} />
          <Input label={t('learner.password_again')} type="password" autoComplete="new-password" error={errors.password_confirmation?.message}
            {...register('password_confirmation', { required: t('auth.required'), validate: v => v === watch('password') || t('learner.password_mismatch') })} />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" {...register('accept_terms', { required: t('learner.accept_required') })} />
            <span>{t('learner.accept')}</span>
          </label>
          {errors.accept_terms && <p className="text-xs text-red-600">{errors.accept_terms.message}</p>}
          <Button type="submit" loading={isSubmitting} className="w-full">{t('learner.register')}</Button>
          <Link to="/login" className="text-sm text-primary-fg text-center">{t('auth.back_to_login')}</Link>
        </form>
      )}
    </AuthFrame>
  )
}
