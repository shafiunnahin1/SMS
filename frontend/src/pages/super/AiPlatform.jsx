import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtNumber } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { Input } from '../../components/FormField'
import { ErrorState } from '../../components/StateViews'
import StatCard from '../../ui/variants/StatCard'
import List from '../../ui/variants/List'

const KEY = ['super', 'ai']
const SERIES = ['questions', 'direct', 'composed', 'not_found', 'thumbs_down', 'reviewed', 'free_reveals']

// D164 AI-P1.5 /super-admin/ai: the assistant's platform settings (free locked answers a day per institution; daily question limit,
// empty = none) and the usage report - counts only, no question text, teacher or institution
export default function AiPlatform() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const [days, setDays] = useState(7)
  const settings = useQuery({ queryKey: [...KEY, 'settings'], queryFn: () => api.get('/super/ai-settings').then(r => r.data.data) })
  const report = useQuery({ queryKey: [...KEY, 'report', days], queryFn: () => api.get('/super/ai-report', { params: { days } }).then(r => r.data.data) })
  const total = (k) => (report.data?.days ?? []).reduce((s, r) => s + (r[k] ?? 0), 0)
  const cols = [
    { key: 'date', label: t('ai_platform.date'), primary: true, render: r => <Ltr>{r.date}</Ltr> },
    ...SERIES.map(k => ({ key: k, label: t(`ai_platform.${k}`), render: r => <Ltr>{fmtNumber(r[k], locale)}</Ltr> })),
  ]
  return (
    <div className="flex flex-col gap-4" data-testid="ai-platform">
      <PageHeader title={t('ai_platform.title')} />
      {settings.isPending ? <Loader type="skeleton" rows={2} /> : settings.isError ? <ErrorState onRetry={settings.refetch} />
        : <Settings data={settings.data} onSaved={() => qc.invalidateQueries({ queryKey: KEY })} />}
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t('ai_platform.report')}</h2>
          <div className="flex gap-2" role="group" aria-label={t('ai_platform.period')}>
            {[7, 30, 90].map(d => <Button key={d} variant={days === d ? 'secondary' : 'ghost'} aria-pressed={days === d} onClick={() => setDays(d)} data-days={d}>{t('ai_platform.days', { n: d })}</Button>)}
          </div>
        </div>
        {report.isPending ? <Loader type="skeleton" rows={3} /> : report.isError ? <ErrorState onRetry={report.refetch} /> : (<>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="ai-totals">
            <StatCard label={t('ai_platform.questions')} value={fmtNumber(total('questions'), locale)} />
            <StatCard label={t('ai_platform.not_found')} value={fmtNumber(total('not_found'), locale)} />
            <StatCard label={t('ai_platform.unreviewed')} value={fmtNumber(report.data.unreviewed, locale)} />
            <StatCard label={t('ai_platform.bank')} value={fmtNumber(report.data.bank, locale)} />
          </div>
          <div data-testid="ai-days"><List columns={cols} rows={[...report.data.days].reverse().map(r => ({ ...r, id: r.date }))} /></div>
        </>)}
      </Card>
    </div>
  )
}

function Settings({ data, onSaved }) {
  const { t } = useTranslation()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { free_answers_per_day: data.free_answers_per_day, daily_question_limit: data.daily_question_limit ?? '', student_free_answers_per_day: data.student_free_answers_per_day ?? 20 } })
  const submit = async (v) => {
    try {
      await api.put('/super/ai-settings', { free_answers_per_day: Number(v.free_answers_per_day),
        daily_question_limit: v.daily_question_limit === '' || v.daily_question_limit === null ? null : Number(v.daily_question_limit),
        student_free_answers_per_day: Number(v.student_free_answers_per_day) })   // D165 ST.6
      useUiStore.getState().addToast(t('common.saved'))
      onSaved()
    } catch (e) { Object.entries(e.response?.data?.errors ?? {}).forEach(([k, m]) => setError(k, { message: m[0] })) }
  }
  return (
    <Card>
      <form onSubmit={handleSubmit(submit)} className="grid gap-3 sm:grid-cols-3 sm:items-end" noValidate data-testid="ai-settings">
        <Input label={t('ai_platform.free_answers')} ltr inputMode="numeric" hint={t('ai_platform.free_answers_hint')} error={errors.free_answers_per_day?.message}
          {...register('free_answers_per_day', { required: t('super.required') })} />
        <Input label={t('ai_platform.daily_limit')} ltr inputMode="numeric" hint={t('ai_platform.daily_limit_hint')} error={errors.daily_question_limit?.message}
          {...register('daily_question_limit')} />
        <Input label={t('ai_platform.student_free')} ltr inputMode="numeric" hint={t('ai_platform.student_free_hint')} error={errors.student_free_answers_per_day?.message}
          {...register('student_free_answers_per_day', { required: t('super.required') })} />
        <div><Button type="submit" loading={isSubmitting}>{t('common.save')}</Button></div>
      </form>
    </Card>
  )
}
