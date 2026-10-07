import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import api from '../../api/axios'
import { ensureCsrf } from '../../store/authStore'
import Button from '../../components/Button'
import { Input } from '../../components/FormField'
import AuthFrame from './AuthFrame'

// POST /auth/forgot-password { login }: an email gets a link, a phone gets a code (AUTHORIZATION.md). The answer is the same whether or
// not the account exists, so this page never says which.
export default function ForgotPassword() {
  const { t } = useTranslation()
  const [sentTo, setSentTo] = useState(null)
  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm()
  const onSubmit = async ({ login }) => {
    try { await ensureCsrf(); await api.post('/auth/forgot-password', { login }); setSentTo(login) } catch { /* toast */ }
  }
  return (
    <AuthFrame title={t('auth.forgot_title')}>
      {sentTo ? (
        <div className="flex flex-col gap-3 text-sm" role="status">
          <p>{t('auth.forgot_sent')}</p>
          <Link to={`/reset-password?login=${encodeURIComponent(sentTo)}`} className="text-primary-fg">{t('auth.have_code')}</Link>
          <Link to="/login" className="text-primary-fg">{t('auth.back_to_login')}</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <Input label={t('auth.login')} ltr autoComplete="username" error={errors.login && t('auth.required')} {...register('login', { required: true })} />
          <Button type="submit" loading={isSubmitting} className="w-full">{t('auth.send_reset')}</Button>
          <Link to="/login" className="text-sm text-primary-fg text-center">{t('auth.back_to_login')}</Link>
        </form>
      )}
    </AuthFrame>
  )
}
