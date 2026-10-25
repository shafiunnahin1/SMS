import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, PencilLine, FilePenLine, ThumbsDown } from 'lucide-react'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Tabs from '../../ui/variants/Tabs'
import { EmptyState, ErrorState } from '../../components/StateViews'

const STATUSES = ['unreviewed', 'approved', 'corrected', 'rewritten']

// D164 (3) AI-P1.4: the writers' / moderators' review of the AI assistant's answers - de-identified question and answer, thumbs-down
// and "not found" first; approve as it is, correct it (the answer prefilled) or write it anew; reviewed answers join the answer bank
export default function AiReviews() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [status, setStatus] = useState('unreviewed')
  const [editing, setEditing] = useState(null)                 // { id, mode: corrected|rewritten, text }
  const [busy, setBusy] = useState(null)
  const list = useQuery({ queryKey: ['ai-reviews', status], queryFn: () => api.get('/writer/ai-reviews', { params: { status } }).then(r => r.data.data) })
  const decide = async (id, next, text) => {
    setBusy(id)
    try {
      await api.put(`/writer/ai-reviews/${id}`, { status: next, ...(text !== undefined ? { text } : {}) })
      useUiStore.getState().addToast(t(`ai_review.done.${next}`))
      setEditing(null)
      qc.invalidateQueries({ queryKey: ['ai-reviews'] })
    } catch (e) { useUiStore.getState().addToast(e.response?.data?.message ?? t('common.error'), 'error') } finally { setBusy(null) }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('ai_review.title')} />
      <Tabs items={STATUSES.map(k => ({ key: k, label: t(`ai_review.status.${k}`) }))} value={status} onChange={setStatus} label={t('ai_review.title')} />
      {list.isPending ? <Loader type="skeleton" rows={4} /> : list.isError ? <ErrorState onRetry={list.refetch} />
        : !list.data.length ? <EmptyState title={t('ai_review.empty')} /> : (
        <ul className="flex flex-col gap-3" data-testid="ai-reviews">
          {list.data.map(r => (
            <li key={r.id}><Card className="flex flex-col gap-2" data-review={r.id}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-content-muted">
                {r.rating === -1 && <span className="inline-flex items-center gap-1 rounded-token bg-primary-soft px-2 py-0.5 text-primary-fg"><ThumbsDown aria-hidden="true" className="h-3 w-3" />{t('ai_review.thumbs_down')}</span>}
                {r.kind === 'not_found' && <span className="rounded-token bg-surface-muted px-2 py-0.5">{t('ai_review.not_found')}</span>}
              </div>
              <p className="text-sm font-semibold" dir="auto">{t('ai_review.question')}: {r.question}</p>
              <div className="whitespace-pre-wrap rounded-token bg-surface-muted p-2 text-sm" dir="auto">{r.reviewer_text || r.answer}</div>
              {status === 'unreviewed' && (editing?.id === r.id ? (
                <div className="flex flex-col gap-2">
                  <textarea rows={6} value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })} name="review_text" dir="auto"
                    className="rounded-token bg-surface p-2 text-sm text-content [border:1px_solid_var(--line)]" aria-label={t(`ai_review.${editing.mode}`)} />
                  <span className="flex flex-wrap gap-2">
                    <Button onClick={() => decide(r.id, editing.mode, editing.text)} disabled={!editing.text.trim()} loading={busy === r.id} data-action="save-review">{t('common.save')}</Button>
                    <Button variant="ghost" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
                  </span>
                </div>
              ) : (
                <span className="flex flex-wrap gap-2">
                  {r.kind !== 'not_found' && <Button onClick={() => decide(r.id, 'approved')} loading={busy === r.id} data-action="approve"><Check aria-hidden="true" className="h-4 w-4" />{t('ai_review.approved')}</Button>}
                  {r.kind !== 'not_found' && <Button variant="secondary" onClick={() => setEditing({ id: r.id, mode: 'corrected', text: r.answer })} data-action="correct"><PencilLine aria-hidden="true" className="h-4 w-4" />{t('ai_review.corrected')}</Button>}
                  <Button variant="secondary" onClick={() => setEditing({ id: r.id, mode: 'rewritten', text: '' })} data-action="rewrite"><FilePenLine aria-hidden="true" className="h-4 w-4" />{t('ai_review.rewritten')}</Button>
                </span>
              ))}
            </Card></li>
          ))}
        </ul>
      )}
    </div>
  )
}
