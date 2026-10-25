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
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Select } from '../../components/FormField'
import MathText from '../../features/qb/MathText'

// D165 ST.4 /student/practice: a round of MCQ the student may open (bought or in a pack), answered here, marked once on the server;
// then the right answers and explanations, and the student's own results per subject / chapter
export default function QbPractice() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const [place, setPlace] = useState({ subject: '', chapter: '', count: '10' })
  const [round, setRound] = useState(null)          // { id, questions }
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const tree = useQuery({ queryKey: ['qb-study', 'curriculum'], queryFn: () => api.get('/student/qb/curriculum').then(r => r.data.data) })
  const stats = useQuery({ queryKey: ['qb-practice', 'stats'], queryFn: () => api.get('/student/qb/practice').then(r => r.data.data) })
  const toast = (e) => useUiStore.getState().addToast(e.response?.data?.message ?? t('common.error'), 'error')
  const name = (n) => (locale === 'bn' ? n.name_bn : n.name_en) || n.name_en

  const start = async () => {
    setBusy(true)
    try {
      const { data } = await api.post('/student/qb/practice', { qb_subject_id: Number(place.subject), qb_chapter_id: place.chapter ? Number(place.chapter) : null, count: Number(place.count) })
      setRound(data.data); setAnswers({}); setResult(null)
    } catch (e) { toast(e) } finally { setBusy(false) }
  }
  const submit = async () => {
    setBusy(true)
    try {
      setResult((await api.post(`/student/qb/practice/${round.id}/submit`, { answers })).data.data)
      qc.invalidateQueries({ queryKey: ['qb-practice', 'stats'] })
    } catch (e) { toast(e) } finally { setBusy(false) }
  }

  if (tree.isPending) return <Loader type="page" />
  if (tree.isError) return <ErrorState onRetry={tree.refetch} />
  const subjects = tree.data.subjects ?? []
  const subject = subjects.find(s => String(s.id) === place.subject)
  const label = (sid, cid) => { const s = subjects.find(x => x.id === sid); const c = s?.chapters?.find(x => x.id === cid); return s ? `${name(s)}${c ? ` · ${name(c)}` : ''}` : `#${sid}` }

  return (
    <div className="flex flex-col gap-4" data-testid="qb-practice">
      <PageHeader title={t('practice.title')} />
      {!round && (
        <Card className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <Select label={t('practice.subject')} placeholder={t('qb.pick')} name="subject" value={place.subject} options={subjects.map(s => ({ value: String(s.id), label: name(s) }))}
            onChange={e => setPlace({ ...place, subject: e.target.value, chapter: '' })} />
          <Select label={t('practice.chapter')} placeholder={t('practice.whole_subject')} name="chapter" value={place.chapter}
            options={(subject?.chapters ?? []).map(c => ({ value: String(c.id), label: name(c) }))} onChange={e => setPlace({ ...place, chapter: e.target.value })} />
          <Select label={t('practice.count')} name="count" value={place.count} options={['5', '10', '20', '30'].map(n => ({ value: n, label: n }))} onChange={e => setPlace({ ...place, count: e.target.value })} />
          <div><Button onClick={start} loading={busy} disabled={!place.subject} data-action="start">{t('practice.start')}</Button></div>
        </Card>)}
      {round && (
        <Card className="flex flex-col gap-4" data-testid="practice-round">
          {result && <p className="font-semibold" role="status" data-testid="practice-result">{t('practice.result', { total: result.total, correct: result.correct })}</p>}
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
                  {r && <p className="text-sm">{r.is_right ? t('practice.right') : t('practice.wrong')}</p>}
                  {r?.question?.explanation_text && <div className="text-sm text-content-muted"><MathText text={r.question.explanation_text} /></div>}
                </li>)
            })}
          </ol>
          {result ? <div><Button variant="secondary" onClick={() => { setRound(null); setResult(null) }} data-action="again">{t('practice.again')}</Button></div>
            : <div><Button onClick={submit} loading={busy} data-action="submit">{t('practice.submit')}</Button></div>}
        </Card>)}
      <Card className="flex flex-col gap-2">
        <h2 className="font-semibold">{t('practice.summary')}</h2>
        {stats.isPending ? <Loader type="skeleton" rows={2} /> : stats.isError ? <ErrorState onRetry={stats.refetch} /> : stats.data.summary.length === 0 ? <EmptyState title={t('practice.none')} /> : (
          <ul className="flex flex-col divide-y text-sm" data-testid="practice-summary">
            {stats.data.summary.map(s => (
              <li key={`${s.qb_subject_id}:${s.qb_chapter_id ?? 0}`} className="flex flex-wrap justify-between gap-2 py-1">
                <span dir="auto">{label(s.qb_subject_id, s.qb_chapter_id)}</span>
                <span>{t('practice.rounds')}: {s.rounds} · {t('practice.percent')}: {s.percent}</span>
              </li>))}
          </ul>)}
      </Card>
    </div>
  )
}
