import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { FileDown } from 'lucide-react'
import api from '../../../api/axios'
import { useAuthStore } from '../../../store/authStore'
import { useLocale } from '../../../ui/I18nProvider'
import { fmtDate, fmtMoney, fmtNumber } from '../../../i18n/format'
import { useReceiptPdf } from '../../../features/fees/useReceiptPdf'
import { thisMonth } from '../../../features/attendance/AttendanceReport'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import DataTable from '../../../components/DataTable'
import Loader from '../../../components/Loader'
import { ErrorState } from '../../../components/StateViews'
import { Input, Select } from '../../../components/FormField'
import Ltr from '../../../components/bidi/Ltr'
import Tabs from '../../../ui/variants/Tabs'
import StatCard from '../../../ui/variants/StatCard'

const METHODS = ['cash', 'bkash', 'nagad', 'card', 'bank_transfer', 'cheque']

// Step 4.4 /admin|/accountant/fees/dues: the collection list (GET /fees/payments, one row per receipt, PDF) and - admin only -
// the month report (GET /fees/report). A student's own dues are on the collect page (GET /fees/dues needs a student).
export default function FeeLedger() {
  const { t } = useTranslation()
  const isAdmin = useAuthStore(s => s.role) === 'admin'
  const [tab, setTab] = useState('receipts')
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('fees.ledger_title')} />
      {isAdmin && <Tabs items={[{ key: 'receipts', label: t('fees.receipts') }, { key: 'report', label: t('fees.report_title') }]} value={tab} onChange={setTab} label={t('fees.ledger_title')} />}
      {tab === 'report' && isAdmin ? <FeeReport /> : <Receipts />}
    </div>
  )
}

function Receipts() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const pdf = useReceiptPdf()
  const [f, setF] = useState({ from: '', to: '', payment_method: '' })
  const [page, setPage] = useState(1)
  const params = Object.fromEntries(Object.entries({ ...f, page }).filter(([, v]) => v !== ''))
  const list = useQuery({ queryKey: ['fees', 'payments', params], placeholderData: keepPreviousData,
    queryFn: () => api.get('/fees/payments', { params }).then(r => r.data) })
  const set = (k) => (e) => { setF(v => ({ ...v, [k]: e.target.value })); setPage(1) }
  const columns = [
    { key: 'receipt_no', label: t('fees.receipt'), render: r => <Ltr>{r.receipt_no}</Ltr> },
    { key: 'student', label: t('students.name'), render: r => <span dir="auto">{r.student.name}</span> },
    { key: 'total', label: t('fees.amount'), numeric: true, render: r => <Ltr>{fmtMoney(r.total, locale)}</Ltr> },
    { key: 'paid_at', label: t('fees.paid_at'), render: r => r.paid_at && fmtDate(r.paid_at, locale) },
    { key: 'payment_method', label: t('fees.method'), render: r => t(`fees.methods.${r.payment_method}`, { defaultValue: r.payment_method }) },
    { key: 'pdf', label: t('fees.open_pdf'), action: true, render: r => (
      <Button variant="ghost" onClick={() => pdf.open(r.id)} aria-label={`${t('fees.open_pdf')} ${r.receipt_no}`}><FileDown aria-hidden="true" className="h-4 w-4" /></Button>
    ) },
  ]
  return (
    <>
      <Card className="grid gap-3 sm:grid-cols-3">
        <Input label={t('fees.from')} type="date" ltr value={f.from} onChange={set('from')} />
        <Input label={t('fees.to')} type="date" ltr value={f.to} onChange={set('to')} />
        <Select label={t('fees.method')} value={f.payment_method} onChange={set('payment_method')} placeholder={t('common.all')}
          options={METHODS.map(m => ({ value: m, label: t(`fees.methods.${m}`) }))} />
      </Card>
      <Card data-testid="fee-receipts">
        <DataTable columns={columns} data={list.data?.data ?? []} rowKey="receipt_no" loading={list.isPending} error={list.isError} onRetry={list.refetch}
          pagination={list.data && { page: list.data.meta.current_page, last: list.data.meta.last_page, onChange: setPage }} />
      </Card>
    </>
  )
}

function FeeReport() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const [month, setMonth] = useState(thisMonth)
  const report = useQuery({ queryKey: ['fees', 'report', month], queryFn: () => api.get('/fees/report', { params: { month } }).then(r => r.data.data) })
  const money = (v) => fmtMoney(v, locale)
  return (
    <>
      <Card className="grid gap-3 sm:grid-cols-3">
        <Input label={t('attendance.month')} type="month" ltr value={month} max={thisMonth()} onChange={e => setMonth(e.target.value)} />
      </Card>
      {report.isPending ? <Loader type="cards" count={2} /> : report.isError ? <ErrorState onRetry={report.refetch} /> : (
        <>
          <div className="grid gap-3 grid-cols-2" data-testid="fee-report-summary">
            <StatCard label={t('fees.collected_total')} value={money(report.data.total)} />
            <StatCard label={t('fees.receipts')} value={fmtNumber(report.data.receipts, locale)} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <h2 className="font-semibold mb-2">{t('fees.by_category')}</h2>
              <DataTable rowKey="id" data={report.data.by_category} columns={[
                { key: 'name', label: t('fees.category'), render: r => <span dir="auto">{r.name}</span> },
                { key: 'total', label: t('fees.amount'), numeric: true, render: r => <Ltr>{money(r.total)}</Ltr> },
              ]} />
            </Card>
            <Card>
              <h2 className="font-semibold mb-2">{t('fees.by_method')}</h2>
              <DataTable rowKey="method" data={report.data.by_method} columns={[
                { key: 'method', label: t('fees.method'), render: r => t(`fees.methods.${r.method}`, { defaultValue: r.method }) },
                { key: 'total', label: t('fees.amount'), numeric: true, render: r => <Ltr>{money(r.total)}</Ltr> },
              ]} />
            </Card>
          </div>
        </>
      )}
    </>
  )
}
