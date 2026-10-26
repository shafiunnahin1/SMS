import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquarePlus, Send, ThumbsUp, ThumbsDown, BadgeCheck, Clock, Trash2 } from 'lucide-react'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import BuyButton from '../../features/qb/BuyButton'
import MathText from '../../features/qb/MathText'
import { useAuthStore } from '../../store/authStore'

// D166 AI-Q2: a graph / diagram token the renderer would not accept (wrong shape, truncated, unknown kind) becomes a plain placeholder
// before rendering, so a raw or encoded payload is never shown as text; valid ones go to MathText's own safe renderer
const VALID_TOKEN = /^\[\[qmx-(graph:[A-Za-z0-9_-]{10,60000}|diagram:[A-Za-z0-9_-]{10,200000})\]\]$/
export const safeTokens = (text, placeholder) => String(text ?? '').replace(/\[\[qmx-[^\]]*\]\]/g, (tok) => (VALID_TOKEN.test(tok) ? tok : placeholder))

// D166 AI-Q2: one question the answer showed - maths, graphs and pictures through MathText; a locked one has no answer side at all
function Item({ q, n }) {
  const { t } = useTranslation()
  const ph = `[${t('ai.figure_unreadable')}]`
  return (
    <div className="flex flex-col gap-1 rounded-token px-2 py-2 [border:1px_solid_var(--line)]" data-item={q.id}>
      <div className="flex gap-1"><span className="font-medium">{n}.</span><MathText text={safeTokens(q.question_text, ph)} media={q.media ?? []} /></div>
      {q.options?.length > 0 && <ol className="flex flex-col gap-1 ps-4">{q.options.map(o => (
        <li key={o.label} className="flex gap-1"><span className="font-medium">{o.label})</span><MathText text={safeTokens(o.content_text, ph)} media={q.media ?? []} />{o.is_correct && <span aria-label={t('qb.correct')}>✓</span>}</li>))}</ol>}
      {q.unlocked ? <>
        {q.answer_text && <div><span className="font-medium">{t('qb.answer')}: </span><MathText text={safeTokens(q.answer_text, ph)} media={q.media ?? []} /></div>}
        {q.explanation_text && <div className="text-content-muted"><MathText text={safeTokens(q.explanation_text, ph)} media={q.media ?? []} /></div>}
      </> : <p className="text-xs text-content-muted">{t('ai.locked_item')}</p>}
    </div>
  )
}

// D164 AI-P1.3: the teacher's / head's chat with the assistant - own chats on the side, the question box, each answer with its
// sources, a "not yet reviewed" or "reviewed answer" mark, an unlock button for a question whose answer is hidden, and 👍 / 👎
export default function AiChat() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [active, setActive] = useState(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [freeLeft, setFreeLeft] = useState(null)
  const [shown, setShown] = useState({})                       // answer id -> the questions it showed (from the ask response)
  const end = useRef(null)
  const isHead = useAuthStore(s => s.role) === 'admin'
  const review = useQuery({ queryKey: ['ai-settings'], enabled: isHead, queryFn: () => api.get('/ai/settings').then(r => r.data.data) })   // AI-P1.4
  const list = useQuery({ queryKey: ['ai-conversations'], queryFn: () => api.get('/ai/conversations').then(r => r.data.data) })
  const chat = useQuery({ queryKey: ['ai-conversation', active], enabled: Boolean(active), queryFn: () => api.get(`/ai/conversations/${active}`).then(r => r.data.data),
    refetchInterval: q => (q.state.data?.messages ?? []).some(m => m.rephrasing) ? 3000 : false })   // AI-P1.6: until the model's wording arrives
  const toast = (m, k) => useUiStore.getState().addToast(m, k)
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }) }, [chat.data])

  const ask = async () => {
    const q = text.trim()
    if (!q) return
    setBusy(true)
    try {
      let id = active
      if (!id) {
        id = (await api.post('/ai/conversations', { title: q.slice(0, 120) })).data.data.id
        setActive(id)
        qc.invalidateQueries({ queryKey: ['ai-conversations'] })
      }
      const { data } = await api.post(`/ai/conversations/${id}/messages`, { text: q })
      setShown(s => ({ ...s, [data.data.answer.id]: data.data.questions ?? [] }))
      setFreeLeft(data.data.free_left)
      setText('')
      qc.invalidateQueries({ queryKey: ['ai-conversation', id] })
    } catch (e) { toast(e.response?.data?.message ?? t('common.error'), 'error') } finally { setBusy(false) }
  }
  const rate = async (m, value) => {
    try {
      await api.put(`/ai/messages/${m.id}/rating`, { rating: m.rating === value ? null : value })
      qc.invalidateQueries({ queryKey: ['ai-conversation', active] })
    } catch { toast(t('common.error'), 'error') }
  }

  const remove = async (c) => {                                  // D165 ST.6: delete an own chat for good
    if (!window.confirm(t('ai.delete_confirm'))) return
    try {
      await api.delete(`/ai/conversations/${c.id}`)
      if (active === c.id) setActive(null)
      qc.invalidateQueries({ queryKey: ['ai-conversations'] })
    } catch { toast(t('common.error'), 'error') }
  }

  const setReview = async (on) => {
    try { await api.put('/ai/settings', { send_to_review: on }); qc.invalidateQueries({ queryKey: ['ai-settings'] }) } catch { toast(t('common.error'), 'error') }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('ai.title')} />
      {isHead && review.data && (
        <label className="flex items-center gap-2 text-sm" data-testid="ai-review-setting">
          <input type="checkbox" checked={review.data.send_to_review} onChange={e => setReview(e.target.checked)} name="send_to_review" />
          {t('ai.send_to_review')}
        </label>)}
      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card className="flex flex-col gap-2" data-testid="ai-conversations">
          <Button variant="secondary" onClick={() => setActive(null)} data-action="new-chat"><MessageSquarePlus aria-hidden="true" className="h-4 w-4" />{t('ai.new_chat')}</Button>
          {list.isPending ? <Loader type="skeleton" rows={3} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : (
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto lg:max-h-[60vh]">
              {(list.data ?? []).map(c => (
                <li key={c.id} className="flex items-center gap-1"><button type="button" onClick={() => setActive(c.id)} aria-current={active === c.id}
                  className={`min-w-0 flex-1 truncate rounded-token px-2 py-1 text-start text-sm ${active === c.id ? 'bg-primary-soft font-semibold text-primary-fg' : 'hover:bg-surface-muted'}`} dir="auto">{c.title}</button>
                  <Button variant="ghost" onClick={() => remove(c)} aria-label={t('ai.delete')} data-action="delete-chat"><Trash2 aria-hidden="true" className="h-4 w-4" /></Button></li>
              ))}
            </ul>)}
        </Card>
        <Card className="flex min-h-[60vh] flex-col gap-3" data-testid="ai-chat">
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
            {!active ? <EmptyState title={t('ai.start_hint')} />
              : chat.isPending ? <Loader type="skeleton" rows={4} /> : chat.isError ? <ErrorState onRetry={chat.refetch} />
              : chat.data.messages.map(m => m.role === 'question' ? (
                <div key={m.id} className="max-w-[85%] self-end whitespace-pre-wrap rounded-token bg-primary-soft px-3 py-2 text-sm" dir="auto">{m.body}</div>
              ) : (
                <div key={m.id} className="flex max-w-[95%] flex-col gap-2 self-start rounded-token px-3 py-2 text-sm [border:1px_solid_var(--line)]" data-kind={m.kind} data-answer={m.id}>
                  <span className="flex items-center gap-1 text-xs text-content-muted">
                    {m.kind === 'direct' || ['approved', 'corrected', 'rewritten'].includes(m.review)
                      ? <><BadgeCheck aria-hidden="true" className="h-4 w-4 text-primary-fg" />{t('ai.reviewed')}</>
                      : <><Clock aria-hidden="true" className="h-4 w-4" />{t('ai.not_reviewed')}</>}
                  </span>
                  {m.items?.length > 0 && !m.original && !m.template && m.kind === 'composed'
                    ? <div className="flex flex-col gap-2" data-testid="ai-items">{m.items.map((q, i) => <Item key={q.id} q={q} n={i + 1} />)}</div>   // D166 AI-Q2
                    : <>
                      <div className="whitespace-pre-wrap" dir="auto">{m.body}</div>
                      {m.items?.length > 0 && <details className="text-xs"><summary>{t('ai.source_questions')}</summary><div className="flex flex-col gap-2 pt-1">{m.items.map((q, i) => <Item key={q.id} q={q} n={i + 1} />)}</div></details>}
                    </>}
                  {m.rephrasing && <p className="text-xs text-content-muted" data-testid="ai-rephrasing">{t('ai.rephrasing')}</p>}
                  {m.template && <details className="text-xs text-content-muted" data-testid="ai-template"><summary>{t('ai.template')}</summary><div className="whitespace-pre-wrap" dir="auto">{m.template}</div></details>}
                  {m.original && <details className="text-xs text-content-muted"><summary>{t('ai.original')}</summary><div className="whitespace-pre-wrap" dir="auto">{m.original}</div></details>}
                  {(m.sources ?? []).some(s => s.type === 'question' && s.locked) && (
                    <div className="flex flex-wrap gap-2">{m.sources.filter(s => s.type === 'question' && s.locked).map(s => (
                      <BuyButton key={s.id} type="question" id={s.id} label={t('ai.unlock_q', { id: s.id })} />))}</div>)}
                  {(m.sources ?? []).length > 0 && <p className="text-xs text-content-muted" dir="auto">{t('ai.sources')}: {m.sources.map(s => s.type === 'curriculum' ? s.title : s.type === 'answer_bank' ? t('ai.bank') : `#${s.id}`).join(' · ')}</p>}
                  {shown[m.id]?.some(q => q.free_reveal) && <p className="text-xs text-content-muted">{t('ai.free_reveal')}</p>}
                  <span className="flex gap-1">
                    <Button variant={m.rating === 1 ? 'secondary' : 'ghost'} onClick={() => rate(m, 1)} aria-label={t('ai.good')} aria-pressed={m.rating === 1} data-action="rate-up"><ThumbsUp aria-hidden="true" className="h-4 w-4" /></Button>
                    <Button variant={m.rating === -1 ? 'secondary' : 'ghost'} onClick={() => rate(m, -1)} aria-label={t('ai.bad')} aria-pressed={m.rating === -1} data-action="rate-down"><ThumbsDown aria-hidden="true" className="h-4 w-4" /></Button>
                  </span>
                </div>
              ))}
            <div ref={end} />
          </div>
          {freeLeft !== null && <p className="text-xs text-content-muted">{t('ai.free_left', { n: freeLeft })}</p>}
          <div className="flex items-end gap-2">
            <textarea rows={2} maxLength={1000} value={text} onChange={e => setText(e.target.value)} name="ai_question" dir="auto" placeholder={t('ai.placeholder')}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }}
              className="min-h-[2.5rem] flex-1 rounded-token bg-surface px-3 py-2 text-sm text-content [border:1px_solid_var(--line)]" aria-label={t('ai.placeholder')} />
            <Button onClick={ask} loading={busy} disabled={!text.trim()} data-action="ask"><Send aria-hidden="true" className="h-4 w-4" />{t('ai.ask')}</Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
