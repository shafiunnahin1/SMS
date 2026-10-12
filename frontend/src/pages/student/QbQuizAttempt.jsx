import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { ErrorState } from '../../components/StateViews'
import MathText from '../../features/qb/MathText'
import QuizQuestion from '../../features/qb/QuizQuestion'

const clock = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
const shown = (v) => (Array.isArray(v) ? v.filter(Boolean).join(', ') : v) || '—'

// QB.10 /student/quizzes/:id (D66 §5): a running attempt - the questions (no answers), a countdown from the server's deadline, the
// answers saved as they change; submit, or at time-up the page submits (the server would take the saved answers anyway). A
// submitted attempt shows the score and, per question, the student's answer, the right answer and the explanation.
export default function QbQuizAttempt() {
  const { t } = useTranslation()
  const { id } = useParams()
  const qc = useQueryClient()
  const key = ['qbz', 'attempt', id]
  const attempt = useQuery({ queryKey: key, queryFn: () => api.get(`/student/qb/attempts/${id}`).then(r => r.data.data) })
  const [given, setGiven] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [busy, setBusy] = useState(false)
  const saveTimer = useRef(null)
  const running = attempt.data && !attempt.data.submitted_at

  useEffect(() => { if (running && given === null) setGiven({ ...(attempt.data.given ?? {}) }) }, [running, attempt.data, given])
  useEffect(() => { if (!running) return undefined; const h = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(h) }, [running])

  const submit = useCallback(async (answers) => {
    setBusy(true)
    clearTimeout(saveTimer.current)
    try { qc.setQueryData(key, (await api.post(`/student/qb/attempts/${id}/submit`, { answers: answers ?? {} })).data.data); qc.invalidateQueries({ queryKey: ['qbz', 'quizzes'] }) }
    catch (e) { useUiStore.getState().addToast(e.response?.data?.message ?? t('common.error'), 'error'); attempt.refetch() }
    finally { setBusy(false) }
  }, [id])

  const left = running ? new Date(attempt.data.deadline).getTime() - now : 0
  const over = Boolean(running && left <= 0)
  useEffect(() => { if (over) submit(given) }, [over])                 // time-up: once, with what is on the page

  const answer = (qid, v) => {
    const next = { ...given, [qid]: v }
    setGiven(next)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => api.put(`/student/qb/attempts/${id}`, { answers: next }).catch(() => attempt.refetch()), 800)
  }

  if (attempt.isPending) return <Loader type="page" />
  if (attempt.isError) return <ErrorState onRetry={attempt.refetch} />
  const a = attempt.data
  return (
    <div className="flex flex-col gap-4" data-testid="qb-attempt">
      <PageHeader title={a.title} />
      {running ? (
        <>
          <Card className="sticky top-0 z-10 flex items-center justify-between gap-2">
            <span className="text-sm">{t('qbz.time_left')}: <Ltr><strong data-testid="quiz-timer">{clock(left)}</strong></Ltr></span>
            <Button onClick={() => submit(given)} loading={busy} data-action="submit-quiz">{t('qbz.submit')}</Button>
          </Card>
          <Card className="flex flex-col gap-5">
            {a.questions.map((q, i) => <QuizQuestion key={q.id} q={q} n={i + 1} value={given?.[q.id]} onChange={v => answer(q.id, v)} disabled={busy} />)}
          </Card>
        </>
      ) : (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-2" data-testid="quiz-score">
            <span>{t('qbz.score')}: <Ltr><strong>{a.score} / {a.total}</strong></Ltr></span>
            {a.passed != null && <span className={a.passed ? 'text-primary-fg' : 'text-content-muted'}>{t(a.passed ? 'qbz.passed' : 'qbz.not_passed')}</span>}
            <Link to="/student/quizzes" className="text-sm text-primary-fg underline">{t('qbz.back')}</Link>
          </Card>
          <Card className="flex flex-col gap-4">
            {a.review.map((r, i) => (
              <div key={r.question.id} className="flex flex-col gap-1" data-testid="quiz-review" data-correct={r.mark?.correct ? '1' : '0'}>
                <div className="flex gap-2 font-medium"><span>{i + 1}.</span><MathText text={r.question.question_text} /></div>
                <p className="text-sm">{t('qbz.yours')}: <span dir="auto">{shown(r.given)}</span> {r.mark && <Ltr>({r.mark.score}/{r.mark.total})</Ltr>}</p>
                <p className="text-sm" data-testid="quiz-right">{t('qbz.right')}: <span dir="auto">{shown(r.right)}</span></p>
                {r.question.explanation_text && <MathText text={r.question.explanation_text} className="text-sm text-content-muted" />}
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  )
}
