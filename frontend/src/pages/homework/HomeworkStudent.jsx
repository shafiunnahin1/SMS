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
import StatusBadge from '../../components/StatusBadge'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Textarea } from '../../components/FormField'

// D212 /student/homework (and, read-only for one child, /parent/homework): the homework, its file, the own submission with its grade and
// feedback; a student submits text and / or a file (again until it is graded)
export function HomeworkList({ items, subs, canSubmit }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const { preview } = usePrint()
  const [open, setOpen] = useState(null)
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const byHw = Object.fromEntries((subs ?? []).map(s => [s.homework_id, s]))
  const submit = async (h) => {
    setBusy(true)
    const fd = new FormData()
    if (text.trim()) fd.append('text_answer', text.trim())
    if (file) fd.append('file', file)
    try {
      await api.post(`/homework/${h.id}/submit`, fd)
      useUiStore.getState().addToast(t('hw.sent'))
      setOpen(null); setText(''); setFile(null); qc.invalidateQueries({ queryKey: ['homework'] })
    } catch { /* the interceptor shows the error */ } finally { setBusy(false) }
  }
  if (!items.length) return <EmptyState title={t('hw.none')} />
  return (
    <div className="flex flex-col gap-3">
      {items.map(h => {
        const sub = byHw[h.id]
        return (
          <Card key={h.id} className="flex flex-col gap-2" data-hw={h.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold" dir="auto">{h.title}</span>
              <StatusBadge status={sub ? `hw_${sub.status}` : 'hw_missing'} />
            </div>
            <span className="text-sm text-content-muted">{h.subject?.name}{h.due_date ? ` · ${t('hw.due', { date: fmtDate(h.due_date, locale) })}` : ''}</span>
            {h.description && <p className="text-sm whitespace-pre-line" dir="auto">{h.description}</p>}
            {sub?.grade || sub?.feedback ? <p className="text-sm">{t('hw.grade')}: <strong>{sub.grade ?? '—'}</strong>{sub.feedback ? ` · ${sub.feedback}` : ''}</p> : null}
            <div className="flex flex-wrap gap-2">
              {h.has_file && <Button variant="secondary" onClick={() => preview(`/homework/${h.id}/file`)} data-action="file">{t('hw.open_file')}</Button>}
              {canSubmit && sub?.status !== 'graded' && open !== h.id && <Button onClick={() => setOpen(h.id)} data-action="open-submit">{sub ? t('hw.resubmit') : t('hw.submit')}</Button>}
            </div>
            {open === h.id && (
              <div className="flex flex-col gap-2" data-testid="submit-form">
                <Textarea label={t('hw.answer')} rows={4} value={text} onChange={e => setText(e.target.value)} name="text_answer" maxLength={10000} />
                <Input label={t('hw.file')} type="file" accept=".pdf,image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} name="file" />
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setOpen(null)}>{t('common.cancel')}</Button>
                  <Button onClick={() => submit(h)} loading={busy} disabled={!text.trim() && !file} data-action="submit">{t('hw.submit')}</Button>
                </div>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}

export default function HomeworkStudent() {
  const { t } = useTranslation()
  const list = useQuery({ queryKey: ['homework', 'student'], queryFn: () => api.get('/student/homework').then(r => r.data.data) })
  const subs = useQuery({ queryKey: ['homework', 'student', 'subs'], queryFn: () => api.get('/student/homework/submitted').then(r => r.data.data) })
  return (
    <div className="flex flex-col gap-4" data-testid="homework-student">
      <PageHeader title={t('hw.title')} />
      {list.isPending ? <Loader type="skeleton" rows={4} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : <HomeworkList items={list.data} subs={subs.data} canSubmit />}
    </div>
  )
}
