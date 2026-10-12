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
import { Input, Select } from '../../components/FormField'
import QbStatus from '../../features/qb/QbStatus'
import { CurriculumSelects, EDITABLE, ReturnedNote, ReviewActions, uploadQbFile, useQbAction } from '../../features/qb/content'

const KINDS = ['pdf', 'book', 'slide']
const EMPTY = { kind: 'pdf', title_bn: '', title_en: '', qb_subject_id: '', qb_chapter_id: '', qb_topic_id: '', page_count: '', file: null, previews: [] }

// QB.5 /writer/resources/:id and /new (D65 §3গ): a slide, book or PDF - always uploaded as a PDF (private disk; the page count is
// read from it when it can be) - filed under the deepest place picked (topic, else chapter, else subject), with pictures of its
// first pages as the preview any institution may see. Reviewed like a question; the moderator opens the PDF before publishing.
export default function QbResourceEdit() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const role = useAuthStore(s => s.user?.role)
  const tree = useQuery({ queryKey: ['writer', 'curriculum'], queryFn: () => api.get('/writer/curriculum').then(r => r.data.data) })
  const r = useQuery({ queryKey: ['writer', 'resource', id], queryFn: () => api.get(`/writer/resources/${id}`).then(res => res.data.data), enabled: !isNew })
  const { register, handleSubmit, reset, watch, getValues, setValue, setError, formState: { errors, isSubmitting } } = useForm({ defaultValues: EMPTY })
  const { act, busy } = useQbAction(`/writer/resources/${id}`)
  useEffect(() => {
    if (!r.data || !tree.data) return
    const chapters = tree.data.subjects.flatMap(s => s.chapters.map(ch => ({ ...ch, subject: s.id })))
    const chapter = chapters.find(ch => ch.id === r.data.qb_chapter_id) ?? chapters.find(ch => ch.topics.some(tp => tp.id === r.data.qb_topic_id))
    const s = (x) => (x == null ? '' : String(x))
    reset({ ...EMPTY, ...r.data, title_en: s(r.data.title_en), page_count: s(r.data.page_count),
      qb_subject_id: s(r.data.qb_subject_id ?? chapter?.subject), qb_chapter_id: s(chapter?.id), qb_topic_id: s(r.data.qb_topic_id) })
  }, [r.data, tree.data, reset])

  if (tree.isPending || (!isNew && r.isPending)) return <Loader type="page" />
  if (tree.isError || r.isError) return <ErrorState onRetry={() => { tree.refetch(); r.refetch() }} />

  const status = isNew ? 'draft' : r.data.status
  const canEdit = role === 'super_admin' || (role === 'content_writer' && EDITABLE.includes(status))
  const canSubmit = !isNew && role !== 'content_moderator' && EDITABLE.includes(status)
  const canReview = !isNew && role !== 'content_writer' && status === 'review'
  const name = (n) => (locale === 'bn' ? n.name_bn : n.name_en) || n.name_en
  const v = watch()

  const pickPdf = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const m = file && await uploadQbFile('/writer/resource-files', file)
    if (!m) return
    setValue('file', m, { shouldDirty: true })
    if (m.page_count) setValue('page_count', String(m.page_count))
    if (m.previews?.length && !getValues('previews').length) setValue('previews', m.previews)   // D68: the server's own pictures of the first pages
  }
  const addPreview = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const m = file && await uploadQbFile('/writer/media', file)
    if (m) setValue('previews', [...getValues('previews'), m], { shouldDirty: true })
  }
  const save = async (f) => {
    if (!f.file) { setError('qb_media_id', { message: t('qb.pdf_needed') }); return }
    const place = f.qb_topic_id ? { qb_topic_id: Number(f.qb_topic_id) } : f.qb_chapter_id ? { qb_chapter_id: Number(f.qb_chapter_id) } : { qb_subject_id: Number(f.qb_subject_id) }
    const body = { kind: f.kind, title_bn: f.title_bn, title_en: f.title_en || null, qb_subject_id: null, qb_chapter_id: null, qb_topic_id: null, ...place,
      qb_media_id: f.file.id, page_count: Number(f.page_count), preview_media_ids: f.previews.map(m => m.id) }
    try {
      const { data } = isNew ? await api.post('/writer/resources', body) : await api.put(`/writer/resources/${id}`, body)
      useUiStore.getState().addToast(t('common.saved'))
      qc.invalidateQueries({ queryKey: ['writer'] })
      if (isNew) navigate(`/writer/resources/${data.data.id}`, { replace: true })
    } catch (e) {
      Object.entries(e.response?.data?.errors ?? {}).forEach(([k, m]) => setError(k.replace(/\.\d+.*$/, ''), { message: m[0] }))
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="qb-resource-edit">
      <PageHeader title={isNew ? t('qb.new_resources') : t('qb.resource_no', { id })} actions={!isNew && <QbStatus status={status} />} />
      <ReturnedNote status={status} note={r.data?.review_note} />
      <Card>
        <form id="qb-resource-form" onSubmit={handleSubmit(save)} className="grid gap-3 sm:grid-cols-2" noValidate>
          <fieldset disabled={!canEdit} className="contents">
            <Select label={t('qb.resource_kind')} options={KINDS.map(k => ({ value: k, label: t(`qb.kinds.${k}`) }))} {...register('kind')} />
            <Input label={t('qb.title_bn')} error={errors.title_bn?.message} {...register('title_bn', { required: t('super.required') })} />
            <Input label={t('qb.title_en')} ltr {...register('title_en')} />
            <CurriculumSelects tree={tree.data} register={register} watch={watch} setValue={setValue} errors={errors} name={name} />
            <p className="sm:col-span-2 text-xs text-content-muted">{t('qb.place_hint')}</p>
            <div className="sm:col-span-2 flex flex-col gap-2" data-testid="qb-pdf">
              <label className="text-sm"><span className="block mb-1 font-medium">{t('qb.pdf_file')}</span>
                <input type="file" accept="application/pdf" onChange={pickPdf} name="pdf" className="text-sm" /></label>
              {v.file && <a href={v.file.url} target="_blank" rel="noopener noreferrer" className="text-sm underline self-start" data-testid="qb-pdf-link">{t('qb.open_pdf')}</a>}
              {errors.qb_media_id && <p role="alert" className="text-xs font-medium text-content">{errors.qb_media_id.message}</p>}
            </div>
            <Input label={t('qb.page_count')} ltr inputMode="numeric" hint={t('qb.page_count_hint')} error={errors.page_count?.message}
              {...register('page_count', { required: t('super.required'), pattern: { value: /^[1-9]\d{0,3}$/, message: t('qb.page_count_hint') } })} />
            <fieldset className="sm:col-span-2 flex flex-col gap-2" data-testid="qb-previews">
              <legend className="font-semibold mb-1">{t('qb.preview_pages')}</legend>
              <p className="text-xs text-content-muted">{t('qb.preview_pages_hint')}</p>
              <ol className="flex flex-wrap gap-2">
                {v.previews.map((m, i) => (
                  <li key={m.id} className="flex flex-col items-center gap-1">
                    <img src={m.url} alt={t('qb.page_n', { n: i + 1 })} className="h-28 w-auto rounded-token [border:1px_solid_var(--line)]" />
                    <Button variant="secondary" onClick={() => setValue('previews', v.previews.filter(x => x.id !== m.id), { shouldDirty: true })}>{t('common.delete')}</Button>
                  </li>
                ))}
              </ol>
              {v.previews.length < 10 && <label className="text-sm"><span className="block mb-1">{t('qb.add_preview_page')}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={addPreview} name="preview" className="text-sm" /></label>}
              {errors.preview_media_ids && <p role="alert" className="text-xs font-medium text-content">{errors.preview_media_ids.message}</p>}
            </fieldset>
          </fieldset>
        </form>
        <div className="flex flex-wrap justify-end gap-2 pt-3">
          {canEdit && <Button type="submit" form="qb-resource-form" loading={isSubmitting} data-action="save">{t('common.save')}</Button>}
          {canSubmit && <Button variant="secondary" onClick={() => act('submit')} loading={busy === 'submit'} data-action="submit">{t('qb.submit')}</Button>}
        </div>
      </Card>
      {canReview && <ReviewActions act={act} busy={busy} />}
    </div>
  )
}
