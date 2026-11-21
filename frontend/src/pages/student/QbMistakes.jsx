import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Select } from '../../components/FormField'
import MathText from '../../features/qb/MathText'

const shown = (v) => (Array.isArray(v) ? v.filter(Boolean).join(', ') : v) || '—'

// D238 MST.2 /student/mistakes: the questions the student got wrong last time (own practice and quizzes, never the right answer here),
// filter by subject / chapter, and "practise my mistakes" - a normal practice round from them, marked once on the server, after which
// the right answers and explanations show as in practice. Only the student's own.
export default function QbMistakes() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const [place, setPlace] = useState({ subject: '', chapter: '' })
  const [round, setRound] = useState(null)
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const params = { qb_subject_id: place.subject || undefined, qb_chapter_id: place.chapter || undefined }
  const tree = useQuery({ queryKey: ['qb-study', 'curriculum'], queryFn: () => api.get('/student/qb/curriculum').then(r => r.data.data) })
  const list = useQuery({ queryKey: ['qb-mistakes', place], queryFn: () => api.get('/student/qb/mistakes', { params }).then(r => r.data.data) })
  const toast = (e) => useUiStore.getState().addToast(e.response?.data?.message ?? t('common.error'), 'error')
  const name = (n) => (n ? (locale === 'bn' ? n.name_bn : n.name_en) || n.name_en : '')

  const start = async () => {
    setBusy(true)
    try {
      const { data } = await api.post('/student/qb/mistakes/practice', { qb_subject_id: Number(place.subject), qb_chapter_id: place.chapter ? Number(place.chapter) : null })
      setRound(data.data); setAnswers({}); setResult(null)
    } catch (e) { toast(e) } finally { setBusy(false) }
  }
  const submit = async () => {
    setBusy(true)
    try {
      setResult((await api.post(`/student/qb/practice/${round.id}/submit`, { answers })).data.data)
      qc.invalidateQueries({ queryKey: ['qb-mistakes'] }); qc.invalidateQueries({ queryKey: ['qb-practice', 'stats'] })
    } catch (e) { toast(e) } finally { setBusy(false) }
  }

  if (tree.isPending) return <Loader type="page" />
  if (tree.isError) return <ErrorState onRetry={tree.refetch} />
  const subjects = tree.data.subjects ?? []
  const subject = subjects.find(s => String(s.id) === place.subject)
  const practisable = (list.data ?? []).filter(m => m.can_practise).length

  return (
    <div className="flex flex-col gap-4" data-testid="qb-mistakes">
      <PageHeader title={t('mistakes.title')} />
      <p className="text-sm text-content-muted">{t('mistakes.hint')}</p>
      {round ? (
        <Card className="flex flex-col gap-4" data-testid="mistake-round">
          {result && <p className="font-semibold" role="status" data-testid="mistake-result">{t('practice.result', { total: result.total, correct: result.correct })}</p>}
          <ol className="flex flex-col gap-4">
            {round.questions.map((q, i) => {
              const r = result?.results.find(x => x.question_id === q.id)
              return (
                <li key={q.id} className="flex flex-col gap-2" data-question={q.id}>
                  <div className="flex gap-2"><span className="font-medium">{i + 1}.</span><MathText text={q.question_text} /></div>
                  <div className="flex flex-col gap-1">
                    {q.options.map(o => (
                      <label key={o.label} className="flex items-center gap-2 text-sm">
                        <input type="radio" name={`q${q.id}`} value={o.label} disabled={Boolean(result)} checked={answers[q.id] === o.label} onChange={() => setAnswers({ ...answers, [q.id]: o.label })} />
                        <span className="font-medium">{o.label}.</span><MathText text={o.content_text} />
                        {r?.question?.options?.find(x => x.label === o.label)?.is_correct && <span className="text-xs font-semibold">✓</span>}
                      </label>))}
                  </div>
                  {r && <p className="text-sm">{r.is_right ? t('mistakes.now_right') : t('practice.wrong')}</p>}
                  {r?.question?.explanation_text && <div className="text-sm text-content-muted"><MathText text={r.question.explanation_text} /></div>}
                </li>)
            })}
          </ol>
          {result ? <div><Button variant="secondary" onClick={() => { setRound(null); setResult(null) }} data-action="back">{t('mistakes.back')}</Button></div>
            : <div className="flex gap-2"><Button onClick={submit} loading={busy} data-action="submit">{t('practice.submit')}</Button>
              <Button variant="ghost" onClick={() => setRound(null)}>{t('common.cancel')}</Button></div>}
        </Card>
      ) : (<>
        <Card className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <Select label={t('practice.subject')} placeholder={t('mistakes.all_subjects')} name="subject" value={place.subject} options={subjects.map(s => ({ value: String(s.id), label: name(s) }))}
            onChange={e => setPlace({ subject: e.target.value, chapter: '' })} />
          <Select label={t('practice.chapter')} placeholder={t('practice.whole_subject')} name="chapter" value={place.chapter} disabled={!subject}
            options={(subject?.chapters ?? []).map(c => ({ value: String(c.id), label: name(c) }))} onChange={e => setPlace({ ...place, chapter: e.target.value })} />
          <div className="flex flex-col gap-1">
            <Button onClick={start} loading={busy} disabled={!place.subject || !practisable} data-action="practise">{t('mistakes.practise')}</Button>
            {!place.subject && <span className="text-xs text-content-muted">{t('mistakes.pick_subject')}</span>}
          </div>
        </Card>
        <Card className="flex flex-col gap-3">
          {list.isPending ? <Loader type="skeleton" rows={3} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : !list.data.length ? <EmptyState title={t('mistakes.none')} /> : (
            <ul className="flex flex-col divide-y divide-line" data-testid="mistake-list">{list.data.map(m => (
              <li key={m.question.id} className="py-2 flex flex-col gap-1" data-testid="mistake">
                <MathText text={m.question.question_text} />
                <p className="text-sm">{t('mistakes.your_answer')}: <span dir="auto">{shown(m.your_answer)}</span></p>
                <p className="text-xs text-content-muted">
                  {[name(m.subject), name(m.chapter)].filter(Boolean).join(' · ')}{' · '}{t('mistakes.times', { n: m.times_wrong })}
                  {' · '}<Ltr>{(m.last_wrong_at ?? '').slice(0, 10)}</Ltr>{!m.can_practise && <> · {t('mistakes.quiz_only')}</>}
                </p>
              </li>
            ))}</ul>
          )}
        </Card>
      </>)}
    </div>
  )
}
