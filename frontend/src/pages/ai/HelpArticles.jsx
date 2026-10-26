import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { Input, Textarea } from '../../components/FormField'
import { EmptyState, ErrorState } from '../../components/StateViews'

const LINES = ['steps', 'data', 'errors']
const TEXTS = ['purpose', 'where', 'result', 'limits']

// D166 AI-Q4 part 2: approving the help guide. mode "super" (/super-admin/ai-help): the platform articles - edit (back to draft) and
// approve - and a box to ask the guide as a Super Admin. mode "admin" (/admin/ai-help): the approved platform articles, each with
// this institution's own wording (write, edit, approve); nothing unapproved is ever shown in a chat.
export default function HelpArticles({ mode = 'admin' }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const base = mode === 'super' ? '/super/ai-help-articles' : '/ai/help-articles'
  const KEY = ['ai-help', mode]
  const list = useQuery({ queryKey: KEY, queryFn: () => api.get(base).then(r => r.data.data) })
  const [editing, setEditing] = useState(null)   // { id?, base_article_id?, article }
  const toast = useUiStore(s => s.addToast)
  const refresh = () => qc.invalidateQueries({ queryKey: KEY })

  const approve = async (id) => {
    try { await api.post(`${base}/${id}/approve`); toast(t('ai_help.approved'), 'success'); refresh() }
    catch (e) { toast(e.response?.data?.message || t('common.error'), 'error') }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="ai-help-articles">
      <PageHeader title={t(mode === 'super' ? 'ai_help.title_super' : 'ai_help.title_admin')} />
      <p className="text-sm text-content-muted">{t(mode === 'super' ? 'ai_help.intro_super' : 'ai_help.intro_admin')}</p>
      {mode === 'super' && <Ask />}
      {editing && <Editor key={editing.id ?? `new-${editing.base_article_id}`} mode={mode} base={base} editing={editing}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} />}
      {list.isPending ? <Loader type="skeleton" rows={3} /> : list.isError ? <ErrorState onRetry={list.refetch} />
        : list.data.length === 0 ? <EmptyState title={t('ai_help.empty')} /> : (
          <div className="flex flex-col gap-3">
            {list.data.map(a => {
              const shown = mode === 'admin' ? (a.own ?? a) : a
              return (
                <Card key={a.id} className="flex flex-col gap-2" data-testid="ai-help-row" data-id={a.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold">{shown.title}</h2>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-content-muted">{a.locale === 'bn' ? 'বাংলা' : 'English'}</span>
                      <Tag data-status={shown.status}>{mode === 'admin' && !a.own ? t('ai_help.platform') : t(`ai_help.status_${shown.status}`)}</Tag>
                      {!a.live && <Tag data-status="stale">{t('ai_help.stale')}</Tag>}
                    </div>
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-sm" data-testid="ai-help-preview">{shown.preview}</pre>
                  <div className="flex flex-wrap gap-2">
                    {mode === 'super' && <Button variant="secondary" onClick={() => setEditing({ id: a.id, article: a })}>{t('common.edit')}</Button>}
                    {mode === 'super' && a.status !== 'approved' && <Button onClick={() => approve(a.id)} disabled={!a.live} data-testid="ai-help-approve">{t('ai_help.approve')}</Button>}
                    {mode === 'admin' && <Button variant="secondary" onClick={() => setEditing(a.own ? { id: a.own.id, article: a.own } : { base_article_id: a.id, article: a })}>
                      {t(a.own ? 'ai_help.edit_own' : 'ai_help.write_own')}</Button>}
                    {mode === 'admin' && a.own && a.own.status !== 'approved' && <Button onClick={() => approve(a.own.id)} data-testid="ai-help-approve">{t('ai_help.approve')}</Button>}
                  </div>
                </Card>
              )
            })}
          </div>
        )}
    </div>
  )
}

const Tag = (props) => <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-content-muted" {...props} />

function Editor({ base, editing, onClose, onSaved }) {
  const { t } = useTranslation()
  const toast = useUiStore(s => s.addToast)
  const a = editing.article
  const [v, setV] = useState(() => ({
    title: a.title ?? '', keywords: a.keywords ?? '',
    ...Object.fromEntries(TEXTS.map(k => [k, a.body?.[k] ?? ''])),
    ...Object.fromEntries(LINES.map(k => [k, (a.body?.[k] ?? []).join('\n')])),
  }))
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setV(s => ({ ...s, [k]: e.target.value }))
  const save = async (e) => {
    e.preventDefault(); setBusy(true)
    const lines = (s) => s.split('\n').map(x => x.trim()).filter(Boolean)
    const payload = { title: v.title, keywords: v.keywords,
      body: { ...Object.fromEntries(TEXTS.map(k => [k, v[k]])), ...Object.fromEntries(LINES.map(k => [k, lines(v[k])])) } }
    try {
      if (editing.id) await api.put(`${base}/${editing.id}`, payload)
      else await api.post(base, { ...payload, base_article_id: editing.base_article_id })
      toast(t('ai_help.saved_draft'), 'success'); onSaved()
    } catch (err) { toast(err.response?.data?.message || t('common.error'), 'error') } finally { setBusy(false) }
  }
  return (
    <Card>
      <form onSubmit={save} className="flex flex-col gap-3" data-testid="ai-help-editor" noValidate>
        <p className="text-sm text-content-muted">{t('ai_help.draft_note')}</p>
        <Input label={t('ai_help.f_title')} value={v.title} onChange={set('title')} required />
        <Input label={t('ai_help.f_keywords')} value={v.keywords} onChange={set('keywords')} />
        {TEXTS.map(k => <Textarea key={k} rows={2} label={t(`ai_help.f_${k}`)} value={v[k]} onChange={set(k)} />)}
        {LINES.map(k => <Textarea key={k} rows={4} label={t(`ai_help.f_${k}`)} hint={t('ai_help.one_per_line')} value={v[k]} onChange={set(k)} />)}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>{t('common.save')}</Button>
          <Button type="button" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </form>
    </Card>
  )
}

/** the Super Admin panel's own help question (nothing is stored) */
function Ask() {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [out, setOut] = useState(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const ask = async (e) => {
    e.preventDefault(); if (!text.trim()) return
    setBusy(true); setFailed(false)
    try { setOut((await api.post('/super/ai-help', { text })).data.data) } catch { setFailed(true) } finally { setBusy(false) }
  }
  return (
    <Card>
      <form onSubmit={ask} className="flex flex-col gap-2" data-testid="ai-help-ask">
        <Input label={t('ai_help.ask_label')} value={text} onChange={e => setText(e.target.value)} maxLength={1000} />
        <div><Button type="submit" disabled={busy}>{busy ? t('ai.thinking') : t('ai.ask')}</Button></div>
        {failed && <p className="text-sm" role="alert">{t('common.error')}</p>}
        {out && <pre className="whitespace-pre-wrap font-sans text-sm" data-testid="ai-help-answer" data-kind={out.kind}>{out.body}</pre>}
      </form>
    </Card>
  )
}
