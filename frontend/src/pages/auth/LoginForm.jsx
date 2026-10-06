import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import { ROLE_HOME } from '../../router/roleHome'
import Button from '../../components/Button'
import { Input } from '../../components/FormField'

// The one login form inside every login template (docs/THEMING.md "Login Templates"). Identifier = email, phone or ID (AUTHORIZATION.md).
export default function LoginForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [error, setError] = useState(null)
  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm({ defaultValues: { login: '', password: '' } })

  const onSubmit = async (values) => {
    setError(null)
    try {
      const { data } = await api.post('/auth/login', values)
      const d = data.data ?? data
      if (d.two_factor_required) { setError(t('auth.otp')); return }
      useAuthStore.getState().setAuth(d.token, d.user)
      if (d.must_change_password) setError(t('auth.must_change'))
      navigate(ROLE_HOME[d.user.role] ?? '/login', { replace: true })
    } catch (e) {
      setError(e.response?.data?.message ?? t('auth.failed'))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <Input label={t('auth.login')} autoComplete="username" ltr error={errors.login && t('auth.failed')} {...register('login', { required: true })} />
      <Input label={t('auth.password')} type="password" autoComplete="current-password" ltr error={errors.password && t('auth.failed')} {...register('password', { required: true })} />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <Button type="submit" loading={isSubmitting} className="w-full">{t('auth.submit')}</Button>
    </form>
  )
}
