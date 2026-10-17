import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { multipart } from '../students/formData'
import { useUiStore } from '../../store/uiStore'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { Select, Textarea } from '../../components/FormField'

// QB.5 (D65): pieces shared by the concept and resource pages of the writers' panel - the place in the curriculum, a file upload,
// and the review actions (send for review; publish / return with a reason).
export const EDITABLE = ['draft', 'rejected']

/** POST a file to the writers' panel; the stored media row, or null (the error is shown) */
export async function uploadQbFile(path, file) {
  const form = new FormData()
  form.append('file', file)
  try {
    return (await api.post(path, form, multipart)).data.data
  } catch (err) {
    useUiStore.getState().addToast(err.response?.data?.errors?.file?.[0] ?? err.response?.data?.message, 'error')
    return null
  }
}

/** Subject → chapter → topic selects over the curriculum tree (form fields qb_subject_id / qb_chapter_id / qb_topic_id) */
export function CurriculumSelects({ tree, register, watch, setValue, errors, name, topicRequired = false }) {
  const { t } = useTranslation()
  const subject = tree.subjects.find(s => String(s.id) === String(watch('qb_subject_id')))
  const chapter = subject?.chapters.find(c => String(c.id) === String(watch('qb_chapter_id')))
  return <>
    <Select label={t('qb.subject')} placeholder={t('qb.pick')} error={errors.qb_subject_id?.message} options={tree.subjects.map(s => ({ value: String(s.id), label: name(s) }))}
      {...register('qb_subject_id', { required: topicRequired ? t('super.required') : false, onChange: () => { setValue('qb_chapter_id', ''); setValue('qb_topic_id', '') } })} />
    <Select label={t('qb.chapter')} placeholder={topicRequired ? t('qb.pick') : t('qb.none_option')} error={errors.qb_chapter_id?.message}
      options={(subject?.chapters ?? []).map(c => ({ value: String(c.id), label: name(c) }))} {...register('qb_chapter_id', { onChange: () => setValue('qb_topic_id', '') })} />
    <Select label={t('qb.topic')} placeholder={topicRequired ? t('qb.pick') : t('qb.none_option')} error={errors.qb_topic_id?.message}
      options={(chapter?.topics ?? []).map(tp => ({ value: String(tp.id), label: name(tp) }))} {...register('qb_topic_id', { required: topicRequired ? t('super.required') : false })} />
  </>
}

/** The note a moderator left when returning the item */
export function ReturnedNote({ status, note }) {
  const { t } = useTranslation()
  if (status !== 'rejected' || !note) return null
  return (
    <Card className="flex flex-col gap-1" data-testid="review-note" role="status">
      <h2 className="font-semibold">{t('qb.returned')}</h2>
      <p dir="auto" className="text-sm">{note}</p>
    </Card>
  )
}

/** submit / publish / reject on `${base}/{action}` - toasts the result and refreshes the writers' panel queries */
export function useQbAction(base) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(null)
  const act = async (action, body) => {
    setBusy(action)
    try {
      await api.post(`${base}/${action}`, body)
      useUiStore.getState().addToast(t(`qb.done.${action}`))
      qc.invalidateQueries({ queryKey: ['writer'] })
      return true
    } catch (e) {
      if (e.response?.status === 422) useUiStore.getState().addToast(Object.values(e.response.data.errors ?? {})[0]?.[0] ?? e.response.data.message, 'error')
      return false
    } finally { setBusy(null) }
  }
  return { act, busy }
}

/** The moderator's (or Super Admin's) card: return with a reason, or publish */
export function ReviewActions({ act, busy }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  return (
    <Card className="flex flex-col gap-3" data-testid="review-actions">
      <h2 className="font-semibold">{t('qb.review')}</h2>
      <Textarea label={t('qb.reason')} hint={t('qb.reason_hint')} rows={2} value={reason} onChange={e => setReason(e.target.value)} name="reason" />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={async () => { if (await act('reject', { reason })) setReason('') }} loading={busy === 'reject'} data-action="reject">{t('qb.reject')}</Button>
        <Button onClick={() => act('publish')} loading={busy === 'publish'} data-action="publish">{t('qb.publish')}</Button>
      </div>
    </Card>
  )
}
