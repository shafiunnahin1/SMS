import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { FileDown, Sheet } from 'lucide-react'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import { useTerms } from '../../hooks/useTerms'
import { usePrint } from '../../hooks/usePrint'
import { thisMonth } from '../../features/attendance/AttendanceReport'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import { Input, Select } from '../../components/FormField'
import Tabs from '../../ui/variants/Tabs'

// Step 4.8 /admin/reports and /accountant/reports: pick a report and its filters, open the PDF or download Excel
// (GET /{role}/reports/{type}). The accountant gets the money reports only.
const TYPES = { admin: ['students', 'attendance', 'dues', 'fees'], accountant: ['fees', 'dues'] }
const NEEDS = { students: ['program', 'batch'], attendance: ['batch', 'month'], dues: ['program', 'batch'], fees: ['month', 'program', 'category'] }

export default function Reports() {
  const { t } = useTranslation()
  const term = useTerms()
  const role = useAuthStore(s => s.role)
  const types = TYPES[role] ?? []
  const [type, setType] = useState(types[0])
  const [f, setF] = useState({ program_id: '', batch_id: '', month: thisMonth(), fee_category_id: '' })
  const { preview, download, loading } = usePrint()
  const programs = useQuery({ queryKey: ['programs'], queryFn: () => api.get('/programs').then(r => r.data.data) })
  const batches = useQuery({ queryKey: ['batches', { program_id: f.program_id }], queryFn: () => api.get('/batches', { params: { program_id: f.program_id || undefined } }).then(r => r.data.data) })
  const set = (k) => (e) => setF(v => ({ ...v, [k]: e.target.value, ...(k === 'program_id' ? { batch_id: '' } : {}) }))
  const needs = NEEDS[type] ?? []
  const params = Object.fromEntries(Object.entries({ program_id: needs.includes('program') ? f.program_id : '', batch_id: needs.includes('batch') ? f.batch_id : '',
    month: needs.includes('month') ? f.month : '', fee_category_id: needs.includes('category') ? f.fee_category_id : '' }).filter(([, v]) => v !== ''))
  const missing = (type === 'attendance' && !f.batch_id) || (type === 'dues' && !f.batch_id && !f.program_id)
  const url = `/${role}/reports/${type}`

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('reports.title')} />
      <Tabs items={types.map(x => ({ key: x, label: t(`reports.types.${x}`) }))} value={type} onChange={setType} label={t('reports.title')} />
      <Card className="grid gap-3 sm:grid-cols-3" data-testid="report-filters">
        {needs.includes('program') && <Select label={term('program')} placeholder={t('common.all')} value={f.program_id} onChange={set('program_id')}
          options={(programs.data ?? []).map(p => ({ value: p.id, label: p.name }))} />}
        {needs.includes('batch') && <Select label={term('batch')} placeholder={type === 'attendance' ? '—' : t('common.all')} value={f.batch_id} onChange={set('batch_id')}
          options={(batches.data ?? []).map(b => ({ value: b.id, label: b.program ? `${b.program.name} — ${b.name}` : b.name }))} />}
        {needs.includes('month') && <Input label={t('attendance.month')} type="month" ltr value={f.month} max={thisMonth()} onChange={set('month')} />}
        <p className="sm:col-span-3 text-sm text-content-muted">{t(`reports.hints.${type}`, { unit: term('batch') })}</p>
        {missing && <p className="sm:col-span-3 text-sm">{t('reports.pick_scope', { unit: term('batch') })}</p>}
        <div className="sm:col-span-3 flex flex-wrap gap-2">
          <Button onClick={() => preview(url, params)} loading={loading} disabled={missing} data-action="pdf"><FileDown aria-hidden="true" className="h-4 w-4" />PDF</Button>
          <Button variant="secondary" onClick={() => download(url, `${type}.xlsx`, { ...params, format: 'xlsx' })} disabled={missing || loading} data-action="xlsx">
            <Sheet aria-hidden="true" className="h-4 w-4" />Excel
          </Button>
        </div>
      </Card>
    </div>
  )
}
