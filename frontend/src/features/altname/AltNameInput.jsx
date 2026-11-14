import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import { Input } from '../../components/FormField'

// D214 MAD.3 (docs/modules/madrasa.md section 3): the second-language name. On when the institution chose a language for it
// (settings.alt_name_locale = ar | en); Arabic is typed in its own direction (rtl).
export function useAltName() {
  const admin = useAuthStore(s => s.user?.role) === 'admin'   // the setting is read from the admin's general settings (it is not in /bootstrap)
  const q = useQuery({ queryKey: ['settings', 'general'], enabled: admin, staleTime: 5 * 60 * 1000, retry: false, queryFn: () => api.get('/admin/settings/general').then(r => r.data.data) })
  const locale = q.data?.alt_name_locale ?? null
  return { on: locale === 'ar' || locale === 'en', locale }
}

/** the extra field for a react-hook-form form; renders nothing while the feature is off */
export default function AltNameInput({ register, error }) {
  const { t } = useTranslation()
  const { on, locale } = useAltName()
  if (!on) return null
  return <Input label={t('altname.label', { language: t(`altname.languages.${locale}`) })} error={error} dir={locale === 'ar' ? 'rtl' : 'ltr'} maxLength={150} {...register('name_alt')} />
}
