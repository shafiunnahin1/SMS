import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { usePrint } from '../../hooks/usePrint'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import StatusBadge from '../../components/StatusBadge'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Textarea } from '../../components/FormField'

const blank = { recipient: '', subject: '', body: '' }

// D210 LTR.1 /admin/letters: write an official letter (it takes the next memo number), print it, or cancel it (kept, marked)
export default function Letters() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const { preview } = usePrint()
  const [f, setF] = useState(blank)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const list = useQuery({ queryKey: ['letters'], queryFn: () => api.get('/letters').then(r => r.data) })
  const set = (k) => (e) => setF(v => ({ ...v, [k]: e.target.value }))
  const issue = async () => {
    setBusy(true); setErrors({})
    try {
      const r = await api.post('/letters', f)
      useUiStore.getState().addToast(t('letters.issued', { no: r.data.data.memo_no_bn }))
      setF(blank); qc.invalidateQueries({ queryKey: ['letters'] })
    } catch (e) {
      const v = e.response?.data?.errors
      if (v) setErrors(Object.fromEntries(Object.entries(v).map(([k, m]) => [k, [].concat(m)[0]])))
    } finally { setBusy(false) }
  }
  const cancel = async (l) => {
    const reason = window.prompt(t('ptc.cancel_reason'))
    if (!reason) return
    try { await api.post(`/letters/${l.id}/cancel`, { reason }) } catch { /* the interceptor shows the error */ } finally { qc.invalidateQueries({ queryKey: ['letters'] }) }
  }
  return (
    <div className="flex flex-col gap-4" data-testid="letters">
      <PageHeader title={t('letters.title')} />
      <Card className="flex flex-col gap-3" data-testid="letter-form">
        <Textarea label={t('letters.recipient')} rows={3} value={f.recipient} onChange={set('recipient')} error={errors.recipient} name="recipient" maxLength={255} />
        <Input label={t('letters.subject')} value={f.subject} onChange={set('subject')} error={errors.subject} name="subject" maxLength={200} />
        <Textarea label={t('letters.body')} rows={8} value={f.body} onChange={set('body')} error={errors.body} name="body" maxLength={10000} />
        <p className="text-sm text-content-muted">{t('letters.note')}</p>
        <div><Button onClick={issue} loading={busy} disabled={!f.recipient.trim() || !f.subject.trim() || !f.body.trim()} data-action="issue">{t('letters.issue')}</Button></div>
      </Card>
      {list.isPending ? <Loader type="skeleton" rows={3} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : !list.data.data.length ? <EmptyState title={t('letters.none')} /> : (
        <Card>
          <ul className="flex flex-col divide-y divide-line" data-testid="letter-list">
            {list.data.data.map(l => (
              <li key={l.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex flex-col">
                  <span className="font-medium" dir="auto">{l.subject}</span>
                  <span className="text-content-muted"><span className="font-mono"><Ltr>{l.memo_no_bn}</Ltr></span> · {fmtDate(l.issued_date, locale)}</span>
                </span>
                <span className="inline-flex items-center gap-2">
                  {l.status === 'cancelled' && <StatusBadge status="memo_cancelled" />}
                  <Button variant="secondary" onClick={() => preview(`/letters/${l.id}/pdf`)} data-action="print">{t('ptc.print')}</Button>
                  {l.status === 'issued' && <Button variant="ghost" onClick={() => cancel(l)} data-action="cancel">{t('memo.cancel')}</Button>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
