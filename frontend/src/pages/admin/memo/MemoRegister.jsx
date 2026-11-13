import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../../api/axios'
import { useLocale } from '../../../ui/I18nProvider'
import { fmtDate } from '../../../i18n/format'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import Loader from '../../../components/Loader'
import StatusBadge from '../../../components/StatusBadge'
import Ltr from '../../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../../components/StateViews'
import { Select } from '../../../components/FormField'

const KINDS = ['tc', 'attestation', 'testimonial', 'certificate', 'letter', 'notice']

// D210 MEMO.1 /admin/memo-register: every memo number issued, newest first, with its document kind, recipient and who issued it.
// A number can be cancelled with a reason; it stays in the register as cancelled and is never given again.
export default function MemoRegister() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const [f, setF] = useState({ doc_kind: '', status: '' })
  const [page, setPage] = useState(1)
  const q = useQuery({ queryKey: ['memo', 'register', f, page], queryFn: () => api.get('/memo-register', { params: { doc_kind: f.doc_kind || undefined, status: f.status || undefined, page } }).then(r => r.data) })
  const cancel = async (m) => {
    const reason = window.prompt(t('memo.cancel_reason'))
    if (!reason) return
    try { await api.post(`/memo-register/${m.id}/cancel`, { reason }) } catch { /* the interceptor shows the error */ } finally { qc.invalidateQueries({ queryKey: ['memo', 'register'] }) }
  }
  return (
    <div className="flex flex-col gap-4" data-testid="memo-register">
      <PageHeader title={t('memo.register_title')} />
      <Card className="flex flex-wrap gap-3">
        <Select label={t('memo.kind')} placeholder={t('common.all')} value={f.doc_kind} onChange={e => { setPage(1); setF(v => ({ ...v, doc_kind: e.target.value })) }} name="doc_kind" className="sm:w-56"
          options={KINDS.map(k => ({ value: k, label: t(`memo.kinds.${k}`) }))} />
        <Select label={t('academic.status')} placeholder={t('common.all')} value={f.status} onChange={e => { setPage(1); setF(v => ({ ...v, status: e.target.value })) }} name="status" className="sm:w-56"
          options={['issued', 'cancelled'].map(s => ({ value: s, label: t(`memo.statuses.${s}`) }))} />
      </Card>
      {q.isPending ? <Loader type="skeleton" rows={5} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.data.length ? <EmptyState title={t('memo.none')} /> : (
        <Card>
          <ul className="flex flex-col divide-y divide-line" data-testid="memo-rows">
            {q.data.data.map(m => (
              <li key={m.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex flex-col">
                  <span className="font-mono"><Ltr>{m.memo_no_bn}</Ltr></span>
                  <span className="text-content-muted">{t(`memo.kinds.${m.doc_kind}`)}{m.recipient ? ` · ${m.recipient}` : ''} · {m.issued_at && fmtDate(m.issued_at, locale)}{m.issued_by ? ` · ${m.issued_by}` : ''}
                    {m.cancel_reason ? ` · ${t('memo.reason')}: ${m.cancel_reason}` : ''}</span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <StatusBadge status={`memo_${m.status}`} />
                  {m.status === 'issued' && <Button variant="ghost" onClick={() => cancel(m)} data-action="cancel">{t('memo.cancel')}</Button>}
                </span>
              </li>
            ))}
          </ul>
          {q.data.meta.last_page > 1 && (
            <div className="flex justify-between pt-3">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('common.previous')}</Button>
              <Button variant="secondary" disabled={page >= q.data.meta.last_page} onClick={() => setPage(p => p + 1)}>{t('common.next')}</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
