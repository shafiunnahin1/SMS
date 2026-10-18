import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import List from '../../ui/variants/List'
import { EmptyState, ErrorState } from '../../components/StateViews'
import QuizQuestion from '../../features/qb/QuizQuestion'

// QB.10 public quizzes (D66, question-bank.md §5 "পাবলিক পাতা"): on the platform's own host, no login. /quizzes lists them;
// /quizzes/:id shows the questions (never the answers), checks on the server and shows the score and right / wrong per question -
// nothing is saved; a student keeps the result by taking the same quiz after logging in at their institution.
export default function QbPublicQuiz() {
  const { id } = useParams()
  return <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4">{id ? <Take id={id} /> : <Index />}</div>
}

function Index() {
  const { t } = useTranslation()
  const list = useQuery({ queryKey: ['public', 'qb-quizzes'], queryFn: () => api.get('/public/qb/quizzes').then(r => r.data.data) })
  const cols = [
    { key: 'title', label: t('qbz.quiz'), primary: true, render: q => <Link to={`/quizzes/${q.id}`} className="text-primary-fg underline" dir="auto">{q.title}</Link> },
    { key: 'time', label: t('qbz.time'), render: q => t('qbz.minutes', { n: q.duration_minutes, count: q.question_count }) },
  ]
  return (
    <>
      <h1 className="text-xl font-semibold">{t('qbz.public_title')}</h1>
      <Card data-testid="public-quiz-list"><List columns={cols} rows={list.data ?? []} loading={list.isPending} error={list.isError} onRetry={list.refetch} empty={<EmptyState title={t('qbz.no_quizzes')} />} /></Card>
    </>
  )
}

function Take({ id }) {
  const { t } = useTranslation()
  const quiz = useQuery({ queryKey: ['public', 'qb-quiz', id], queryFn: () => api.get(`/public/qb/quizzes/${id}`).then(r => r.data.data), staleTime: Infinity })
  const [given, setGiven] = useState({})
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  if (quiz.isPending) return <Loader type="page" />
  if (quiz.isError) return <ErrorState onRetry={quiz.refetch} />
  const check = async () => {
    setBusy(true)
    try { setResult((await api.post(`/public/qb/quizzes/${id}/check`, { question_ids: quiz.data.question_ids, answers: given })).data.data) }
    catch (e) { useUiStore.getState().addToast(e.response?.data?.message ?? t('common.error'), 'error') }
    finally { setBusy(false) }
  }
  return (
    <>
      <h1 className="text-xl font-semibold" dir="auto">{quiz.data.title}</h1>
      {result && (
        <Card className="flex flex-col gap-1" data-testid="public-quiz-score">
          <span>{t('qbz.score')}: <Ltr><strong>{result.score} / {result.total}</strong></Ltr></span>
          <span className="text-sm text-content-muted">{t('qbz.login_to_save')}</span>
        </Card>
      )}
      <Card className="flex flex-col gap-5">
        {quiz.data.questions.map((q, i) => (
          <div key={q.id} className="flex flex-col gap-1">
            <QuizQuestion q={q} n={i + 1} value={given[q.id]} onChange={v => setGiven({ ...given, [q.id]: v })} disabled={Boolean(result)} />
            {result && <p className="text-sm" data-testid="public-quiz-mark">{t(result.marks[q.id]?.correct ? 'qbz.correct' : 'qbz.wrong')}</p>}
          </div>
        ))}
      </Card>
      {!result && <div><Button onClick={check} loading={busy} data-action="check-quiz">{t('qbz.check')}</Button></div>}
      <Link to="/quizzes" className="text-sm text-primary-fg underline">{t('qbz.back')}</Link>
    </>
  )
}
