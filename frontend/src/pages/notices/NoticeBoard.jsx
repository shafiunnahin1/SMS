import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { useUiStore } from '../../store/uiStore'

// D193 NTC.1 /notices: the notices this user may read (the server decides who sees what). Opening one marks it read;
// a notice that asks for acknowledgement shows the button until it is pressed once.
export default function NoticeBoard() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const [open, setOpen] = useState(null)
  const list = useQuery({ queryKey: ['notices'], queryFn: () => api.get('/notices').then(r => r.data.data) })
  const view = async (n) => {
    setOpen(open === n.id ? null : n.id)
    if (!n.read_at) { await api.get(`/notices/${n.id}`); qc.invalidateQueries({ queryKey: ['notices'] }) }
  }
  const ack = async (n) => {
    try {
      await api.post(`/notices/${n.id}/ack`)
      useUiStore.getState().addToast(t('notices.acknowledged'))
      qc.invalidateQueries({ queryKey: ['notices'] })
    } catch (e) {
      if (e.response?.status === 422) useUiStore.getState().addToast(e.response.data.message, 'error')
    }
  }
  return (
    <div>
      <PageHeader title={t('notices.title')} />
      {list.isPending && <Loader />}
      {list.isError && <ErrorState onRetry={() => list.refetch()} />}
      {list.data?.length === 0 && <EmptyState title={t('notices.empty')} />}
      <div className="grid gap-3">
        {(list.data ?? []).map(n => (
          <Card key={n.id}>
            <button type="button" className="w-full text-start" onClick={() => view(n)} aria-expanded={open === n.id}>
              <span className={`block ${n.read_at ? '' : 'font-semibold'}`} dir="auto">{n.title}</span>
              <span className="block text-sm text-content-muted">{n.published_at ? fmtDate(n.published_at, locale) : ''}{n.read_at ? '' : ` · ${t('notices.unread')}`}</span>
              {n.memo_no_bn && <span className="block text-xs text-content-muted font-mono" dir="ltr">{t('memo.memo_no')}: {n.memo_no_bn}</span>}
            </button>
            {open === n.id && <p className="mt-3 whitespace-pre-line" dir="auto">{n.content}</p>}
            {n.require_ack && (n.acknowledged_at
              ? <p className="mt-3 text-sm text-content-muted">{t('notices.acknowledged_on', { date: fmtDate(n.acknowledged_at, locale) })}</p>
              : <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Button onClick={() => ack(n)}>{t('notices.ack')}</Button>
                  {n.ack_deadline && <span className="text-sm text-content-muted">{t('notices.ack_by', { date: fmtDate(n.ack_deadline, locale) })}</span>}
                </div>)}
          </Card>
        ))}
      </div>
    </div>
  )
}
