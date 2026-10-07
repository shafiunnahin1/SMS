import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../../api/axios'
import { ensureCsrf } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import Button from '../../components/Button'
import { Input } from '../../components/FormField'
import AuthFrame from './AuthFrame'

// POST /auth/reset-password { login, token, password, password_confirmation }: from the email link (?token&login) or with the SMS code.
// The password policy is the server's (PolicyPassword); its messages are shown under the field.
export default function ResetPassword() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const linkToken = params.get('token')
  const [formError, setFormError] = useState(null)
  const { register, handleSubmit, setError, formState: { isSubmitting, errors } } = useForm({ defaultValues: { login: params.get('login') ?? '', token: linkToken ?? '' } })
  const onSubmit = async (values) => {
    setFormError(null)
    try {
      await ensureCsrf()
      await api.post('/auth/reset-password', values)
      useUiStore.getState().addToast(t('auth.reset_done'))
      navigate('/login', { replace: true })
    } catch (e) {
      const errs = e.response?.data?.errors
      if (errs) Object.entries(errs).forEach(([f, m]) => setError(f, { message: m[0] }))
      else setFormError(e.response?.data?.message ?? t('auth.failed'))
    }
  }
  return (
    <AuthFrame title={t('auth.reset_title')}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <Input label={t('auth.login')} ltr autoComplete="username" error={errors.login?.message} {...register('login', { required: t('auth.required') })} />
        {!linkToken && <Input label={t('auth.code')} ltr inputMode="numeric" autoComplete="one-time-code" error={errors.token?.message} {...register('token', { required: t('auth.required') })} />}
        <Input label={t('auth.new_password')} type="password" ltr autoComplete="new-password" error={errors.password?.message} {...register('password', { required: t('auth.required') })} />
        <Input label={t('auth.confirm_password')} type="password" ltr autoComplete="new-password" {...register('password_confirmation', { required: t('auth.required') })} />
        {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
        <Button type="submit" loading={isSubmitting} className="w-full">{t('auth.reset_submit')}</Button>
        <Link to="/login" className="text-sm text-primary-fg text-center">{t('auth.back_to_login')}</Link>
      </form>
    </AuthFrame>
  )
}
