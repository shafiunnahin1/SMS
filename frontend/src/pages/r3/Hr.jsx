import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import api from '../../api/axios'
import { useLocale } from '../../ui/I18nProvider'
import { fmtMoney } from '../../i18n/format'
import ResourcePage from '../../features/r3/ResourcePage'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import List from '../../ui/variants/List'
import { Input, Select } from '../../components/FormField'
import Ltr from '../../components/bidi/Ltr'

// R3.4-R3.8 HR and payroll pages (docs/modules/staff-payroll.md, staff-leave.md). Salary data is sensitive (D33): the API alone decides
// who sees it; these pages only show what it returns. Every amount comes from the server's calculator.
const thisMonth = () => new Date().toISOString().slice(0, 7)
const today = () => new Date().toISOString().slice(0, 10)
const PAYEE = [{ key: 'payee_type', label: 'r3.hr.payee_type', kind: 'enum' }, { key: 'payee_id', label: 'r3.hr.payee_id' }]

export function Staff() {
  const f = [{ name: 'employee_id', label: 'r3.hr.employee_id', required: true }, { name: 'name', label: 'r3.name', required: true }, { name: 'designation', label: 'r3.hr.designation' },
    { name: 'department', label: 'r3.hr.department' }, { name: 'phone', label: 'r3.phone' }, { name: 'joining_date', label: 'r3.hr.joining_date', kind: 'date' }]
  return <ResourcePage title="r3.hr.staff" endpoint="hr/staff"
    columns={[{ key: 'employee_id', label: 'r3.hr.employee_id' }, { key: 'name', label: 'r3.name' }, { key: 'designation', label: 'r3.hr.designation' }, { key: 'status', label: 'r3.status', kind: 'status' }]}
    create={{ label: 'r3.hr.new_staff', fields: f }}
    edit={{ fields: [...f.slice(1), { name: 'leaving_date', label: 'r3.hr.leaving_date', kind: 'date' }, { name: 'status', label: 'r3.status', kind: 'select', options: ['active', 'inactive', 'on_leave'] }] }} />
}

export function Components() {
  return <ResourcePage title="r3.hr.components" endpoint="hr/salary-components"
    columns={[{ key: 'code', label: 'r3.code' }, { key: 'name', label: 'r3.name', value: r => (typeof r.name === 'object' ? (r.name?.bn ?? r.name?.en) : r.name) },
      { key: 'type', label: 'r3.type', kind: 'enum' }, { key: 'calc', label: 'r3.hr.calc', kind: 'enum' }, { key: 'is_active', label: 'r3.active', kind: 'bool' }]}
    create={{ label: 'r3.hr.new_component', defaults: { type: 'earning', calc: 'fixed' }, fields: [{ name: 'code', label: 'r3.code', required: true },
      { name: 'name_bn', label: 'r3.hr.name_bn', required: true }, { name: 'name_en', label: 'r3.hr.name_en', required: true },
      { name: 'type', label: 'r3.type', kind: 'select', options: ['earning', 'deduction'] }, { name: 'calc', label: 'r3.hr.calc', kind: 'select', options: ['fixed', 'percent_basic'] },
      { name: 'taxable', label: 'r3.hr.taxable', kind: 'checkbox' }],
      transform: ({ name_bn, name_en, ...v }) => ({ ...v, name: { bn: name_bn, en: name_en } }) }} />
}

export function Revisions() {
  return <ResourcePage title="r3.hr.revisions" endpoint="hr/revisions"
    columns={[...PAYEE, { key: 'kind', label: 'r3.type', kind: 'enum' }, { key: 'effective_from', label: 'r3.hr.effective_from', kind: 'date' },
      { key: 'new_basic', label: 'r3.hr.new_basic', kind: 'money' }, { key: 'status', label: 'r3.status', kind: 'status' }]}
    create={{ label: 'r3.hr.propose', defaults: { kind: 'increment', change_mode: 'amount', arrears_policy: 'none' }, fields: [{ name: 'payee', label: 'r3.hr.payee', kind: 'payee', wide: true },
      { name: 'kind', label: 'r3.type', kind: 'select', options: ['initial', 'increment', 'decrement', 'promotion', 'correction'] },
      { name: 'change_mode', label: 'r3.hr.change_mode', kind: 'select', options: ['set', 'amount', 'percent'] }, { name: 'change_value', label: 'r3.hr.change_value', kind: 'money', required: true },
      { name: 'effective_from', label: 'r3.hr.effective_from', kind: 'date', required: true }, { name: 'arrears_policy', label: 'r3.hr.arrears', kind: 'select', options: ['none', 'auto'] },
      { name: 'reason', label: 'r3.reason', wide: true }] }}
    actions={[{ key: 'approve', label: 'r3.approve', when: r => r.status === 'proposed', path: r => `/hr/revisions/${r.id}/approve` },
      { key: 'reject', label: 'r3.reject', danger: true, when: r => r.status === 'proposed', path: r => `/hr/revisions/${r.id}/reject` }]}
    pdfs={[{ key: 'letter', label: 'r3.hr.letter', when: r => r.status === 'approved', path: r => `/hr/revisions/${r.id}/letter.pdf` }]} />
}

export function Bonus() {
  return <ResourcePage title="r3.hr.bonus" endpoint="hr/bonus-schemes"
    columns={[{ key: 'name', label: 'r3.name' }, { key: 'pay_month', label: 'r3.hr.month' }, { key: 'basis', label: 'r3.hr.basis', kind: 'enum' }, { key: 'value', label: 'r3.hr.value' }, { key: 'status', label: 'r3.status', kind: 'status' }]}
    create={{ label: 'r3.hr.new_bonus', defaults: { basis: 'basic', kind: 'festival' }, fields: [{ name: 'name', label: 'r3.name', required: true },
      { name: 'pay_month', label: 'r3.hr.month', required: true }, { name: 'basis', label: 'r3.hr.basis', kind: 'select', options: ['basic', 'gross', 'fixed'] },
      { name: 'value', label: 'r3.hr.value', kind: 'money', required: true }, { name: 'min_service_months', label: 'r3.hr.min_service' }, { name: 'max_amount', label: 'r3.hr.max_amount', kind: 'money' }] }}
    actions={[{ key: 'apply', label: 'r3.hr.apply', when: r => r.status === 'draft', path: r => `/hr/bonus-schemes/${r.id}/apply` },
      { key: 'cancel', label: 'r3.hr.cancel', danger: true, when: r => r.status !== 'cancelled', path: r => `/hr/bonus-schemes/${r.id}/cancel` }]} />
}

export function Adjustments() {
  return <ResourcePage title="r3.hr.adjustments" endpoint="hr/adjustments"
    columns={[...PAYEE, { key: 'kind', label: 'r3.type', kind: 'enum' }, { key: 'direction', label: 'r3.hr.direction', kind: 'enum' }, { key: 'amount', label: 'r3.amount', kind: 'money' },
      { key: 'month', label: 'r3.hr.month' }, { key: 'status', label: 'r3.status', kind: 'status' }]}
    create={{ label: 'r3.hr.new_adjustment', defaults: { kind: 'overtime', direction: 'earning', month: thisMonth() }, fields: [{ name: 'payee', label: 'r3.hr.payee', kind: 'payee', wide: true },
      { name: 'kind', label: 'r3.type', kind: 'select', options: ['bonus', 'allowance', 'overtime', 'extra_class', 'arrear', 'fine', 'recovery', 'other'] },
      { name: 'direction', label: 'r3.hr.direction', kind: 'select', options: ['earning', 'deduction'] }, { name: 'amount', label: 'r3.amount', kind: 'money', required: true },
      { name: 'month', label: 'r3.hr.month', required: true }, { name: 'description', label: 'r3.note', wide: true }] }}
    actions={[{ key: 'approve', label: 'r3.approve', when: r => r.status === 'pending', path: r => `/hr/adjustments/${r.id}/approve` },
      { key: 'cancel', label: 'r3.hr.cancel', danger: true, when: r => ['pending', 'approved'].includes(r.status), path: r => `/hr/adjustments/${r.id}/cancel` }]} />
}

export function Advances() {
  const act = (a, when, fields) => ({ key: a, label: `r3.hr.adv.${a}`, when, path: r => `/hr/advances/${r.id}/${a}`, fields })
  return <ResourcePage title="r3.hr.advances" endpoint="hr/advances"
    columns={[...PAYEE, { key: 'amount', label: 'r3.amount', kind: 'money' }, { key: 'recovered', label: 'r3.hr.recovered', kind: 'money' },
      { key: 'installment_amount', label: 'r3.hr.installment', kind: 'money' }, { key: 'status', label: 'r3.status', kind: 'status' }]}
    create={{ label: 'r3.hr.new_advance', defaults: { recover_from_month: thisMonth() }, fields: [{ name: 'payee', label: 'r3.hr.payee', kind: 'payee', wide: true },
      { name: 'amount', label: 'r3.amount', kind: 'money', required: true }, { name: 'installments', label: 'r3.hr.installments' },
      { name: 'recover_from_month', label: 'r3.hr.recover_from', required: true }, { name: 'reason', label: 'r3.reason', wide: true }] }}
    actions={[act('approve', r => r.status === 'requested'), act('reject', r => r.status === 'requested'),
      act('disburse', r => r.status === 'approved', [{ name: 'date', label: 'r3.date', kind: 'date', required: true }, { name: 'payment_method', label: 'r3.method', kind: 'select', options: ['cash', 'bank', 'bkash', 'nagad', 'rocket', 'other'], required: true }]),
      act('skip-installment', r => r.status === 'active', [{ name: 'month', label: 'r3.hr.month', required: true }, { name: 'reason', label: 'r3.reason', required: true }]),
      act('write-off', r => r.status === 'active', [{ name: 'reason', label: 'r3.reason', required: true, wide: true }])]} />
}

export function Payroll() {
  const tr = (a, when, danger) => ({ key: a, label: `r3.hr.run.${a}`, when, danger, path: r => `/hr/payroll-runs/${r.id}/${a}` })
  return <ResourcePage title="r3.hr.payroll" endpoint="hr/payroll-runs" intro="r3.hr.payroll_hint"
    columns={[{ key: 'month', label: 'r3.hr.month' }, { key: 'kind', label: 'r3.type', kind: 'enum' }, { key: 'label', label: 'r3.title' },
      { key: 'total_net', label: 'r3.hr.total_net', kind: 'money' }, { key: 'status', label: 'r3.status', kind: 'status' }]}
    create={{ label: 'r3.hr.new_run', defaults: { month: thisMonth(), kind: 'regular' }, fields: [{ name: 'month', label: 'r3.hr.month', required: true },
      { name: 'kind', label: 'r3.type', kind: 'select', options: ['regular', 'bonus'] }, { name: 'label', label: 'r3.title' }] }}
    actions={[tr('recompute', r => r.status === 'draft'), tr('review', r => r.status === 'draft'), tr('approve', r => r.status === 'reviewed'),
      tr('reject', r => r.status === 'reviewed', true), tr('pay', r => r.status === 'approved'), tr('cancel', r => ['draft', 'reviewed'].includes(r.status), true)]}
    pdfs={[{ key: 'register', label: 'r3.hr.register', when: r => ['approved', 'paid'].includes(r.status), path: r => `/hr/payroll-runs/${r.id}/register.pdf` }]} />
}

export function ProvidentFund() {
  return <ResourcePage title="r3.hr.pf" endpoint="hr/pf/entries"
    columns={[...PAYEE, { key: 'month', label: 'r3.hr.month' }, { key: 'kind', label: 'r3.type', kind: 'enum' }, { key: 'amount', label: 'r3.amount', kind: 'money' }, { key: 'note', label: 'r3.note' }]}
    create={{ label: 'r3.hr.pf_entry', defaults: { kind: 'interest', month: thisMonth() }, fields: [{ name: 'payee', label: 'r3.hr.payee', kind: 'payee', wide: true },
      { name: 'kind', label: 'r3.type', kind: 'select', options: ['interest', 'adjustment'] }, { name: 'month', label: 'r3.hr.month', required: true },
      { name: 'amount', label: 'r3.amount', kind: 'money', required: true }, { name: 'note', label: 'r3.reason', required: true, wide: true }] }}
    pdfs={[{ key: 'statement', label: 'r3.don.statement', path: r => `/hr/pf/${r.payee_type}/${r.payee_id}/statement.pdf` }]} />
}

export function Leave() {
  const tr = (a, when, danger) => ({ key: a, label: `r3.hr.leave.${a}`, when, danger, method: 'patch', path: r => `/hr/leaves/${r.id}/${a}` })
  return <ResourcePage title="r3.hr.leaves" endpoint="hr/leaves"
    columns={[{ key: 'user_name', label: 'r3.name', value: r => r.user?.name ?? r.staff?.name ?? r.user_name ?? r.staff_id }, { key: 'from_date', label: 'r3.from', kind: 'date' },
      { key: 'to_date', label: 'r3.to', kind: 'date' }, { key: 'total_days', label: 'r3.hr.days' }, { key: 'status', label: 'r3.status', kind: 'status' }]}
    create={{ label: 'r3.hr.new_leave', fields: [{ name: 'staff_id', label: 'r3.hr.staff_member', kind: 'select', optionsFrom: 'hr/staff' },
      { name: 'leave_type_id', label: 'r3.type', kind: 'select', optionsFrom: 'hr/leave-types', required: true },
      { name: 'from_date', label: 'r3.from', kind: 'date', required: true }, { name: 'to_date', label: 'r3.to', kind: 'date', required: true }, { name: 'reason', label: 'r3.reason', wide: true }] }}
    actions={[tr('approve', r => r.status === 'pending'), tr('reject', r => r.status === 'pending', true), tr('cancel', r => ['pending', 'approved'].includes(r.status), true)]} />
}

export function StaffAttendance() {
  const { t } = useTranslation()
  const [date, setDate] = useState(today)
  return (
    <div>
      <PageHeader title={t('r3.hr.attendance')} actions={<Input label={t('r3.date')} type="date" ltr value={date} onChange={e => setDate(e.target.value)} />} />
      <ResourcePage key={date} title="r3.hr.attendance_list" endpoint="hr/staff-attendance" params={{ date }}
        columns={[{ key: 'name', label: 'r3.name', value: r => r.staff?.name ?? r.user?.name ?? r.name }, { key: 'status', label: 'r3.status', kind: 'status' },
          { key: 'check_in', label: 'r3.hr.check_in' }, { key: 'check_out', label: 'r3.hr.check_out' }]} />
    </div>
  )
}

const HR_REPORTS = ['register', 'held', 'monthly-cost']
export function HrReports() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const [name, setName] = useState('register')
  const [month, setMonth] = useState(thisMonth)
  const q = useQuery({ queryKey: ['hr/reports', name, month], queryFn: () => api.get(`/hr/reports/${name}`, { params: { month } }).then(r => r.data.data), retry: false })
  const rows = Array.isArray(q.data) ? q.data : (q.data?.rows ?? q.data?.items ?? [])
  const keys = rows[0] ? Object.keys(rows[0]).filter(k => typeof rows[0][k] !== 'object') : []
  const money = (k) => /amount|gross|net|basic|total|cost|earnings|deductions/.test(k)
  return (
    <div>
      <PageHeader title={t('r3.hr.reports')} />
      <Card><div className="grid gap-3 sm:grid-cols-3">
        <Select label={t('r3.acc.report')} value={name} onChange={e => setName(e.target.value)} options={HR_REPORTS.map(r => ({ value: r, label: t(`r3.hr.report_names.${r}`) }))} />
        <Input label={t('r3.hr.month')} ltr value={month} onChange={e => setMonth(e.target.value)} />
      </div></Card>
      <Card><List rows={rows} loading={q.isFetching} error={q.isError} onRetry={q.refetch} columns={keys.map((k, i) => ({ key: k, label: t(`r3.cols.${k}`, { defaultValue: k }), primary: i === 0, numeric: money(k),
        render: r => money(k) ? <Ltr>{fmtMoney(r[k], locale)}</Ltr> : <span dir="auto">{r[k] ?? '—'}</span> }))} /></Card>
    </div>
  )
}

// Annual increments: preview first (the server computes every new salary), then apply the previewed batch by its token
export function Increments() {
  return <ResourcePage title="r3.hr.increments" endpoint="hr/revisions" params={{ kind: 'increment' }} intro="r3.hr.increments_hint"
    columns={[...PAYEE, { key: 'effective_from', label: 'r3.hr.effective_from', kind: 'date' }, { key: 'new_basic', label: 'r3.hr.new_basic', kind: 'money' }, { key: 'status', label: 'r3.status', kind: 'status' }]}
    create={{ label: 'r3.hr.batch_increment', path: '/hr/increment-batches', defaults: { arrears_policy: 'none' }, fields: [{ name: 'percent', label: 'r3.hr.percent' },
      { name: 'amount', label: 'r3.amount', kind: 'money' }, { name: 'effective_from', label: 'r3.hr.effective_from', kind: 'date', required: true },
      { name: 'label', label: 'r3.title' }, { name: 'arrears_policy', label: 'r3.hr.arrears', kind: 'select', options: ['none', 'auto'] }],
      transform: async (v) => ({ preview_token: (await api.post('/hr/increment-batches/preview', v)).data.data.preview_token }) }} />
}

// The teacher's own payslips (D33: own slips only, the API filters them)
export function MySalary() {
  return <ResourcePage title="r3.hr.my_salary" endpoint="teacher/salary/slips"
    columns={[{ key: 'month', label: 'r3.hr.month' }, { key: 'slip_no', label: 'r3.hr.slip_no' }, { key: 'gross', label: 'r3.hr.gross', kind: 'money' },
      { key: 'net', label: 'r3.hr.net', kind: 'money' }, { key: 'status', label: 'r3.status', kind: 'status' }]}
    pdfs={[{ key: 'slip', label: 'r3.hr.payslip', path: r => `/teacher/salary/slips/${r.id}.pdf` }]} />
}
