import { useTranslation } from 'react-i18next'
import { TriangleAlert } from 'lucide-react'

// Layout Contract: the subscription banner. /bootstrap does not carry the expiry date yet (subscriptions are Phase 5, whose 5.1/5.2
// are blocked by D47), so R1 shows the banner for a suspended institution only (DECISIONS 2026-10-07 3.3).
export default function PlanBanner({ institution }) {
  const { t } = useTranslation()
  if (!institution || institution.status === 'active') return null
  return (
    <div role="alert" className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-100 text-amber-900 print:hidden">
      <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />{t('plan.suspended')}
    </div>
  )
}
