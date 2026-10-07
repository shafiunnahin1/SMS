import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import { ROLE_HOME } from '../../router/roleHome'
import Button from '../../components/Button'
import { Input } from '../../components/FormField'
import AuthFrame from './AuthFrame'

// PATCH /auth/change-password { current_password, password, password_confirmation }. Required on the first login (must_change_password);
// the session in use stays, the user's other sessions end (AUTHORIZATION.md).
export default function ChangePassword() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { register, handleSubmit, setError, formState: { isSubmitting, errors } } = useForm()
  const onSubmit = async (values) => {
    try {
      await api.patch('/auth/change-password', values)
      useAuthStore.getState().updateUser({ must_change_password: false })
      useUiStore.getState().addToast(t('auth.changed'))
      navigate(ROLE_HOME[user?.role] ?? '/', { replace: true })
    } catch (e) {
      Object.entries(e.response?.data?.errors ?? {}).forEach(([f, m]) => setError(f, { message: m[0] }))
    }
  }
  return (
    <AuthFrame title={t('auth.change_title')}>
      {user?.must_change_password && <p className="text-sm text-content-muted">{t('auth.must_change')}</p>}
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
        <Input label={t('auth.current_password')} type="password" ltr autoComplete="current-password" error={errors.current_password?.message} {...register('current_password', { required: t('auth.required') })} />
        <Input label={t('auth.new_password')} type="password" ltr autoComplete="new-password" error={errors.password?.message} {...register('password', { required: t('auth.required') })} />
        <Input label={t('auth.confirm_password')} type="password" ltr autoComplete="new-password" {...register('password_confirmation', { required: t('auth.required') })} />
        <Button type="submit" loading={isSubmitting} className="w-full">{t('auth.change_submit')}</Button>
      </form>
    </AuthFrame>
  )
}
