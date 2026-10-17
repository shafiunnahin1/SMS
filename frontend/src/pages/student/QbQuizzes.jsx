import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Ltr from '../../components/bidi/Ltr'
import List from '../../ui/variants/List'
import Tabs from '../../ui/variants/Tabs'
import { EmptyState } from '../../components/StateViews'

const day = (v) => (v ? v.slice(0, 10) : '—')

// QB.10 /student/quizzes (D66, question-bank.md §5): free and public quizzes, a package's quizzes while its access lasts (expired:
// closed, past results stay), the packages to buy (bKash, the server prices them) and the student's results.
export default function QbQuizzes() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState('quizzes')
  const [busy, setBusy] = useState(null)
  const quizzes = useQuery({ queryKey: ['qbz', 'quizzes'], queryFn: () => api.get('/student/qb/quizzes').then(r => r.data.data) })
  const packages = useQuery({ queryKey: ['qbz', 'packages'], queryFn: () => api.get('/student/qb/quiz-packages').then(r => r.data.data), enabled: tab === 'packages' })
  const attempts = useQuery({ queryKey: ['qbz', 'attempts'], queryFn: () => api.get('/student/qb/attempts').then(r => r.data.data), enabled: tab === 'results' })
  const fail = (e) => useUiStore.getState().addToast(e.response?.data?.message ?? t('common.error'), 'error')

  useEffect(() => {                                          // back from bKash
    const result = params.get('payment')
    if (!result) return
    useUiStore.getState().addToast(t(`qbst.payment.${result}`, { defaultValue: t('qbst.payment.failed') }), result === 'success' ? 'success' : 'error')
    setParams({}, { replace: true })
  }, [params, setParams, t])

  const start = async (quiz) => {
    setBusy(`q${quiz.id}`)
    try { navigate(`/student/quizzes/${(await api.post(`/student/qb/quizzes/${quiz.id}/attempts`)).data.data.id}`) } catch (e) { fail(e) } finally { setBusy(null) }
  }
  const buy = (p) => useUiStore.getState().openConfirm({
    title: t('qbz.buy_confirm', { title: p.title }), description: t('qbz.buy_hint', { price: p.price, days: p.validity_days }), confirmLabel: t('qbz.buy'),
    onConfirm: async () => {
      try {
        const d = (await api.post(`/student/qb/quiz-packages/${p.id}/buy`)).data.data
        if (d.bkash_url) { window.location.assign(d.bkash_url); return }
        useUiStore.getState().addToast(t('qbst.opened'))
        qc.invalidateQueries({ queryKey: ['qbz'] })
      } catch (e) { fail(e) }
    },
  })

  const quizCols = [
    { key: 'title', label: t('qbz.quiz'), primary: true, render: q => <span dir="auto">{q.title}</span> },
    { key: 'access', label: t('qbz.access'), render: q => <>{t(`qbz.accesses.${q.access}`)}{q.access_expires_at && <> · {t('qbz.until')} <Ltr>{day(q.access_expires_at)}</Ltr></>}</> },
    { key: 'time', label: t('qbz.time'), render: q => t('qbz.minutes', { n: q.duration_minutes, count: q.question_count }) },
    { key: 'last', label: t('qbz.last'), render: q => q.last_attempt?.submitted ? <Ltr>{q.last_attempt.score} / {q.last_attempt.total}</Ltr> : '—' },
    { key: 'actions', label: t('common.actions'), action: true, render: q => q.may_take
      ? <Button onClick={() => start(q)} loading={busy === `q${q.id}`} data-action="start">{t(q.last_attempt && !q.last_attempt.submitted ? 'qbz.resume' : 'qbz.start')}</Button>
      : <span className="text-sm text-content-muted">{t(q.access === 'package' ? 'qbz.expired' : 'qbz.closed')}</span> },
  ]
  const packCols = [
    { key: 'title', label: t('qbz.package'), primary: true, render: p => <span dir="auto">{p.title}</span> },
    { key: 'quiz_count', label: t('qbz.quiz_count'), render: p => <Ltr>{p.quiz_count}</Ltr> },
    { key: 'validity', label: t('qbz.validity'), render: p => t('qbz.days', { n: p.validity_days }) },
    { key: 'access', label: t('qbz.access'), render: p => p.access_until ? <>{t('qbz.until')} <Ltr>{day(p.access_until)}</Ltr></> : '—' },
    { key: 'actions', label: t('common.actions'), action: true, render: p => p.price == null ? <span className="text-sm text-content-muted">{t('qbb.not_for_sale')}</span>
      : <Button onClick={() => buy(p)} data-action="buy-package">{t(p.access_until ? 'qbz.renew' : 'qbz.buy_for', { price: p.price })}</Button> },
  ]
  const resultCols = [
    { key: 'title', label: t('qbz.quiz'), primary: true, render: a => <button type="button" className="text-start text-primary-fg underline" onClick={() => navigate(`/student/quizzes/${a.id}`)} dir="auto">{a.title}</button> },
    { key: 'when', label: t('qbz.when'), render: a => <Ltr>{day(a.started_at)}</Ltr> },
    { key: 'score', label: t('qbz.score'), render: a => a.submitted_at ? <Ltr>{a.score} / {a.total}</Ltr> : t('qbz.running') },
  ]
  return (
    <div className="flex flex-col gap-4" data-testid="qb-quizzes">
      <PageHeader title={t('qbz.title')} />
      <Tabs label={t('qbz.title')} value={tab} onChange={setTab} items={[{ key: 'quizzes', label: t('qbz.quizzes') }, { key: 'packages', label: t('qbz.packages') }, { key: 'results', label: t('qbz.results') }]} />
      <Card>
        {tab === 'quizzes' && <div data-testid="qb-quiz-list"><List columns={quizCols} rows={quizzes.data ?? []} loading={quizzes.isPending} error={quizzes.isError} onRetry={quizzes.refetch} empty={<EmptyState title={t('qbz.no_quizzes')} />} /></div>}
        {tab === 'packages' && <div data-testid="qb-package-list"><List columns={packCols} rows={packages.data ?? []} loading={packages.isPending} error={packages.isError} onRetry={packages.refetch} empty={<EmptyState title={t('qbz.no_packages')} />} /></div>}
        {tab === 'results' && <div data-testid="qb-result-list"><List columns={resultCols} rows={attempts.data ?? []} loading={attempts.isPending} error={attempts.isError} onRetry={attempts.refetch} empty={<EmptyState title={t('qbz.no_results')} />} /></div>}
      </Card>
    </div>
  )
}
