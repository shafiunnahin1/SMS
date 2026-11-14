import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import api from '../../api/axios'
import { useLocale } from '../../ui/I18nProvider'
import { fmtMoney } from '../../i18n/format'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Ltr from '../../components/bidi/Ltr'

// D217 OPAY.2 (docs/modules/online-fee-payment.md "UI"): the renderer for a started payment, by its flow.
// redirect -> open the provider's page; qr -> draw the QR, count down, poll our own status until it is decided.
export default function PaymentFlow({ payment, onDone }) {
  if (payment.flow === 'redirect') return <RedirectPanel payment={payment} />
  return <QrPaymentPanel payment={payment} onDone={onDone} />
}

function RedirectPanel({ payment }) {
  const { t } = useTranslation()
  useEffect(() => { if (payment.payment_url) window.location.assign(payment.payment_url) }, [payment.payment_url])
  return <Card><p className="text-sm">{t('pay.redirecting')}</p></Card>
}

const secondsLeft = (iso) => (iso ? Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000)) : 0)

export function QrPaymentPanel({ payment, onDone }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const [left, setLeft] = useState(() => secondsLeft(payment.expires_at))
  const q = useQuery({ queryKey: ['online-payment', payment.ref], queryFn: () => api.get(`/parent/online-payments/${payment.ref}`).then(r => r.data.data),
    refetchInterval: (query) => (query.state.data && query.state.data.status !== 'initiated' ? false : 4000) })
  const st = q.data
  const qr = st?.qr_payload ?? payment.qr_payload
  const expires = st?.expires_at ?? payment.expires_at
  useEffect(() => {
    const id = setInterval(() => setLeft(secondsLeft(expires)), 1000)
    return () => clearInterval(id)
  }, [expires])
  const status = st?.status ?? 'initiated'
  const mmss = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`
  return (
    <Card className="flex flex-col items-center gap-3 text-center" data-testid="qr-panel" data-status={status}>
      <h2 className="font-semibold">{t('pay.qr_title')}</h2>
      <p><Ltr>{fmtMoney(st?.amount ?? payment.amount ?? 0, locale)}</Ltr></p>
      {status === 'initiated' && (
        <>
          {qr && <QRCodeSVG value={qr} size={220} marginSize={3} aria-label={t("pay.qr_title")} />}
          <p className="text-sm">{left > 0 ? t('pay.time_left', { time: mmss }) : t('pay.expired_waiting')}</p>
          <p className="text-sm text-content-muted">{t('pay.waiting')}</p>
          <p className="text-xs text-content-muted">{t('pay.ref')}: <Ltr>{payment.ref}</Ltr></p>
        </>
      )}
      {status === 'success' && <p className="font-medium" data-testid="pay-success">{t('pay.success', { receipt: st.receipt_no })}</p>}
      {status === 'review' && <p className="text-sm" data-testid="pay-review">{t('pay.review')}</p>}
      {(status === 'failed' || status === 'cancelled') && <p className="text-sm" data-testid="pay-failed">{t('pay.failed')}</p>}
      {status !== 'initiated' && <Button onClick={() => onDone?.(status)} data-action="done">{t('pay.done')}</Button>}
    </Card>
  )
}
