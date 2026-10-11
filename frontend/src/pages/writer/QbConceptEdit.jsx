import { useEffect } from 'react'
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
import { Input, Textarea } from '../../components/FormField'
import QbStatus from '../../features/qb/QbStatus'
import MathText from '../../features/qb/MathText'
import MathInsert from '../../features/qb/MathInsert'
import { CurriculumSelects, EDITABLE, ReturnedNote, ReviewActions, uploadQbFile, useQbAction } from '../../features/qb/content'

const EMPTY = { qb_subject_id: '', qb_chapter_id: '', qb_topic_id: '', title_bn: '', title_en: '', body_text: '', media: [] }

// QB.5 /writer/concepts/:id and /new (D65 §3গ): a topic's concept - title, a body with $...$ maths, pictures - with a live preview;
// sent for review and published / returned like a question.
export default function QbConceptEdit() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const role = useAuthStore(s => s.user?.role)
  const tree = useQuery({ queryKey: ['writer', 'curriculum'], queryFn: () => api.get('/writer/curriculum').then(r => r.data.data) })
  const c = useQuery({ queryKey: ['writer', 'concept', id], queryFn: () => api.get(`/writer/concepts/${id}`).then(r => r.data.data), enabled: !isNew })
  const { register, handleSubmit, reset, watch, getValues, setValue, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: EMPTY })
  const { act, busy } = useQbAction(`/writer/concepts/${id}`)
  useEffect(() => {
    if (!c.data || !tree.data) return
    const chapter = tree.data.subjects.flatMap(s => s.chapters.map(ch => ({ ...ch, subject: s.id }))).find(ch => ch.topics.some(tp => tp.id === c.data.qb_topic_id))
    reset({ ...EMPTY, ...c.data, title_en: c.data.title_en ?? '', qb_subject_id: String(chapter?.subject ?? ''), qb_chapter_id: String(chapter?.id ?? ''), qb_topic_id: String(c.data.qb_topic_id) })
  }, [c.data, tree.data, reset])

  if (tree.isPending || (!isNew && c.isPending)) return <Loader type="page" />
  if (tree.isError || c.isError) return <ErrorState onRetry={() => { tree.refetch(); c.refetch() }} />

  const status = isNew ? 'draft' : c.data.status
  const canEdit = role === 'super_admin' || (role === 'content_writer' && EDITABLE.includes(status))
  const canSubmit = !isNew && role !== 'content_moderator' && EDITABLE.includes(status)
  const canReview = !isNew && role !== 'content_writer' && status === 'review'
  const name = (n) => (locale === 'bn' ? n.name_bn : n.name_en) || n.name_en
  const v = watch()

  const addPicture = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const m = file && await uploadQbFile('/writer/media', file)
    if (m) setValue('media', [...getValues('media'), m], { shouldDirty: true })
  }
  const save = async (f) => {
    const body = { qb_topic_id: Number(f.qb_topic_id), title_bn: f.title_bn, title_en: f.title_en || null, body_text: f.body_text, media_ids: f.media.map(m => m.id) }
    try {
      const { data } = isNew ? await api.post('/writer/concepts', body) : await api.put(`/writer/concepts/${id}`, body)
      useUiStore.getState().addToast(t('common.saved'))
      qc.invalidateQueries({ queryKey: ['writer'] })
      if (isNew) navigate(`/writer/concepts/${data.data.id}`, { replace: true })
    } catch (e) {
      Object.entries(e.response?.data?.errors ?? {}).forEach(([k, m]) => setError(k.replace(/\.\d+.*$/, ''), { message: m[0] }))
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="qb-concept-edit">
      <PageHeader title={isNew ? t('qb.new_concepts') : t('qb.concept_no', { id })} actions={!isNew && <QbStatus status={status} />} />
      <ReturnedNote status={status} note={c.data?.review_note} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <form id="qb-concept-form" onSubmit={handleSubmit(save)} className="grid gap-3 sm:grid-cols-2" noValidate>
            <fieldset disabled={!canEdit} className="contents">
              <CurriculumSelects tree={tree.data} register={register} watch={watch} setValue={setValue} errors={errors} name={name} topicRequired />
              <Input label={t('qb.title_bn')} error={errors.title_bn?.message} {...register('title_bn', { required: t('super.required') })} />
              <Input label={t('qb.title_en')} ltr error={errors.title_en?.message} {...register('title_en')} />
              <Textarea className="sm:col-span-2" label={t('qb.body')} rows={10} hint={t('qb.math_inline_hint')} error={errors.body_text?.message} {...register('body_text', { required: t('super.required') })} />
              <div className="sm:col-span-2"><MathInsert onInsert={(s) => setValue('body_text', `${getValues('body_text')}${getValues('body_text') ? ' ' : ''}${s}`, { shouldDirty: true })} disabled={!canEdit} /></div>
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
                <label className="text-sm"><span className="block mb-1">{t('qb.add_picture')}</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={addPicture} name="picture" className="text-sm" /></label>
                {errors.media_ids && <p role="alert" className="text-xs font-medium text-content">{errors.media_ids.message}</p>}
              </fieldset>
            </fieldset>
          </form>
          <div className="flex flex-wrap justify-end gap-2 pt-3">
            {canEdit && <Button type="submit" form="qb-concept-form" loading={isSubmitting} data-action="save">{t('common.save')}</Button>}
            {canSubmit && <Button variant="secondary" onClick={() => act('submit')} loading={busy === 'submit'} data-action="submit">{t('qb.submit')}</Button>}
          </div>
        </Card>
        <Card className="flex flex-col gap-3" data-testid="qb-preview" aria-live="polite">
          <h2 className="font-semibold">{t('qb.preview')}</h2>
          <h3 className="text-lg font-semibold" dir="auto">{v.title_bn}</h3>
          <MathText text={v.body_text} />
          {v.media.map(m => <img key={m.id} src={m.url} alt={t('qb.picture_n', { id: m.id })} className="max-h-48 w-auto self-start" />)}
        </Card>
      </div>
      {canReview && <ReviewActions act={act} busy={busy} />}
    </div>
  )
}
