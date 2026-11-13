import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import api from '../../api/axios'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate } from '../../i18n/format'
import Card from '../../components/Card'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import StatusBadge from '../../components/StatusBadge'
import { ErrorState } from '../../components/StateViews'
import { PublicLayout } from './PublicSite'

// D210 CERT.1 /verify/:code (the QR on a certificate or TC): valid / revoked / not found, the kind, number, date and a masked name -
// nothing else (docs/modules/quick-wins.md section 2)
export default function VerifyDocument() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const { code } = useParams()
  const q = useQuery({ queryKey: ['public', 'verify', code], queryFn: () => api.get(`/public/verify/${encodeURIComponent(code)}`).then(r => r.data.data), retry: false })
  return (
    <PublicLayout>
      <h1 className="text-2xl font-semibold">{t('cert.verify_title')}</h1>
      {q.isPending ? <Loader type="cards" count={1} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : (
        <Card className="flex flex-col gap-2" data-testid="verify-result">
          <p className="flex items-center gap-2"><StatusBadge status={`verify_${q.data.status}`} /> <Ltr>{code}</Ltr></p>
          {q.data.status !== 'not_found' && (
            <>
              <p>{t(`cert.types.${q.data.kind}`)} · <Ltr>{q.data.number}</Ltr></p>
              <p>{t('cert.holder')}: {q.data.holder}</p>
              <p>{t('cert.issued_on')}: {fmtDate(q.data.issued_date, locale)}{q.data.revoked_on ? ` · ${t('cert.revoked_on')}: ${fmtDate(q.data.revoked_on, locale)}` : ''}</p>
            </>
          )}
        </Card>
      )}
    </PublicLayout>
  )
}
