import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus, X } from 'lucide-react'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import StatusBadge from '../../components/StatusBadge'
import Ltr from '../../components/bidi/Ltr'
import List from '../../ui/variants/List'
import Modal from '../../ui/variants/Modal'
import { Input, Select } from '../../components/FormField'
import { EmptyState } from '../../components/StateViews'
import MathText from '../../features/qb/MathText'

const KEY = ['super', 'qb-quizzes']
const ACCESS = ['free', 'public', 'package']

// QB.10 /super-admin/qb/quizzes (D66, question-bank.md §3ছ): quiz packages (validity in days; the price is the student list's
// "quiz package" row on the pricing page) and quizzes - free, public (also on the public page without login) or in a package;
// a fixed list of published auto-marked questions, or a random draw from a subject. Nothing is deleted: switched off.
export default function QbQuizzes() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const packages = useQuery({ queryKey: [...KEY, 'packages'], queryFn: () => api.get('/super/qb/quiz-packages').then(r => r.data.data) })
  const quizzes = useQuery({ queryKey: [...KEY, 'quizzes'], queryFn: () => api.get('/super/qb/quizzes').then(r => r.data.data) })
  const [open, setOpen] = useState(null)
  const refresh = () => qc.invalidateQueries({ queryKey: KEY })
  const packName = (id) => packages.data?.find(p => p.id === id)?.title ?? '—'
  // the PUT takes the whole quiz again; switching off sends it back as it is with is_active false
  const quizBody = (q) => ({ title: q.title, access: q.access, qb_quiz_package_id: q.access === 'package' ? q.qb_quiz_package_id : null, duration_minutes: q.duration_minutes,
    rule: q.rule, qb_subject_id: q.qb_subject_id, qb_chapter_id: q.qb_chapter_id, qb_topic_id: q.qb_topic_id, pass_mark: q.pass_mark, opens_at: q.opens_at, closes_at: q.closes_at,
    ...(q.rule === 'fixed' ? { question_ids: q.questions.map(x => x.id) } : { question_count: q.question_count }) })
  const switchOff = (kind, row) => useUiStore.getState().openConfirm({
    title: t('qbz.off_confirm'), type: 'danger', confirmLabel: t('qb.switch_off'),
    onConfirm: async () => {
      if (kind === 'package') {
        await api.put(`/super/qb/quiz-packages/${row.id}`, { title: row.title, validity_days: row.validity_days, description: row.description,
          qb_class_level_id: row.qb_class_level_id, qb_subject_id: row.qb_subject_id, is_active: false })
      } else {
        await api.put(`/super/qb/quizzes/${row.id}`, { ...quizBody((await api.get(`/super/qb/quizzes/${row.id}`)).data.data), is_active: false })
      }
      useUiStore.getState().addToast(t('common.saved'))
      refresh()
    },
  })

  const packCols = [
    { key: 'title', label: t('qbz.package'), primary: true, render: p => <span dir="auto">{p.title}</span> },
    { key: 'validity', label: t('qbz.validity'), render: p => t('qbz.days', { n: p.validity_days }) },
    { key: 'quiz_count', label: t('qbz.quiz_count'), render: p => <Ltr>{p.quiz_count}</Ltr> },
    { key: 'is_active', label: t('qb.state'), render: p => <StatusBadge status={p.is_active ? 'active' : 'inactive'} /> },
    { key: 'actions', label: t('common.actions'), action: true, render: p => p.is_active && <Button variant="secondary" onClick={() => switchOff('package', p)}>{t('qb.switch_off')}</Button> },
  ]
  const quizCols = [
    { key: 'title', label: t('qbz.quiz'), primary: true, render: q => <span dir="auto">{q.title}</span> },
    { key: 'access', label: t('qbz.access'), render: q => <>{t(`qbz.accesses.${q.access}`)}{q.qb_quiz_package_id && <> · <span dir="auto">{packName(q.qb_quiz_package_id)}</span></>}</> },
    { key: 'rule', label: t('qbz.rule'), render: q => t(`qbz.rules.${q.rule}`) },
    { key: 'time', label: t('qbz.time'), render: q => t('qbz.minutes', { n: q.duration_minutes, count: q.question_count }) },
    { key: 'is_active', label: t('qb.state'), render: q => <StatusBadge status={q.is_active ? 'active' : 'inactive'} /> },
    { key: 'actions', label: t('common.actions'), action: true, render: q => q.is_active && <Button variant="secondary" onClick={() => switchOff('quiz', q)}>{t('qb.switch_off')}</Button> },
  ]
  return (
    <div className="flex flex-col gap-4" data-testid="qb-quiz-admin">
      <PageHeader title={t('qbz.admin_title')} />
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t('qbz.packages')}</h2>
          <Button onClick={() => setOpen('package')} data-action="new-package"><Plus aria-hidden="true" className="h-4 w-4" />{t('qbz.new_package')}</Button>
        </div>
        <p className="text-xs text-content-muted">{t('qbz.package_hint')}</p>
        <List columns={packCols} rows={packages.data ?? []} loading={packages.isPending} error={packages.isError} onRetry={packages.refetch} empty={<EmptyState title={t('qbz.no_packages')} />} />
      </Card>
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t('qbz.quizzes')}</h2>
          <Button onClick={() => setOpen('quiz')} data-action="new-quiz"><Plus aria-hidden="true" className="h-4 w-4" />{t('qbz.new_quiz')}</Button>
        </div>
        <div data-testid="qb-quiz-admin-list"><List columns={quizCols} rows={quizzes.data ?? []} loading={quizzes.isPending} error={quizzes.isError} onRetry={quizzes.refetch} empty={<EmptyState title={t('qbz.no_quizzes')} />} /></div>
      </Card>
      {open === 'package' && <NewPackage onClose={() => setOpen(null)} onSaved={() => { setOpen(null); refresh() }} />}
      {open === 'quiz' && <NewQuiz packages={(packages.data ?? []).filter(p => p.is_active)} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); refresh() }} />}
    </div>
  )
}

const errorsTo = (e, setError) => Object.entries(e.response?.data?.errors ?? {}).forEach(([k, m]) => setError(k, { message: m[0] }))

function NewPackage({ onClose, onSaved }) {
  const { t } = useTranslation()
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: { title: '', validity_days: '30', description: '' } })
  const submit = async (v) => {
    try { await api.post('/super/qb/quiz-packages', { title: v.title, validity_days: Number(v.validity_days), description: v.description || null }); useUiStore.getState().addToast(t('common.saved')); onSaved() }
    catch (e) { errorsTo(e, setError) }
  }
  return (
    <Modal open onClose={onClose} title={t('qbz.new_package')}>
      <form onSubmit={handleSubmit(submit)} className="grid gap-3" noValidate data-testid="new-package">
        <Input label={t('qbz.package')} error={errors.title?.message} {...register('title', { required: t('super.required') })} />
        <Input label={t('qbz.validity_days')} ltr inputMode="numeric" error={errors.validity_days?.message} {...register('validity_days', { required: t('super.required') })} />
        <Input label={t('qbz.description')} error={errors.description?.message} {...register('description')} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
        </div>
      </form>
    </Modal>
  )
}

function NewQuiz({ packages, onClose, onSaved }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const tree = useQuery({ queryKey: ['super', 'qb-curriculum'], queryFn: () => api.get('/super/qb/curriculum').then(r => r.data.data) })
  const { register, handleSubmit, watch, setError, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { title: '', access: 'free', qb_quiz_package_id: '', duration_minutes: '10', rule: 'fixed', qb_subject_id: '', question_count: '10', pass_mark: '' } })
  const [picked, setPicked] = useState([])
  const [search, setSearch] = useState('')
  const found = useQuery({ queryKey: ['super', 'qb-quiz-search', search], enabled: search.trim().length > 1,
    queryFn: () => api.get('/writer/questions', { params: { status: 'published', q: search.trim(), per_page: 20 } }).then(r => r.data.data) })
  const rule = watch('rule')
  const name = (x) => (locale === 'bn' ? x.name_bn : x.name_en) || x.name_bn
  const submit = async (v) => {
    try {
      await api.post('/super/qb/quizzes', { title: v.title, access: v.access, qb_quiz_package_id: v.access === 'package' ? Number(v.qb_quiz_package_id) || null : undefined,
        duration_minutes: Number(v.duration_minutes), rule: v.rule, pass_mark: v.pass_mark || null,
        ...(v.rule === 'fixed' ? { question_ids: picked.map(q => q.id) } : { qb_subject_id: Number(v.qb_subject_id) || null, question_count: Number(v.question_count) }) })
      useUiStore.getState().addToast(t('common.saved'))
      onSaved()
    } catch (e) { errorsTo(e, setError) }
  }
  return (
    <Modal open onClose={onClose} title={t('qbz.new_quiz')}>
      <form onSubmit={handleSubmit(submit)} className="grid gap-3 sm:grid-cols-2" noValidate data-testid="new-quiz">
        <Input label={t('qbz.quiz')} className="sm:col-span-2" error={errors.title?.message} {...register('title', { required: t('super.required') })} />
        <Select label={t('qbz.access')} options={ACCESS.map(a => ({ value: a, label: t(`qbz.accesses.${a}`) }))} {...register('access')} />
        {watch('access') === 'package' && <Select label={t('qbz.package')} placeholder={t('qb.pick')} error={errors.qb_quiz_package_id?.message}
          options={packages.map(p => ({ value: String(p.id), label: p.title }))} {...register('qb_quiz_package_id')} />}
        <Input label={t('qbz.duration')} ltr inputMode="numeric" error={errors.duration_minutes?.message} {...register('duration_minutes', { required: t('super.required') })} />
        <Input label={t('qbz.pass_mark')} ltr inputMode="decimal" error={errors.pass_mark?.message} {...register('pass_mark')} />
        <Select label={t('qbz.rule')} options={['fixed', 'random_from_scope'].map(r => ({ value: r, label: t(`qbz.rules.${r}`) }))} {...register('rule')} />
        {rule === 'random_from_scope' ? <>
          <Select label={t('qb.subject')} placeholder={t('qb.pick')} error={errors.qb_subject_id?.message}
            options={(tree.data?.subjects ?? []).map(s => ({ value: String(s.id), label: name(s) }))} {...register('qb_subject_id')} />
          <Input label={t('qbz.question_count')} ltr inputMode="numeric" error={errors.question_count?.message} {...register('question_count')} />
        </> : (
          <div className="sm:col-span-2 flex flex-col gap-2" data-testid="quiz-picker">
            <Input label={t('qbz.find_question')} hint={t('qbz.find_hint')} value={search} onChange={e => setSearch(e.target.value)} name="find" error={errors.question_ids?.message} />
            {(found.data ?? []).filter(q => !picked.some(p => p.id === q.id)).slice(0, 8).map(q => (
              <button type="button" key={q.id} className="text-start text-sm text-primary-fg underline" onClick={() => setPicked([...picked, q])} data-action="pick">
                <MathText text={q.question_text} />
              </button>
            ))}
            <ol className="flex flex-col gap-1">
              {picked.map((q, i) => (
                <li key={q.id} className="flex items-center gap-2 text-sm"><Ltr>{i + 1}.</Ltr><MathText text={q.question_text} className="flex-1" />
                  <button type="button" aria-label={t('qbz.remove')} onClick={() => setPicked(picked.filter(p => p.id !== q.id))}><X aria-hidden="true" className="h-4 w-4" /></button></li>
              ))}
            </ol>
          </div>
        )}
        <div className="sm:col-span-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
        </div>
      </form>
    </Modal>
  )
}
