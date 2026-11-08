import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { Plus, Pencil, Trash2, Printer } from 'lucide-react'
import { useTerms } from '../../hooks/useTerms'
import { usePrint } from '../../hooks/usePrint'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Modal from '../../ui/variants/Modal'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'
import { useCrud, clean } from '../../features/academic/useCrud'
import WeekView, { DAYS } from './WeekView'

// D193 RTN.1 /admin/academic/routine: pick a class (and batch), see the week, add / edit / remove slots; the server refuses a
// teacher, class or room clash (the message names it). Print = A4 landscape PDF.
export default function RoutineBuilder() {
  const { t } = useTranslation()
  const term = useTerms()
  const { preview, loading } = usePrint()
  const [programId, setProgramId] = useState('')
  const [batchId, setBatchId] = useState('')
  const programs = useCrud('programs').list
  const batches = useCrud('batches').list
  const subjects = useCrud('subjects', { params: { program_id: programId }, enabled: Boolean(programId) }).list
  const teachers = useCrud('teachers').list
  const qc = useQueryClient()
  const { list, remove } = useCrud('routines', { params: { program_id: programId, ...(batchId ? { batch_id: batchId } : {}) }, enabled: Boolean(programId) })
  const [editing, setEditing] = useState(null)
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm()
  const open = (row) => { reset(row?.id ? { ...row, batch_id: row.batch_id ?? '' } : { day_of_week: 'sun', batch_id: batchId }); setEditing(row ?? {}) }
  const onSubmit = async (v) => {
    const body = clean({ program_id: Number(programId), batch_id: v.batch_id ? Number(v.batch_id) : null, subject_id: Number(v.subject_id), teacher_id: Number(v.teacher_id),
      day_of_week: v.day_of_week, start_time: v.start_time, end_time: v.end_time, room_no: v.room_no || null })
    try {
      if (editing?.id) await api.put(`/routines/${editing.id}`, body); else await api.post('/routines', body)
      useUiStore.getState().addToast(t('common.saved'))
      qc.invalidateQueries({ queryKey: ['routines'] })
      setEditing(null)
    } catch (e) {
      const errs = e.response?.data?.errors
      if (errs) Object.entries(errs).forEach(([f, m]) => setError(f, { message: m[0] }))
      else if (e.response?.status === 422) useUiStore.getState().addToast(e.response.data.message, 'error')   // routine_conflict names the clash
    }
  }
  const progBatches = (batches.data ?? []).filter(b => String(b.program_id ?? b.program?.id) === programId)
  return (
    <div>
      <PageHeader title={t('routine.title')} actions={programId && (
        <span className="flex flex-wrap gap-2">
          <Button variant="secondary" loading={loading} onClick={() => preview(`/routines/${programId}/print`, batchId ? { batch_id: batchId } : undefined)}><Printer aria-hidden="true" className="h-4 w-4" />{t('routine.print')}</Button>
          <Button onClick={() => open()}><Plus aria-hidden="true" className="h-4 w-4" />{t('routine.add')}</Button>
        </span>
      )} />
      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={term('program')} placeholder={t('routine.choose')} value={programId} onChange={e => { setProgramId(e.target.value); setBatchId('') }}
            options={(programs.data ?? []).map(p => ({ value: String(p.id), label: p.name }))} />
          <Select label={term('batch')} placeholder={t('routine.all_batches')} value={batchId} disabled={!programId} onChange={e => setBatchId(e.target.value)}
            options={progBatches.map(b => ({ value: String(b.id), label: b.name }))} />
        </div>
      </Card>
      <div className="mt-3">
        {!programId && <EmptyState title={t('routine.pick')} />}
        {programId && list.isPending && <Loader />}
        {programId && list.isError && <ErrorState onRetry={() => list.refetch()} />}
        {programId && list.data && <WeekView rows={list.data} render={r => (
          <span className="mt-1 flex gap-1">
            <Button variant="ghost" onClick={() => open(r)} aria-label={`${t('common.edit')} ${r.subject}`}><Pencil aria-hidden="true" className="h-4 w-4" /></Button>
            <Button variant="ghost" onClick={() => remove({ ...r, name: `${r.subject} ${r.start_time}` })} aria-label={`${t('common.delete')} ${r.subject}`}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>
          </span>
        )} />}
      </div>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={t(editing?.id ? 'routine.edit' : 'routine.add')}>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2" noValidate>
          <Select label={term('batch')} placeholder={t('routine.all_batches')} error={errors.batch_id?.message} options={progBatches.map(b => ({ value: String(b.id), label: b.name }))} {...register('batch_id')} />
          <Select label={t('routine.day')} error={errors.day_of_week?.message} options={DAYS.map(d => ({ value: d, label: t(`routine.days.${d}`) }))} {...register('day_of_week')} />
          <Select label={t('routine.subject')} placeholder={t('routine.choose')} error={errors.subject_id?.message} options={(subjects.data ?? []).map(x => ({ value: String(x.id), label: x.name }))} {...register('subject_id', { required: t('routine.subject') })} />
          <Select label={t('routine.teacher')} placeholder={t('routine.choose')} error={errors.teacher_id?.message} options={(teachers.data ?? []).map(x => ({ value: String(x.id), label: x.name ?? x.user?.name ?? x.employee_id }))} {...register('teacher_id', { required: t('routine.teacher') })} />
          <Input type="time" ltr label={t('routine.start')} error={errors.start_time?.message} {...register('start_time', { required: t('routine.start') })} />
          <Input type="time" ltr label={t('routine.end')} error={errors.end_time?.message} {...register('end_time', { required: t('routine.end') })} />
          <Input label={t('routine.room')} error={errors.room_no?.message} {...register('room_no')} />
          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
            <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
