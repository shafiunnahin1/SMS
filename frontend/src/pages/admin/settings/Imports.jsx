import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Upload as UploadIcon, Play, RotateCcw } from 'lucide-react'
import DirIcon from '../../../components/DirIcon'
import api from '../../../api/axios'
import { useTerms } from '../../../hooks/useTerms'
import { useUiStore } from '../../../store/uiStore'
import { fmtDate } from '../../../i18n/format'
import { useLocale } from '../../../ui/I18nProvider'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import Loader from '../../../components/Loader'
import FileUpload from '../../../components/FileUpload'
import StatCard from '../../../ui/variants/StatCard'
import List from '../../../ui/variants/List'
import { ErrorState } from '../../../components/StateViews'
import { Select } from '../../../components/FormField'
import Ltr from '../../../components/bidi/Ltr'

// D193 MIG.1: every kind of data-migration.md section 1 - its fields and the required ones (the server checks the same)
export const KINDS = {
  students: { fields: ['name', 'guardian_phone', 'batch', 'student_id', 'roll_no', 'gender', 'date_of_birth', 'father_name', 'mother_name', 'address', 'admission_date', 'studying_at'], required: ['name', 'guardian_phone', 'batch'] },
  teachers: { fields: ['name', 'phone', 'employee_id', 'email', 'designation', 'department', 'joining_date'], required: ['name', 'phone'] },
  fee_structure: { fields: ['program', 'batch', 'fee_category', 'amount'], required: ['program', 'fee_category', 'amount'] },
  fee_history: { fields: ['student_id', 'fee_category', 'amount', 'paid_at', 'receipt_no', 'month', 'payment_method'], required: ['student_id', 'fee_category', 'amount', 'paid_at', 'receipt_no'] },
  results: { fields: ['exam_name', 'academic_year', 'student_id', 'subject', 'marks', 'is_absent'], required: ['exam_name', 'student_id', 'subject', 'marks'] },
  attendance: { fields: ['student_id', 'date', 'status', 'batch', 'note'], required: ['student_id', 'date', 'status'] },
}
const err = (e) => useUiStore.getState().addToast(e.response?.data?.errors ? Object.values(e.response.data.errors)[0][0] : e.response?.data?.message, 'error')

// Step 4.2 /admin/settings/imports (docs/modules/data-migration.md): upload -> match columns -> check (writes nothing) -> run -> undo
// within 7 days. D193 MIG.1: students, teachers, fee structure, fee history, results and attendance; a rollback never removes
// imported money or results (D32) - those rows are listed as kept.
export default function Imports() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const [jobId, setJobId] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [kind, setKind] = useState('students')
  const term = useTerms()
  const jobs = useQuery({ queryKey: ['imports'], queryFn: () => api.get('/imports').then(r => r.data.data) })

  const upload = async ([file]) => {
    setUploading(true)
    try {
      const fd = new FormData(); fd.append('kind', kind); fd.append('file', file)
      const { data } = await api.post('/imports', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      qc.invalidateQueries({ queryKey: ['imports'] })
      setJobId(data.data.id)
    } catch (e) { err(e) } finally { setUploading(false) }
  }
  if (jobId) return <ImportJob id={jobId} onBack={() => { setJobId(null); qc.invalidateQueries({ queryKey: ['imports'] }) }} />
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('imports.title')} actions={
        <a href={`/api/v1/imports/templates/${kind}.xlsx`} className="inline-flex items-center gap-2 h-10 px-4 rounded-token bg-surface text-content text-sm font-medium [border:1px_solid_var(--line)] hover:bg-surface-muted">
          <Download aria-hidden="true" className="h-4 w-4" />{t('imports.template')}</a>} />
      <Card className="flex flex-col gap-3">
        <p className="text-sm text-content-muted">{t('imports.intro')}</p>
        <Select label={t('imports.kind')} value={kind} onChange={e => setKind(e.target.value)}
          options={Object.keys(KINDS).map(k => ({ value: k, label: t(`imports.kinds.${k}`) }))} />
        {['fee_history', 'results'].includes(kind) && <p className="text-sm text-content-muted">{t('imports.kept_note')}</p>}
        {uploading ? <Loader type="skeleton" rows={2} /> : <FileUpload accept=".xlsx,.csv" maxSize={5} label={t('imports.upload')} onUpload={upload} />}
      </Card>
      <Card>
        <h2 className="font-semibold mb-2">{t('imports.history')}</h2>
        <List columns={[
          { key: 'id', label: '#', render: r => <Ltr>{r.id}</Ltr> },
          { key: 'kind', label: t('imports.kind'), render: r => t(`imports.kinds.${r.kind}`, { defaultValue: r.kind }) },
          { key: 'status', label: t('academic.status'), primary: true, render: r => t(`imports.statuses.${r.status}`) },
          { key: 'rows', label: t('imports.row'), render: r => t('imports.rows', { n: r.summary?.total ?? 0 }) },
          { key: 'created_at', label: t('students.since'), render: r => r.created_at ? <Ltr>{fmtDate(r.created_at, locale)}</Ltr> : '' },
        ]} rows={jobs.data ?? []} loading={jobs.isPending} error={jobs.isError} onRetry={jobs.refetch} onRowClick={r => setJobId(r.id)} />
      </Card>
    </div>
  )
}

function ImportJob({ id, onBack }) {
  const { t } = useTranslation()
  const term = useTerms()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const job = useQuery({
    queryKey: ['imports', id], queryFn: () => api.get(`/imports/${id}`, { params: { status: 'error', per_page: 100 } }).then(r => r.data.data),
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 2000 : false),          // a run updates itself
  })
  const [edited, setMapping] = useState(null)              // null = the job's own (guessed or saved) mapping
  const act = async (fn) => {
    setBusy(true)
    try { await fn(); await qc.invalidateQueries({ queryKey: ['imports', id] }) } catch (e) { err(e) } finally { setBusy(false) }
  }
  if (job.isPending) return <Loader type="page" />
  if (job.isError) return <ErrorState onRetry={job.refetch} />
  const j = job.data
  const mapping = edited ?? j.mapping ?? {}
  const s = j.summary ?? {}
  const headers = s.headers ?? []
  const checked = ['dry_run', 'running', 'done', 'rolled_back'].includes(j.status)
  const editable = ['uploaded', 'mapped', 'dry_run'].includes(j.status)
  const { fields: FIELDS, required: REQUIRED } = KINDS[j.kind] ?? KINDS.students
  const label = (f) => j.kind === 'students' ? t(`imports.fields.${f}`, { unit: term('batch') })
    : `${t(`imports.kfields.${f}`, { batch: term('batch'), program: term('program') })}${REQUIRED.includes(f) ? ' *' : ''}`
  const saveAndCheck = () => act(async () => {
    await api.put(`/imports/${id}/mapping`, { mapping: Object.fromEntries(Object.entries(mapping).filter(([, v]) => v)) })
    await api.post(`/imports/${id}/dry-run`)
  })
  const rollback = () => useUiStore.getState().openConfirm({ title: t('imports.rollback'), description: t('imports.rollback_confirm'), type: 'danger',
    confirmLabel: t('imports.rollback'), onConfirm: () => act(() => api.post(`/imports/${id}/rollback`)) })

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={`${t('imports.title')} #${id} — ${t(`imports.statuses.${j.status}`)}`}
        actions={<Button variant="secondary" onClick={onBack}><DirIcon icon="back" className="h-4 w-4" />{t('common.back')}</Button>} />
      {editable && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-semibold">{t('imports.map_title')}</h2>
          <p className="text-sm text-content-muted">{t('imports.map_hint')}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS.map(f => (
              <Select key={f} label={label(f)} placeholder={t('imports.not_mapped')} value={mapping[f] ?? ''}
                options={headers.map(h => ({ value: h, label: h }))} onChange={e => setMapping({ ...mapping, [f]: e.target.value })}
                error={REQUIRED.includes(f) && !mapping[f] ? ' ' : undefined} />
            ))}
          </div>
          <div className="flex justify-end">
            <Button onClick={saveAndCheck} loading={busy} disabled={REQUIRED.some(f => !mapping[f])}>{checked ? t('imports.dry_run') : t('imports.save_mapping')}</Button>
          </div>
        </Card>
      )}
      {checked && (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label={t('imports.ok')} value={s.ok ?? 0} tone="success" />
          <StatCard label={t('imports.error')} value={s.error ?? 0} tone="danger" />
          <StatCard label={t('imports.skipped')} value={s.skipped ?? 0} tone="muted" />
        </div>
      )}
      {j.status === 'running' && <Card><p role="status">{t('imports.running')}</p></Card>}
      {checked && (
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 justify-end">
            {(s.error ?? 0) > 0 && <a href={`/api/v1/imports/${id}/errors.xlsx`} className="inline-flex items-center gap-2 h-10 px-4 rounded-token bg-surface text-content text-sm font-medium [border:1px_solid_var(--line)] hover:bg-surface-muted">
              <Download aria-hidden="true" className="h-4 w-4" />{t('imports.errors_file')}</a>}
            {j.status === 'dry_run' && (s.ok ?? 0) > 0 && <Button onClick={() => act(() => api.post(`/imports/${id}/run`))} loading={busy}><Play aria-hidden="true" className="h-4 w-4" />{t('imports.run', { n: s.ok })}</Button>}
            {j.status === 'done' && <Button variant="danger" onClick={rollback} loading={busy}><RotateCcw aria-hidden="true" className="h-4 w-4" />{t('imports.rollback')}</Button>}
          </div>
          {j.rollback_until && <p className="text-xs text-content-muted">{t('imports.rollback_until', { date: fmtDate(j.rollback_until, locale) })}</p>}
          {s.rollback_kept?.length > 0 && <p className="text-sm">{t('imports.kept', { rows: s.rollback_kept.join(', ') })}</p>}
          <List columns={[
            { key: 'row_no', label: t('imports.row'), numeric: true },
            { key: 'name', label: t('imports.what'), primary: true, render: r => <span dir="auto">{r.data?.name ?? r.data?.student_id ?? r.data?.program ?? ''}</span> },
            { key: 'error', label: t('imports.reason'), render: r => <span dir="auto">{r.error}</span> },
          ]} rows={(j.rows ?? []).map(r => ({ ...r, id: r.row_no }))} empty={<p className="text-sm text-content-muted py-4"><UploadIcon aria-hidden="true" className="inline h-4 w-4" /> 0 {t('imports.error')}</p>} />
        </Card>
      )}
    </div>
  )
}
