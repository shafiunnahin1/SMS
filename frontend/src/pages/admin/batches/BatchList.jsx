import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useTerms } from '../../../hooks/useTerms'
import { useInstitutionStore } from '../../../store/institutionStore'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import StatusBadge from '../../../components/StatusBadge'
import List from '../../../ui/variants/List'
import Modal from '../../../ui/variants/Modal'
import { Select } from '../../../components/FormField'
import Ltr from '../../../components/bidi/Ltr'
import BatchForm from '../../../features/academic/BatchForm'
import { useCrud } from '../../../features/academic/useCrud'

const STATUSES = ['upcoming', 'running', 'completed', 'archived']

// Step 4.1 /admin/batches: a school's sections, a coaching's batches (the institution's term). A row opens the detail page.
export default function BatchList() {
  const { t } = useTranslation()
  const term = useTerms()
  const navigate = useNavigate()
  const usePrograms = useInstitutionStore(s => s.settings?.use_programs) !== false
  const [programId, setProgramId] = useState('')
  const [status, setStatus] = useState('')
  const programs = useCrud('programs', { enabled: usePrograms })
  const { list } = useCrud('batches', { params: { program_id: programId || undefined, status: status || undefined } })
  const [adding, setAdding] = useState(false)
  const columns = [
    { key: 'name', label: t('academic.name'), primary: true, render: r => <span dir="auto">{r.name}</span> },
    ...(usePrograms ? [{ key: 'program', label: term('program'), render: r => <span dir="auto">{r.program?.name}</span> }] : []),
    { key: 'teacher', label: t('academic.class_teacher'), render: r => <span dir="auto">{r.teacher?.name ?? '—'}</span> },
    { key: 'students', label: t('academic.students_count'), render: r => <Ltr>{r.students_count} / {r.max_capacity}</Ltr> },
    { key: 'status', label: t('academic.status'), render: r => <StatusBadge status={r.status} /> },
  ]
  return (
    <div>
      <PageHeader title={term('batches')} actions={<Button onClick={() => setAdding(true)}><Plus aria-hidden="true" className="h-4 w-4" />{t('academic.add_unit', { unit: term('batch') })}</Button>} />
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          {usePrograms && <Select label={term('program')} placeholder={t('common.all')} options={(programs.list.data ?? []).map(p => ({ value: p.id, label: p.name }))} value={programId} onChange={e => setProgramId(e.target.value)} className="sm:w-56" />}
          <Select label={t('academic.status')} placeholder={`${t('academic.statuses.upcoming')} + ${t('academic.statuses.running')}`}
            options={[...STATUSES.map(s => ({ value: s, label: t(`academic.statuses.${s}`) })), { value: 'all', label: t('common.all') }]} value={status} onChange={e => setStatus(e.target.value)} className="sm:w-56" />
        </div>
        <List columns={columns} rows={list.data ?? []} loading={list.isPending} error={list.isError} onRetry={list.refetch} onRowClick={r => navigate(`/admin/batches/${r.id}`)} />
      </Card>
      <Modal open={adding} onClose={() => setAdding(false)} title={t('academic.add_unit', { unit: term('batch') })}>
        {adding && <BatchForm onDone={b => { setAdding(false); navigate(`/admin/batches/${b.id}`) }} onCancel={() => setAdding(false)} />}
      </Modal>
    </div>
  )
}
