import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, BadgeCheck, BookOpen, Clock, FileQuestion, FileText, LifeBuoy, Lightbulb, Lock, MessageSquarePlus, RotateCcw, Send, Sparkles, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react'
import DirIcon from '../../components/DirIcon'
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

// D164 AI-P1.3 / D166 AI-Q3: the assistant chat in a familiar messenger layout - own chats on the side (a separate screen on a
// phone), message bubbles (yours at the end, the assistant's at the start with its sources as chips, a reviewed / not-yet-reviewed
// marker, a "the reviewer updated this answer" note, 👍 / 👎), and a composer that keeps the question while it is sending and
// offers "try again" when sending failed. Theme tokens, translations, logical (RTL-safe) classes only.
const SOURCE_ICON = { question: FileQuestion, curriculum: BookOpen, concept: Lightbulb, resource: FileText, answer_bank: BadgeCheck, help: LifeBuoy }   // D166 AI-Q4: help = software guide
const time = (iso, locale) => { try { return iso ? new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) : '' } catch { return '' } }

function SourceChips({ sources }) {
  const { t } = useTranslation()
  if (!sources?.length) return null
  return (
    <ul className="flex flex-wrap gap-1" aria-label={t('ai.sources')} data-testid="ai-source-chips">
      {sources.map(s => {
        const Icon = SOURCE_ICON[s.type] ?? FileText
        const label = s.type === 'answer_bank' ? t('ai.bank') : s.type === 'question' ? t('ai.chip_question', { id: s.id }) : s.type === 'help' ? `${t('ai.help_guide')}: ${s.title}` : s.title
        return (
          <li key={`${s.type}:${s.id}`} className="inline-flex max-w-full items-center gap-1 rounded-token bg-surface-muted px-2 py-0.5 text-xs" data-source={s.type}>
            <Icon aria-hidden="true" className="h-3 w-3 shrink-0" /><span className="truncate" dir="auto">{label}</span>
            {s.type === 'question' && s.locked && <Lock aria-label={t('qb.locked')} className="h-3 w-3 shrink-0" />}
          </li>)
      })}
    </ul>)
}

function Answer({ m, shown, rate, locale }) {
  const { t } = useTranslation()
  const reviewed = m.kind === 'direct' || m.kind === 'help' || ['approved', 'corrected', 'rewritten'].includes(m.review)   // a help article is approved before it shows
  return (
    <div className="flex max-w-[92%] items-end gap-2 self-start sm:max-w-[80%]">
      <span className="mb-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-fg" aria-hidden="true"><Sparkles className="h-4 w-4" /></span>
      <div className="flex min-w-0 flex-col gap-2 rounded-token bg-surface px-3 py-2 text-sm [border:1px_solid_var(--line)]" data-kind={m.kind} data-answer={m.id}>
        <span className={`inline-flex w-fit items-center gap-1 rounded-token px-2 py-0.5 text-xs ${reviewed ? 'bg-primary-soft text-primary-fg' : 'bg-surface-muted text-content-muted'}`} data-testid="ai-review-mark">
          {reviewed ? <><BadgeCheck aria-hidden="true" className="h-3 w-3" />{t('ai.reviewed')}</> : <><Clock aria-hidden="true" className="h-3 w-3" />{t('ai.not_reviewed')}</>}
        </span>
        {m.original && <p className="text-xs font-medium" data-testid="ai-updated">{t('ai.updated_by_reviewer')}</p>}
        {m.items?.length > 0 && !m.original && !m.template && m.kind === 'composed'
          ? <div className="flex flex-col gap-2" data-testid="ai-items">{m.items.map((q, i) => <Item key={q.id} q={q} n={i + 1} />)}</div>
          : <>
            <div className="whitespace-pre-wrap break-words" dir="auto">{m.body}</div>
            {m.items?.length > 0 && <details className="text-xs"><summary>{t('ai.source_questions')}</summary><div className="flex flex-col gap-2 pt-1">{m.items.map((q, i) => <Item key={q.id} q={q} n={i + 1} />)}</div></details>}
          </>}
        {m.rephrasing && <p className="text-xs text-content-muted" data-testid="ai-rephrasing" role="status">{t('ai.rephrasing')}</p>}
        {m.template && <details className="text-xs text-content-muted" data-testid="ai-template"><summary>{t('ai.template')}</summary><div className="whitespace-pre-wrap" dir="auto">{m.template}</div></details>}
        {m.original && <details className="text-xs text-content-muted"><summary>{t('ai.original')}</summary><div className="whitespace-pre-wrap" dir="auto">{m.original}</div></details>}
        {(m.sources ?? []).some(s => s.type === 'question' && s.locked) && (
          <div className="flex flex-wrap gap-2">{m.sources.filter(s => s.type === 'question' && s.locked).map(s => (
            <BuyButton key={s.id} type="question" id={s.id} label={t('ai.unlock_q', { id: s.id })} />))}</div>)}
        <SourceChips sources={m.sources} />
        {shown?.some(q => q.free_reveal) && <p className="text-xs text-content-muted">{t('ai.free_reveal')}</p>}
        <div className="flex items-center justify-between gap-2">
          <span className="flex gap-1">
            <Button variant={m.rating === 1 ? 'secondary' : 'ghost'} onClick={() => rate(m, 1)} aria-label={t('ai.good')} aria-pressed={m.rating === 1} data-action="rate-up"><ThumbsUp aria-hidden="true" className="h-4 w-4" /></Button>
            <Button variant={m.rating === -1 ? 'secondary' : 'ghost'} onClick={() => rate(m, -1)} aria-label={t('ai.bad')} aria-pressed={m.rating === -1} data-action="rate-down"><ThumbsDown aria-hidden="true" className="h-4 w-4" /></Button>
          </span>
          <time className="text-xs text-content-muted" dateTime={m.created_at ?? undefined}>{time(m.created_at, locale)}</time>
        </div>
      </div>
    </div>)
}

function Mine({ text, at, status, onRetry, locale }) {
  const { t } = useTranslation()
  return (
    <div className="flex max-w-[85%] flex-col items-end gap-1 self-end sm:max-w-[70%]" data-mine={status ?? 'sent'}>
      <div className={`whitespace-pre-wrap break-words rounded-token px-3 py-2 text-sm ${status === 'failed' ? 'bg-surface-muted text-content [border:1px_solid_var(--line)]' : 'bg-primary text-on-primary'}`} dir="auto">{text}</div>
      <span className="flex items-center gap-2 text-xs text-content-muted">
        {status === 'sending' && <span role="status">{t('ai.sending')}</span>}
        {status === 'failed' && <><AlertCircle aria-hidden="true" className="h-3 w-3" /><span role="alert">{t('ai.send_failed')}</span>
          <Button variant="ghost" onClick={onRetry} data-action="retry"><RotateCcw aria-hidden="true" className="h-3 w-3" />{t('ai.retry')}</Button></>}
        {!status && <time dateTime={at ?? undefined}>{time(at, locale)}</time>}
      </span>
    </div>)
}

export default function AiChat() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const [active, setActive] = useState(null)
  const [composing, setComposing] = useState(false)             // a phone shows the chat screen for a new chat too
  const [text, setText] = useState('')
  const [pending, setPending] = useState(null)                  // { text, status: 'sending' | 'failed' } - the question on its way
  const [freeLeft, setFreeLeft] = useState(null)
  const [shown, setShown] = useState({})                       // answer id -> the questions it showed (from the ask response)
  const end = useRef(null)
  const isHead = useAuthStore(s => s.role) === 'admin'
  const review = useQuery({ queryKey: ['ai-settings'], enabled: isHead, queryFn: () => api.get('/ai/settings').then(r => r.data.data) })   // AI-P1.4
  const list = useQuery({ queryKey: ['ai-conversations'], queryFn: () => api.get('/ai/conversations').then(r => r.data.data) })
  const chat = useQuery({ queryKey: ['ai-conversation', active], enabled: Boolean(active), queryFn: () => api.get(`/ai/conversations/${active}`).then(r => r.data.data),
    refetchInterval: q => (q.state.data?.messages ?? []).some(m => m.rephrasing) ? 3000 : false })   // AI-P1.6: until the model's wording arrives
  const toast = (m, k) => useUiStore.getState().addToast(m, k)
  useEffect(() => { end.current?.scrollIntoView?.({ block: 'end' }) }, [chat.data, pending])
  const open = (id) => { setActive(id); setComposing(id === null); setPending(null) }

  const send = async (q) => {
    if (!q) return
    setPending({ text: q, status: 'sending' })
    setText('')
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
      await qc.invalidateQueries({ queryKey: ['ai-conversation', id] })
      setPending(null)
    } catch (e) {
      setPending({ text: q, status: 'failed' })                  // the question stays; "try again" sends it again
      toast(e.response?.data?.message ?? t('common.error'), 'error')
    }
  }
  const ask = () => send(text.trim())
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
      if (active === c.id) open(null)
      qc.invalidateQueries({ queryKey: ['ai-conversations'] })
    } catch { toast(t('common.error'), 'error') }
  }

  const setReview = async (on) => {
    try { await api.put('/ai/settings', { send_to_review: on }); qc.invalidateQueries({ queryKey: ['ai-settings'] }) } catch { toast(t('common.error'), 'error') }
  }

  const inChat = Boolean(active) || composing
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('ai.title')} />
      {isHead && review.data && (
        <label className="flex items-center gap-2 text-sm" data-testid="ai-review-setting">
          <input type="checkbox" checked={review.data.send_to_review} onChange={e => setReview(e.target.checked)} name="send_to_review" />
          {t('ai.send_to_review')}
        </label>)}
      <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <Card className={`flex-col gap-2 ${inChat ? 'hidden lg:flex' : 'flex'}`} data-testid="ai-conversations">
          <Button variant="secondary" onClick={() => open(null)} data-action="new-chat"><MessageSquarePlus aria-hidden="true" className="h-4 w-4" />{t('ai.new_chat')}</Button>
          {list.isPending ? <Loader type="skeleton" rows={3} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : (list.data ?? []).length === 0
            ? <p className="text-sm text-content-muted">{t('ai.no_chats')}</p> : (
            <ul className="flex flex-col gap-1 overflow-y-auto lg:max-h-[60vh]">
              {(list.data ?? []).map(c => (
                <li key={c.id} className="flex items-center gap-1"><button type="button" onClick={() => open(c.id)} aria-current={active === c.id}
                  className={`min-w-0 flex-1 truncate rounded-token px-2 py-2 text-start text-sm ${active === c.id ? 'bg-primary-soft font-semibold text-primary-fg' : 'hover:bg-surface-muted'}`} dir="auto">{c.title}</button>
                  <Button variant="ghost" onClick={() => remove(c)} aria-label={t('ai.delete')} data-action="delete-chat"><Trash2 aria-hidden="true" className="h-4 w-4" /></Button></li>
              ))}
            </ul>)}
        </Card>
        <Card className={`min-h-[70vh] flex-col gap-3 p-0 ${inChat ? 'flex' : 'hidden lg:flex'}`} data-testid="ai-chat">
          <div className="flex items-center gap-2 px-3 pt-3 lg:hidden">
            <Button variant="ghost" onClick={() => { setActive(null); setComposing(false); setPending(null) }} aria-label={t('ai.back_to_chats')} data-action="back"><DirIcon icon="back" className="h-4 w-4" /></Button>
            <span className="truncate text-sm font-semibold" dir="auto">{chat.data?.title ?? t('ai.new_chat')}</span>
          </div>
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 pt-3" role="log" aria-live="polite" aria-label={t('ai.title')}>
            {!active && !pending ? <EmptyState title={t('ai.start_hint')} />
              : active && chat.isPending ? <Loader type="skeleton" rows={4} /> : active && chat.isError ? <ErrorState onRetry={chat.refetch} />
              : (chat.data?.messages ?? []).map(m => m.role === 'question'
                ? <Mine key={m.id} text={m.body} at={m.created_at} locale={i18n.language} />
                : <Answer key={m.id} m={m} shown={shown[m.id]} rate={rate} locale={i18n.language} />)}
            {pending && <Mine text={pending.text} status={pending.status} onRetry={() => send(pending.text)} locale={i18n.language} />}
            {pending?.status === 'sending' && <p className="self-start text-xs text-content-muted" data-testid="ai-typing" role="status">{t('ai.thinking')}</p>}
            <div ref={end} />
          </div>
          <div className="sticky bottom-0 flex flex-col gap-1 bg-surface px-3 pb-3 pt-2 [border-top:1px_solid_var(--line)]">
            {freeLeft !== null && <p className="text-xs text-content-muted">{t('ai.free_left', { n: freeLeft })}</p>}
            <div className="flex items-end gap-2">
              <textarea rows={1} maxLength={1000} value={text} onChange={e => setText(e.target.value)} name="ai_question" dir="auto" placeholder={t('ai.placeholder')}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }}
                className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-token bg-surface-muted px-3 py-2 text-sm text-content [field-sizing:content] [border:1px_solid_var(--line)]" aria-label={t('ai.placeholder')} />
              <Button onClick={ask} loading={pending?.status === 'sending'} disabled={!text.trim() || pending?.status === 'sending'} aria-label={t('ai.ask')} data-action="ask"><Send aria-hidden="true" className="h-4 w-4" /></Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
