import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, FileSpreadsheet } from 'lucide-react'
import { useModules } from '../../../hooks/useModules'
import api from '../../../api/axios'
import { useTerms } from '../../../hooks/useTerms'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import List from '../../../ui/variants/List'
import { Input } from '../../../components/FormField'
import Ltr from '../../../components/bidi/Ltr'

// GET /students (Step 4.2; walking-skeleton slice). The batch column label comes from the institution's terms (D5).
export default function StudentList() {
  const { t } = useTranslation()
  const term = useTerms()
  const navigate = useNavigate()
  const { has } = useModules()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: ['students', q, page],
    queryFn: () => api.get('/students', { params: { q: q || undefined, page } }).then(r => r.data),
    placeholderData: (prev) => prev,
  })
  const columns = [
    { key: 'name', label: t('students.name'), render: r => <span dir="auto">{r.name}</span> },
    { key: 'student_id', label: t('students.student_id'), render: r => <Ltr>{r.student_id}</Ltr> },
    { key: 'batch', label: term('batch'), render: r => <span dir="auto">{r.batch?.name}</span> },
    { key: 'roll_no', label: t('students.roll'), numeric: true },
    { key: 'guardian_phone', label: t('students.guardian_phone'), render: r => <Ltr>{r.guardian_phone}</Ltr> },
  ]
  return (
    <div>
      <PageHeader title={t('students.title')} actions={<>
        {has('data_migration') && <Link to="/admin/settings/imports" className="inline-flex items-center gap-2 h-10 px-4 rounded-token bg-surface text-content text-sm font-medium [border:1px_solid_var(--line)] hover:bg-surface-muted">
          <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />{t('students.import')}</Link>}
        <Link to="/admin/students/add" className="inline-flex items-center gap-2 h-10 px-4 rounded-token bg-primary text-on-primary text-sm font-medium hover:opacity-90">
          <Plus aria-hidden="true" className="h-4 w-4" />{t('students.add')}
        </Link></>} />
      <Card className="flex flex-col gap-3">
        <Input type="search" placeholder={t('students.search_hint')} aria-label={t('common.search')} value={q} onChange={e => { setQ(e.target.value); setPage(1) }} />
        <List columns={columns} rows={query.data?.data ?? []} onRowClick={r => navigate(`/admin/students/${r.id}`)} loading={query.isPending} error={query.isError} onRetry={query.refetch}
          pagination={query.data?.meta ? { page: query.data.meta.current_page, last: query.data.meta.last_page, onChange: setPage } : null} />
      </Card>
    </div>
  )
}
