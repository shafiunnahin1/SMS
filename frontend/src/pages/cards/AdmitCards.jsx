import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { Printer } from 'lucide-react'
import api from '../../api/axios'
import { useTerms } from '../../hooks/useTerms'
import { usePrint } from '../../hooks/usePrint'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'
import { useCrud } from '../../features/academic/useCrud'
import { useUiStore } from '../../store/uiStore'
import Ltr from '../../components/bidi/Ltr'

// D193 ADM.1 /admin/exams/admit-cards: per exam the admit-card settings (centre, instructions, open to students from a date)
// and the bulk PDF (optionally one batch). The server refuses (422) until every exam subject has its date.
export default function AdmitCards() {
  const { t } = useTranslation()
  const term = useTerms()
  const { list } = useCrud('exams')
  const batches = useCrud('batches').list
  const { preview, loading } = usePrint()
  const [examId, setExamId] = useState('')
  const [batchId, setBatchId] = useState('')
  const exam = (list.data ?? []).find(e => String(e.id) === examId)
  const { register, handleSubmit, reset, watch, formState: { isSubmitting } } = useForm()
  useEffect(() => {
    if (exam) reset({ admit_card_available: exam.admit_card_available, admit_card_from: exam.admit_card_from ?? '', exam_center: exam.exam_center ?? '', admit_card_instructions: exam.admit_card_instructions ?? '' })
  }, [exam, reset])
  const onSave = async (v) => {
    try {
      await api.put(`/exams/${exam.id}`, { name: exam.name, exam_type: exam.exam_type, academic_year: exam.academic_year, admit_card_available: Boolean(v.admit_card_available),
        admit_card_from: v.admit_card_from || null, exam_center: v.exam_center || null, admit_card_instructions: v.admit_card_instructions || null })
      useUiStore.getState().addToast(t('common.saved'))
      list.refetch()
    } catch { /* the interceptor shows the error */ }
  }
  // D197 AAD.1: the students the dues hold back (left out of the PDF)
  const blocked = useQuery({ queryKey: ['admit-blocked', exam?.id], enabled: Boolean(exam), queryFn: () => api.get(`/exams/${exam.id}/admit-cards/blocked`).then(r => r.data.data) })
  const examBatches = (batches.data ?? []).filter(b => exam && String(b.program_id ?? b.program?.id) === String(exam.program?.id))
  return (
    <div>
      <PageHeader title={t('cards.admit_title')} />
      {list.isPending && <Loader />}
      {list.isError && <ErrorState onRetry={() => list.refetch()} />}
      {list.data?.length === 0 && <EmptyState title={t('cards.no_exams')} />}
      {list.data?.length > 0 && (
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label={t('cards.exam')} placeholder={t('cards.choose_exam')} value={examId} onChange={e => { setExamId(e.target.value); setBatchId('') }}
              options={list.data.map(e => ({ value: String(e.id), label: `${e.name} (${e.academic_year}) — ${e.program?.name ?? ''}` }))} />
            {exam && !exam.batch && <Select label={term('batch')} placeholder={t('cards.all_batches')} value={batchId} onChange={e => setBatchId(e.target.value)}
              options={examBatches.map(b => ({ value: String(b.id), label: b.name }))} />}
          </div>
          {exam && (
            <form onSubmit={handleSubmit(onSave)} className="mt-4 grid gap-3 sm:grid-cols-2" noValidate>
              <Input label={t('cards.center')} {...register('exam_center')} />
              <Input type="date" ltr label={t('cards.open_from')} hint={t('cards.open_hint')} {...register('admit_card_from')} />
              <Textarea className="sm:col-span-2" label={t('cards.instructions')} {...register('admit_card_instructions')} />
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" className="h-4 w-4 accent-[var(--color-primary)]" {...register('admit_card_available')} />{t('cards.available')}</label>
              {watch('admit_card_available') && <p className="text-sm text-content-muted sm:col-span-2">{t('cards.available_hint')}</p>}
              <div className="sm:col-span-2 flex flex-wrap justify-end gap-2">
                <Button type="submit" variant="secondary" loading={isSubmitting}>{t('common.save')}</Button>
                <Button loading={loading} onClick={() => preview(`/exams/${exam.id}/admit-cards/bulk`, batchId ? { batch_id: batchId } : undefined)}>
                  <Printer aria-hidden="true" className="h-4 w-4" />{t('cards.print_admit')}
                </Button>
              </div>
            </form>
          )}
          {exam && blocked.data?.length > 0 && (
            <div className="mt-4" data-testid="admit-blocked">
              <h3 className="font-semibold">{t('due_block.blocked_list', { n: blocked.data.length })}</h3>
              <ul className="text-sm">{blocked.data.map(b => <li key={b.student_id} dir="auto">{b.name} · <Ltr>{b.code}</Ltr> · <Ltr>{b.due_amount}</Ltr></li>)}</ul>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
