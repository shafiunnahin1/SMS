import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { ensureCsrf, useAuthStore } from '../../store/authStore'
import { ROLE_HOME } from '../../router/roleHome'
import Button from '../../components/Button'
import { Input } from '../../components/FormField'

// The one login form inside every login template (THEMING.md "Login Templates"). Identifier = email, phone or ID (AUTHORIZATION.md).
// D51: the CSRF cookie first, then the login sets an HttpOnly session (no token in the response). A second factor (always for the
// Super Admin) shows the code step; a forced password change goes to /change-password.
export default function LoginForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [error, setError] = useState(null)
  const [challenge, setChallenge] = useState(null)
  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm({ defaultValues: { login: '', password: '', otp: '' } })

  const done = (d) => {
    useAuthStore.getState().setAuth(d.token ?? null, d.user)
    const back = location.state?.from?.pathname
    navigate(d.must_change_password ? '/change-password' : (back && back !== '/login' ? back : ROLE_HOME[d.user.role] ?? '/login'), { replace: true })
  }
  const onSubmit = async (values) => {
    setError(null)
    try {
      await ensureCsrf()
      if (challenge) {
        const { data } = await api.post('/auth/verify-otp', { challenge, otp: values.otp })
        return done(data.data ?? data)
      }
      const { data } = await api.post('/auth/login', { login: values.login, password: values.password })
      const d = data.data ?? data
      if (d.two_factor_required) { setChallenge(d.challenge); return undefined }
      return done(d)
    } catch (e) {
      setError(e.response?.data?.message ?? t('auth.failed'))
      return undefined
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      {!challenge ? (
        <>
          <Input label={t('auth.login')} autoComplete="username" ltr error={errors.login && t('auth.required')} {...register('login', { required: true })} />
          <Input label={t('auth.password')} type="password" autoComplete="current-password" ltr error={errors.password && t('auth.required')} {...register('password', { required: true })} />
        </>
      ) : (
        <Input label={t('auth.otp_label')} hint={t('auth.otp_hint')} inputMode="numeric" autoComplete="one-time-code" ltr autoFocus
          error={errors.otp && t('auth.required')} {...register('otp', { required: true, pattern: /^\d{4,8}$/ })} />
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <Button type="submit" loading={isSubmitting} className="w-full">{challenge ? t('auth.verify') : t('auth.submit')}</Button>
      {!challenge && <Link to="/forgot-password" className="text-sm text-primary-fg text-center">{t('auth.forgot')}</Link>}
    </form>
  )
}
