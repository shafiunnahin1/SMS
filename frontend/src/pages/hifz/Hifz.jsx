import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useCrud } from '../../features/academic/useCrud'
import { usePrint } from '../../hooks/usePrint'
import { useTerms } from '../../hooks/useTerms'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'

const today = () => new Date().toISOString().slice(0, 10)
const blank = () => ({ record_date: today(), kind: 'sabaq', from_surah: '', from_ayah: '', to_surah: '', to_ayah: '', para_no: '', pages: '', quality: '', mistakes: '', remarks: '' })
const KINDS = ['sabaq', 'sabqi', 'manzil']

// D214 MAD.1 /admin|teacher/hifz: pick a batch -> its students with progress and the "behind" mark; pick a student -> quick entry
// (surah:ayah range, pages, quality, mistakes), the timeline and the monthly PDF
export default function Hifz() {
  const { t } = useTranslation()
  const term = useTerms()
  const batches = useCrud('batches').list
  const [batchId, setBatchId] = useState('')
  const [student, setStudent] = useState(null)
  const overview = useQuery({ queryKey: ['hifz', 'overview', batchId], enabled: !!batchId, queryFn: () => api.get(`/hifz/batches/${batchId}/overview`).then(r => r.data.data) })
  const options = (batches.data ?? []).map(b => ({ value: String(b.id), label: (b.program?.name ? `${b.program.name} — ` : '') + b.name }))
  return (
    <div className="flex flex-col gap-4" data-testid="hifz">
      <PageHeader title={t('hifz.title')} />
      <Card>
        <Select name="batch" label={term('batch')} placeholder={t('hifz.pick_batch', { batch: term('batch') })} options={options} value={batchId} onChange={(e) => { setBatchId(e.target.value); setStudent(null) }} />
      </Card>
      {batchId && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            {overview.isLoading ? <Loader /> : overview.isError ? <ErrorState onRetry={overview.refetch} /> : !overview.data.students.length ? <EmptyState /> : (
              <ul className="flex flex-col divide-y divide-line text-sm" data-testid="hifz-students">
                {overview.data.students.map(row => (
                  <li key={row.student.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-medium">{row.student.name}</span> <Ltr>({row.student.student_id})</Ltr>
                      <span className="block text-content-muted">{t('hifz.progress', { paras: row.paras, percent: row.percent })}{row.stale ? ` · ${t('hifz.behind', { days: overview.data.stale_days })}` : ''}</span>
                    </span>
                    <Button variant={student?.id === row.student.id ? 'primary' : 'ghost'} onClick={() => setStudent(row.student)} data-action="open">{t('hifz.open')}</Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {student && <StudentPanel key={student.id} student={student} />}
        </div>
      )}
    </div>
  )
}

function StudentPanel({ student }) {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const { preview, loading } = usePrint()
  const [f, setF] = useState(blank)
  const [busy, setBusy] = useState(false)
  const q = useQuery({ queryKey: ['hifz', 'student', student.id], queryFn: () => api.get(`/hifz/students/${student.id}/progress`).then(r => r.data.data) })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const num = (v) => (v === '' ? null : Number(v))
  const refresh = () => qc.invalidateQueries({ queryKey: ['hifz'] })
  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api.post('/hifz/records', { student_id: student.id, record_date: f.record_date, kind: f.kind, from_surah: num(f.from_surah), from_ayah: num(f.from_ayah), to_surah: num(f.to_surah), to_ayah: num(f.to_ayah),
        para_no: num(f.para_no), pages: num(f.pages), quality: num(f.quality), mistakes: num(f.mistakes), remarks: f.remarks || null })
      setF({ ...blank(), record_date: f.record_date, kind: f.kind })
    } catch { /* the interceptor shows the error */ } finally { setBusy(false); refresh() }
  }
  const remove = (r) => useUiStore.getState().openConfirm({ title: t('hifz.delete'), description: t('hifz.delete_confirm'),
    onConfirm: async () => { try { await api.delete(`/hifz/records/${r.id}`) } catch { /* the interceptor shows the error */ } finally { refresh() } } })
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-semibold">{student.name}</h2>
      <form className="flex flex-col gap-3" onSubmit={save} data-testid="hifz-form">
        <div className="grid gap-2 grid-cols-2">
          <Input name="record_date" type="date" label={t('hifz.date')} value={f.record_date} onChange={set('record_date')} required />
          <Select name="kind" label={t('hifz.kind')} options={KINDS.map(k => ({ value: k, label: t(`hifz.kinds.${k}`) }))} value={f.kind} onChange={set('kind')} />
          <Input name="from_surah" type="number" min="1" max="114" label={t('hifz.from_surah')} value={f.from_surah} onChange={set('from_surah')} required ltr />
          <Input name="from_ayah" type="number" min="1" label={t('hifz.from_ayah')} value={f.from_ayah} onChange={set('from_ayah')} required ltr />
          <Input name="to_surah" type="number" min="1" max="114" label={t('hifz.to_surah')} value={f.to_surah} onChange={set('to_surah')} required ltr />
          <Input name="to_ayah" type="number" min="1" label={t('hifz.to_ayah')} value={f.to_ayah} onChange={set('to_ayah')} required ltr />
          <Input name="pages" type="number" min="0" step="0.5" label={t('hifz.pages')} value={f.pages} onChange={set('pages')} ltr />
          <Input name="para_no" type="number" min="1" max="30" label={t('hifz.para')} value={f.para_no} onChange={set('para_no')} ltr />
          <Input name="quality" type="number" min="1" max="5" label={t('hifz.quality')} value={f.quality} onChange={set('quality')} ltr />
          <Input name="mistakes" type="number" min="0" label={t('hifz.mistakes')} value={f.mistakes} onChange={set('mistakes')} ltr />
        </div>
        <Input name="remarks" label={t('hifz.remarks')} value={f.remarks} onChange={set('remarks')} maxLength={255} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy} data-action="save">{t('hifz.save')}</Button>
          <Button variant="ghost" disabled={loading} onClick={() => preview('/hifz/reports/monthly.pdf', { student_id: student.id, month: f.record_date.slice(0, 7) })} data-action="pdf">{t('hifz.monthly_pdf')}</Button>
        </div>
      </form>
      {q.isLoading ? <Loader /> : q.isError ? <ErrorState onRetry={q.refetch} /> : <Timeline data={q.data} locale={locale} onDelete={remove} />}
    </Card>
  )
}

export function Timeline({ data, locale, onDelete }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2" data-testid="hifz-timeline">
      <p className="text-sm">{t('hifz.progress_full', { paras: data.progress.paras, percent: data.progress.percent, pages: data.progress.pages })}</p>
      {!data.timeline.length ? <p className="text-sm text-content-muted">{t('hifz.no_records')}</p> : (
        <ul className="flex flex-col divide-y divide-line text-sm">
          {data.timeline.map(r => (
            <li key={r.id} className="py-1 flex flex-wrap items-center justify-between gap-2">
              <span>{fmtDate(r.record_date, locale)} · {t(`hifz.kinds.${r.kind}`)} · <Ltr>{r.from[0]}:{r.from[1]} – {r.to[0]}:{r.to[1]}</Ltr>
                {r.pages != null ? ` · ${t('hifz.n_pages', { n: r.pages })}` : ''}{r.quality != null ? ` · ${t('hifz.quality_n', { n: r.quality })}` : ''}{r.mistakes != null ? ` · ${t('hifz.mistakes_n', { n: r.mistakes })}` : ''}
                {r.remarks ? ` · ${r.remarks}` : ''}</span>
              {onDelete && <Button variant="ghost" onClick={() => onDelete(r)} data-action="delete">{t('hifz.delete')}</Button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
