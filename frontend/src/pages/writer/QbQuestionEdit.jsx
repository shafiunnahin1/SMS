import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useFieldArray, useForm } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import api from '../../api/axios'
import { multipart } from '../../features/students/formData'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'
import Check from '../../features/academic/Check'
import QbStatus from '../../features/qb/QbStatus'
import MathText from '../../features/qb/MathText'
import MathInsert from '../../features/qb/MathInsert'
import { STRUCTURED_EMPTY, StructuredEditor, StructuredPreview, fromQuestion, toPayload } from '../../features/qb/Structured'

const EDITABLE = ['draft', 'rejected']
const BN_LABELS = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ']
const LEVELS = ['knowledge', 'understanding', 'application', 'higher_order']
const CREATIVE = LEVELS.map((level, i) => ({ part_label: BN_LABELS[i], cognitive_level: level, marks: String(i + 1), question_text: '', answer_text: '' }))
const EMPTY = { qb_question_type_id: '', qb_subject_id: '', qb_chapter_id: '', qb_topic_id: '', difficulty: '3', marks: '1', language: 'bn', question_text: '',
  answer_text: '', explanation_text: '', options: [], creative_parts: [], occurrences: [], media: [], structured: STRUCTURED_EMPTY }

// QB.2 + QB.3 /writer/questions/:id and /new (D65, D66): one form for the six core types. Shared fields (place in the curriculum,
// text, answer, explanation), then the type's own part: options with the right one (mcq), the two fixed options (true / false),
// the four creative parts ক-ঘ, a ___ blank (fill in the blank); pictures on the private disk; maths as $...$ built with mathlive;
// a live preview. A writer edits only a draft or a returned question; a moderator reviews; the Super Admin may do both.
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
  const { register, control, handleSubmit, reset, watch, getValues, setError, setValue, formState: { errors, isSubmitting } } = useForm({ defaultValues: EMPTY })
  const options = useFieldArray({ control, name: 'options' })
  const parts = useFieldArray({ control, name: 'creative_parts' })
  const occurrences = useFieldArray({ control, name: 'occurrences' })
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(null)
  useEffect(() => {
    if (!q.data) return
    const s = (v) => (v == null ? '' : String(v))
    reset({ ...EMPTY, ...q.data, qb_question_type_id: s(q.data.qb_question_type_id), qb_subject_id: s(q.data.qb_subject_id), qb_chapter_id: s(q.data.qb_chapter_id),
      qb_topic_id: s(q.data.qb_topic_id), difficulty: s(q.data.difficulty), marks: s(q.data.marks), answer_text: s(q.data.answer_text), explanation_text: s(q.data.explanation_text),
      creative_parts: q.data.creative_parts.map(p => ({ ...p, marks: s(p.marks), answer_text: s(p.answer_text) })),
      occurrences: q.data.occurrences.map(o => ({ ...o, year: s(o.year) })), structured: fromQuestion(q.data) })
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
  const picked = types.data.find(ty => String(ty.id) === String(watch('qb_question_type_id')))
  const family = picked?.family
  const structure = picked?.structure ?? null                    // QB.4: gap / match / order / passage / passage_mcq
  const optionsFor = ['mcq', 'true_false'].includes(family) && !structure
  const num = (v) => (v === '' || v == null ? null : Number(v))
  const append = (field) => (snippet) => setValue(field, `${getValues(field) ?? ''}${getValues(field) ? ' ' : ''}${snippet}`, { shouldDirty: true })
  const v = watch()

  const pickType = (e) => {                    // a type's own part starts filled in, so the writer only types the content
    const fam = types.data.find(ty => String(ty.id) === e.target.value)?.family
    if (fam === 'true_false' && getValues('options').length === 0) setValue('options', [{ label: 'T', content_text: t('qb.true'), is_correct: true }, { label: 'F', content_text: t('qb.false'), is_correct: false }])
    if (fam === 'mcq' && !types.data.find(ty => String(ty.id) === e.target.value)?.structure && getValues('options').length === 0) setValue('options', BN_LABELS.slice(0, 4).map((l, i) => ({ label: l, content_text: '', is_correct: i === 0 })))
    if (fam === 'creative' && getValues('creative_parts').length === 0) setValue('creative_parts', CREATIVE)
  }

  const upload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const form = new FormData()
    form.append('file', file)
    try {
      const { data } = await api.post('/writer/media', form, multipart)
      setValue('media', [...getValues('media'), data.data], { shouldDirty: true })
    } catch (err) {
      useUiStore.getState().addToast(err.response?.data?.errors?.file?.[0] ?? err.response?.data?.message, 'error')
    }
  }

  const save = async (f) => {
    const body = { qb_question_type_id: num(f.qb_question_type_id), qb_subject_id: num(f.qb_subject_id), qb_chapter_id: num(f.qb_chapter_id), qb_topic_id: num(f.qb_topic_id),
      difficulty: Number(f.difficulty), marks: f.marks, language: f.language, content_mode: /\$[^$]+\$/.test(f.question_text) ? 'rich_math' : 'plain_text',
      question_text: f.question_text, answer_text: f.answer_text || null, explanation_text: f.explanation_text || null,
      options: optionsFor ? f.options.map(o => ({ label: o.label, content_text: o.content_text, is_correct: Boolean(o.is_correct) })) : [],
      creative_parts: family === 'creative' ? f.creative_parts.map(p => ({ ...p, answer_text: p.answer_text || null })) : [],
      occurrences: f.occurrences.map(o => ({ board: o.board || null, exam_type: o.exam_type || null, institution_name: o.institution_name || null, year: num(o.year) })),
      media_ids: f.media.map(m => m.id), ...toPayload(structure, f.structured) }
    try {
      const { data } = isNew ? await api.post('/writer/questions', body) : await api.put(`/writer/questions/${id}`, body)
      useUiStore.getState().addToast(t('common.saved'))
      qc.invalidateQueries({ queryKey: ['writer'] })
      if (isNew) navigate(`/writer/questions/${data.data.id}`, { replace: true })
    } catch (e) {
      Object.entries(e.response?.data?.errors ?? {}).forEach(([k, m]) => setError(k.replace(/\.\d+.*$/, ''), { message: m[0] }))
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
      if (e.response?.status === 422) useUiStore.getState().addToast(Object.values(e.response.data.errors ?? {})[0]?.[0] ?? e.response.data.message, 'error')
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
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <form id="qb-question-form" onSubmit={handleSubmit(save)} className="grid gap-3 sm:grid-cols-2" noValidate>
            <fieldset disabled={!canEdit} className="contents">
              <Select label={t('qb.type')} placeholder={t('qb.pick')} error={errors.qb_question_type_id?.message}
                options={types.data.map(ty => ({ value: String(ty.id), label: name(ty) }))} {...register('qb_question_type_id', { required: t('super.required'), onChange: pickType })} />
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
              <Textarea className="sm:col-span-2" label={family === 'creative' ? t('qb.stem') : t('qb.question')} rows={5}
                hint={family === 'fill_gap' ? t('qb.blank_hint') : t('qb.math_inline_hint')} error={errors.question_text?.message} {...register('question_text', { required: t('super.required') })} />
              <div className="sm:col-span-2 flex flex-wrap gap-2"><MathInsert onInsert={append('question_text')} disabled={!canEdit} /></div>

              {optionsFor && (
                <fieldset className="sm:col-span-2 flex flex-col gap-2" data-testid="qb-options">
                  <legend className="font-semibold mb-1">{t('qb.options')}</legend>
                  {options.fields.map((f, i) => (
                    <div key={f.id} className="flex flex-wrap items-end gap-2">
                      <Input className="w-16" label={t('qb.label')} {...register(`options.${i}.label`)} readOnly={family === 'true_false'} />
                      <Input className="flex-1 min-w-40" label={t('qb.option_text')} {...register(`options.${i}.content_text`)} readOnly={family === 'true_false'} />
                      <Check label={t('qb.correct')} {...register(`options.${i}.is_correct`, family === 'true_false'
                        ? { onChange: (e) => { if (e.target.checked) options.fields.forEach((_, j) => j !== i && setValue(`options.${j}.is_correct`, false)) } } : {})} />
                      {family === 'mcq' && <Button variant="secondary" onClick={() => options.remove(i)} aria-label={t('common.delete')}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>}
                    </div>
                  ))}
                  {family === 'mcq' && options.fields.length < 8 && (
                    <div><Button variant="secondary" onClick={() => options.append({ label: BN_LABELS[options.fields.length], content_text: '', is_correct: false })}>
                      <Plus aria-hidden="true" className="h-4 w-4" />{t('qb.add_option')}</Button></div>
                  )}
                  {errors.options && <p role="alert" className="text-xs font-medium text-content">{errors.options.message}</p>}
                </fieldset>
              )}

              {family === 'creative' && (
                <fieldset className="sm:col-span-2 flex flex-col gap-3" data-testid="qb-parts">
                  <legend className="font-semibold mb-1">{t('qb.parts')}</legend>
                  {parts.fields.map((f, i) => (
                    <div key={f.id} className="grid gap-2 sm:grid-cols-4 rounded-token [border:1px_solid_var(--line)] p-2">
                      <Input label={t('qb.label')} {...register(`creative_parts.${i}.part_label`)} />
                      <Select label={t('qb.level')} options={LEVELS.map(l => ({ value: l, label: t(`qb.levels_cog.${l}`) }))} {...register(`creative_parts.${i}.cognitive_level`)} />
                      <Input label={t('qb.marks')} ltr inputMode="decimal" {...register(`creative_parts.${i}.marks`)} />
                      <Textarea className="sm:col-span-4" label={t('qb.part_question')} rows={2} {...register(`creative_parts.${i}.question_text`)} />
                      <Textarea className="sm:col-span-4" label={t('qb.answer')} rows={2} {...register(`creative_parts.${i}.answer_text`)} />
                    </div>
                  ))}
                  {errors.creative_parts && <p role="alert" className="text-xs font-medium text-content">{errors.creative_parts.message}</p>}
                </fieldset>
              )}

              <StructuredEditor structure={structure} register={register} control={control} error={errors.items?.message} />

              {!['mcq', 'true_false', 'creative'].includes(family) && !structure && <>
                <Textarea className="sm:col-span-2" label={t('qb.answer')} error={errors.answer_text?.message} {...register('answer_text')} />
                <div className="sm:col-span-2"><MathInsert onInsert={append('answer_text')} disabled={!canEdit} /></div>
              </>}
              <Textarea className="sm:col-span-2" label={t('qb.explanation')} error={errors.explanation_text?.message} {...register('explanation_text')} />

              <fieldset className="sm:col-span-2 flex flex-col gap-2">
                <legend className="font-semibold mb-1">{t('qb.pictures')}</legend>
                <div className="flex flex-wrap gap-2">
                  {v.media.map(m => (
                    <figure key={m.id} className="flex flex-col items-center gap-1">
                      <img src={m.url} alt={t('qb.picture_n', { id: m.id })} className="h-20 w-auto rounded-token [border:1px_solid_var(--line)]" />
                      <Button variant="secondary" onClick={() => setValue('media', v.media.filter(x => x.id !== m.id), { shouldDirty: true })}>{t('common.delete')}</Button>
                    </figure>
                  ))}
                </div>
                <label className="text-sm">
                  <span className="block mb-1">{t('qb.add_picture')}</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={upload} name="picture" className="text-sm" />
                </label>
                {errors.media_ids && <p role="alert" className="text-xs font-medium text-content">{errors.media_ids.message}</p>}
              </fieldset>

              <fieldset className="sm:col-span-2 flex flex-col gap-2">
                <legend className="font-semibold mb-1">{t('qb.occurrences')}</legend>
                {occurrences.fields.map((f, i) => (
                  <div key={f.id} className="flex flex-wrap items-end gap-2">
                    <Input className="w-32" label={t('qb.board')} {...register(`occurrences.${i}.board`)} />
                    <Input className="w-28" label={t('qb.exam_type')} {...register(`occurrences.${i}.exam_type`)} />
                    <Input className="w-24" label={t('qb.year')} ltr inputMode="numeric" {...register(`occurrences.${i}.year`)} />
                    <Button variant="secondary" onClick={() => occurrences.remove(i)} aria-label={t('common.delete')}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>
                  </div>
                ))}
                <div><Button variant="secondary" onClick={() => occurrences.append({ board: '', exam_type: '', year: '' })}><Plus aria-hidden="true" className="h-4 w-4" />{t('qb.add_occurrence')}</Button></div>
              </fieldset>
            </fieldset>
          </form>
          <div className="flex flex-wrap justify-end gap-2 pt-3">
            {canEdit && <Button type="submit" form="qb-question-form" loading={isSubmitting} data-action="save">{t('common.save')}</Button>}
            {canSubmit && <Button variant="secondary" onClick={() => act('submit')} loading={busy === 'submit'} data-action="submit">{t('qb.submit')}</Button>}
          </div>
        </Card>

        <Card className="flex flex-col gap-3" data-testid="qb-preview" aria-live="polite">
          <h2 className="font-semibold">{t('qb.preview')}</h2>
          <p className="text-base"><MathText text={v.question_text} /></p>
          {v.media.map(m => <img key={m.id} src={m.url} alt={t('qb.picture_n', { id: m.id })} className="max-h-48 w-auto self-start" />)}
          <StructuredPreview structure={structure} s={v.structured} />
          {optionsFor && (
            <ol className="flex flex-col gap-1">
              {v.options.map((o, i) => <li key={i} className="flex gap-2"><span className="font-medium">{o.label}.</span><MathText text={o.content_text} />{o.is_correct && <span className="text-xs text-content-muted">({t('qb.correct')})</span>}</li>)}
            </ol>
          )}
          {family === 'creative' && (
            <ol className="flex flex-col gap-2">
              {v.creative_parts.map((p, i) => <li key={i}><span className="font-medium">{p.part_label}.</span> <MathText text={p.question_text} /> <span className="text-xs text-content-muted">[{p.marks}]</span></li>)}
            </ol>
          )}
          {v.answer_text && <div className="text-sm"><span className="font-medium">{t('qb.answer')}: </span><MathText text={v.answer_text} /></div>}
          {v.explanation_text && <div className="text-sm text-content-muted"><MathText text={v.explanation_text} /></div>}
        </Card>
      </div>

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
