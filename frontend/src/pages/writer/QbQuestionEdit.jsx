import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'
import QbStatus from '../../features/qb/QbStatus'

const EDITABLE = ['draft', 'rejected']

// QB.2 /writer/questions/:id and /writer/questions/new (D65): the core question form (type, place in the curriculum, text,
// answer, explanation), then the review actions. A writer edits only a draft or a rejected question and sends it for review; a
// moderator reads it and publishes or rejects it with a reason; the Super Admin may do both. The rich editor (options, maths,
// pictures) arrives in QB.3 - this form keeps to the fields every type shares.
export default function QbQuestionEdit() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const role = useAuthStore(s => s.user?.role)
  const tree = useQuery({ queryKey: ['writer', 'curriculum'], queryFn: () => api.get('/writer/curriculum').then(r => r.data.data) })
  const types = useQuery({ queryKey: ['writer', 'types'], queryFn: () => api.get('/writer/question-types').then(r => r.data.data) })
  const q = useQuery({ queryKey: ['writer', 'question', id], queryFn: () => api.get(`/writer/questions/${id}`).then(r => r.data.data), enabled: !isNew })
  const revs = useQuery({ queryKey: ['writer', 'revisions', id], queryFn: () => api.get(`/writer/questions/${id}/revisions`).then(r => r.data.data), enabled: !isNew })
  const { register, handleSubmit, reset, watch, setError, setValue, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { qb_question_type_id: '', qb_subject_id: '', qb_chapter_id: '', qb_topic_id: '', difficulty: 3, marks: '1', language: 'bn', question_text: '', answer_text: '', explanation_text: '' },
  })
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(null)
  useEffect(() => {
    if (q.data) reset({ ...q.data, qb_question_type_id: String(q.data.qb_question_type_id), qb_subject_id: String(q.data.qb_subject_id),
      qb_chapter_id: q.data.qb_chapter_id ? String(q.data.qb_chapter_id) : '', qb_topic_id: q.data.qb_topic_id ? String(q.data.qb_topic_id) : '',
      answer_text: q.data.answer_text ?? '', explanation_text: q.data.explanation_text ?? '' })
  }, [q.data, reset])

  if (tree.isPending || types.isPending || (!isNew && q.isPending)) return <Loader type="page" />
  if (tree.isError || types.isError || q.isError) return <ErrorState onRetry={() => { tree.refetch(); types.refetch(); q.refetch() }} />

  const status = isNew ? 'draft' : q.data.status
  const canEdit = role === 'super_admin' || (role === 'content_writer' && EDITABLE.includes(status))
  const canSubmit = !isNew && role !== 'content_moderator' && EDITABLE.includes(status)
  const canReview = !isNew && role !== 'content_writer' && status === 'review'
  const name = (n) => (locale === 'bn' ? n.name_bn : n.name_en) || n.name_en
  const subject = tree.data.subjects.find(s => String(s.id) === String(watch('qb_subject_id')))
  const chapter = subject?.chapters.find(c => String(c.id) === String(watch('qb_chapter_id')))
  const num = (v) => (v === '' || v == null ? null : Number(v))

  const save = async (v) => {
    const body = { qb_question_type_id: num(v.qb_question_type_id), qb_subject_id: num(v.qb_subject_id), qb_chapter_id: num(v.qb_chapter_id), qb_topic_id: num(v.qb_topic_id),
      difficulty: Number(v.difficulty), marks: v.marks, language: v.language, question_text: v.question_text, answer_text: v.answer_text || null, explanation_text: v.explanation_text || null }
    try {
      const { data } = isNew ? await api.post('/writer/questions', body) : await api.put(`/writer/questions/${id}`, body)
      useUiStore.getState().addToast(t('common.saved'))
      qc.invalidateQueries({ queryKey: ['writer'] })
      if (isNew) navigate(`/writer/questions/${data.data.id}`, { replace: true })
    } catch (e) {
      Object.entries(e.response?.data?.errors ?? {}).forEach(([f, m]) => setError(f, { message: m[0] }))
    }
  }
  const act = async (action, body) => {
    setBusy(action)
    try {
      await api.post(`/writer/questions/${id}/${action}`, body)
      useUiStore.getState().addToast(t(`qb.done.${action}`))
      setReason('')
      qc.invalidateQueries({ queryKey: ['writer'] })
    } catch (e) {
      if (e.response?.status === 422) useUiStore.getState().addToast(e.response.data.errors?.reason?.[0] ?? e.response.data.message, 'error')
    } finally { setBusy(null) }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="qb-question-edit">
      <PageHeader title={isNew ? t('qb.new_question') : t('qb.question_no', { id })} actions={!isNew && <QbStatus status={status} />} />
      {status === 'rejected' && q.data?.review_note && (
        <Card className="flex flex-col gap-1" data-testid="review-note" role="status">
          <h2 className="font-semibold">{t('qb.returned')}</h2>
          <p dir="auto" className="text-sm">{q.data.review_note}</p>
        </Card>
      )}
      <Card>
        <form id="qb-question-form" onSubmit={handleSubmit(save)} className="grid gap-3 sm:grid-cols-2" noValidate>
          <fieldset disabled={!canEdit} className="contents">
            <Select label={t('qb.type')} placeholder={t('qb.pick')} error={errors.qb_question_type_id?.message}
              options={types.data.map(ty => ({ value: String(ty.id), label: name(ty) }))} {...register('qb_question_type_id', { required: t('super.required') })} />
            <Select label={t('qb.subject')} placeholder={t('qb.pick')} error={errors.qb_subject_id?.message}
              options={tree.data.subjects.map(s => ({ value: String(s.id), label: name(s) }))}
              {...register('qb_subject_id', { required: t('super.required'), onChange: () => { setValue('qb_chapter_id', ''); setValue('qb_topic_id', '') } })} />
            <Select label={t('qb.chapter')} placeholder={t('qb.none_option')} error={errors.qb_chapter_id?.message}
              options={(subject?.chapters ?? []).map(c => ({ value: String(c.id), label: name(c) }))} {...register('qb_chapter_id', { onChange: () => setValue('qb_topic_id', '') })} />
            <Select label={t('qb.topic')} placeholder={t('qb.none_option')} error={errors.qb_topic_id?.message}
              options={(chapter?.topics ?? []).map(tp => ({ value: String(tp.id), label: name(tp) }))} {...register('qb_topic_id')} />
            <Select label={t('qb.difficulty')} options={[1, 2, 3, 4, 5].map(d => ({ value: String(d), label: t(`qb.difficulty_level.${d}`) }))} {...register('difficulty')} />
            <Input label={t('qb.marks')} ltr inputMode="decimal" error={errors.marks?.message} {...register('marks')} />
            <Select label={t('qb.language')} options={[{ value: 'bn', label: 'বাংলা' }, { value: 'en', label: 'English' }]} {...register('language')} />
            <Textarea className="sm:col-span-2" label={t('qb.question')} rows={5} error={errors.question_text?.message} {...register('question_text', { required: t('super.required') })} />
            <Textarea className="sm:col-span-2" label={t('qb.answer')} error={errors.answer_text?.message} {...register('answer_text')} />
            <Textarea className="sm:col-span-2" label={t('qb.explanation')} error={errors.explanation_text?.message} {...register('explanation_text')} />
          </fieldset>
        </form>
        <div className="flex flex-wrap justify-end gap-2 pt-3">
          {canEdit && <Button type="submit" form="qb-question-form" loading={isSubmitting} data-action="save">{t('common.save')}</Button>}
          {canSubmit && <Button variant="secondary" onClick={() => act('submit')} loading={busy === 'submit'} data-action="submit">{t('qb.submit')}</Button>}
        </div>
      </Card>
      {canReview && (
        <Card className="flex flex-col gap-3" data-testid="review-actions">
          <h2 className="font-semibold">{t('qb.review')}</h2>
          <Textarea label={t('qb.reason')} hint={t('qb.reason_hint')} rows={2} value={reason} onChange={e => setReason(e.target.value)} name="reason" />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => act('reject', { reason })} loading={busy === 'reject'} data-action="reject">{t('qb.reject')}</Button>
            <Button onClick={() => act('publish')} loading={busy === 'publish'} data-action="publish">{t('qb.publish')}</Button>
          </div>
        </Card>
      )}
      {!isNew && (revs.data?.length ?? 0) > 0 && (
        <Card className="flex flex-col gap-2">
          <h2 className="font-semibold">{t('qb.revisions')}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {revs.data.map(r => <li key={r.id} className="flex flex-wrap gap-2"><span dir="auto">{r.edited_by ?? '—'}</span><span className="text-content-muted" dir="ltr">{r.created_at?.slice(0, 16).replace('T', ' ')}</span></li>)}
          </ul>
        </Card>
      )}
    </div>
  )
}
