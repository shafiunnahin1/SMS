import { useTranslation } from 'react-i18next'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import { useAuthStore } from '../../store/authStore'

// Placeholder dashboard for every role in the walking skeleton; the real dashboards are Step 4.7
export default function Dashboard() {
  const { t } = useTranslation()
  const user = useAuthStore(s => s.user)
  return (
    <div>
      <PageHeader title={t('dashboard.title')} />
      <Card><p dir="auto">{t('dashboard.hello', { name: user?.name })}</p><p className="text-sm text-content-muted mt-2">{t('dashboard.spike_note')}</p></Card>
    </div>
  )
}
