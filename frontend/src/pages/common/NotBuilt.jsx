import { useTranslation } from 'react-i18next'
import { Construction } from 'lucide-react'
import Card from '../../components/Card'

// A menu item whose page is a later step: never a 404 (Step 4.7 Done When) - it says the screen is not part of the spike yet
export default function NotBuilt() {
  const { t } = useTranslation()
  return (
    <Card className="flex flex-col items-center gap-2 py-10 text-center text-content-muted">
      <Construction aria-hidden="true" className="h-10 w-10" />
      <p>{t('common.not_built')}</p>
    </Card>
  )
}
