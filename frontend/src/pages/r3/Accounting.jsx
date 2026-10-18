import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtMoney } from '../../i18n/format'
import ResourcePage, { useOptions } from '../../features/r3/ResourcePage'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import List from '../../ui/variants/List'
import { Input, Select, Textarea } from '../../components/FormField'
import Ltr from '../../components/bidi/Ltr'

// R3.10 / D106 pages (docs/modules/accounting.md §6). Amounts, balances and rules all come from the API.
const TYPES = ['journal', 'receipt', 'payment', 'contra']

export function Vouchers() {
  return <ResourcePage title="r3.acc.vouchers" endpoint="accounting/vouchers"
    columns={[{ key: 'voucher_no', label: 'r3.acc.voucher_no' }, { key: 'date', label: 'r3.date', kind: 'date' }, { key: 'type', label: 'r3.type', kind: 'enum' },
      { key: 'narration', label: 'r3.narration' }, { key: 'source', label: 'r3.acc.source', kind: 'enum' }, { key: 'status', label: 'r3.status', kind: 'status' }]}
    create={{ label: 'r3.acc.new_voucher', defaults: { type: 'journal' },
      fields: [{ name: 'type', label: 'r3.type', kind: 'select', options: TYPES, required: true }, { name: 'date', label: 'r3.date', kind: 'date', required: true },
        { name: 'debit_code', label: 'r3.acc.debit_account', required: true }, { name: 'credit_code', label: 'r3.acc.credit_account', required: true },
        { name: 'amount', label: 'r3.amount', kind: 'money', required: true }, { name: 'narration', label: 'r3.narration', wide: true }],
      transform: v => ({ type: v.type, date: v.date, narration: v.narration, lines: [{ account_code: v.debit_code, debit: v.amount }, { account_code: v.credit_code, credit: v.amount }] }) }}
    actions={[{ key: 'post', label: 'r3.acc.post', when: r => r.status === 'draft', path: r => `/accounting/vouchers/${r.id}/post` },
      { key: 'reverse', label: 'r3.acc.reverse', danger: true, when: r => r.status === 'posted', path: r => `/accounting/vouchers/${r.id}/reverse`,
        fields: [{ name: 'reason', label: 'r3.reason', required: true, wide: true }] }]} />
}

export function Accounts() {
  return <ResourcePage title="r3.acc.accounts" endpoint="accounting/accounts"
    columns={[{ key: 'code', label: 'r3.code' }, { key: 'name', label: 'r3.name' }, { key: 'type', label: 'r3.type', kind: 'enum' },
      { key: 'is_cash_or_bank', label: 'r3.acc.cash_or_bank', kind: 'bool' }, { key: 'is_active', label: 'r3.active', kind: 'bool' }]}
    create={{ label: 'r3.acc.new_account', fields: [{ name: 'code', label: 'r3.code', required: true }, { name: 'name', label: 'r3.name', required: true },
      { name: 'type', label: 'r3.type', kind: 'select', options: ['asset', 'liability', 'equity', 'income', 'expense'], required: true },
      { name: 'is_cash_or_bank', label: 'r3.acc.cash_or_bank', kind: 'checkbox' }] }}
    edit={{ fields: [{ name: 'name', label: 'r3.name', required: true }, { name: 'is_active', label: 'r3.active', kind: 'checkbox' }] }} />
}

export function Budgets() {
  return <ResourcePage title="r3.acc.budgets" endpoint="accounting/budgets"
    columns={[{ key: 'name', label: 'r3.name' }, { key: 'fiscal_year', label: 'r3.acc.fiscal_year' }, { key: 'status', label: 'r3.status', kind: 'status' }]}
    create={{ label: 'r3.acc.new_budget', fields: [{ name: 'name', label: 'r3.name', required: true }, { name: 'fiscal_year', label: 'r3.acc.fiscal_year', required: true }] }}
    actions={[{ key: 'line', label: 'r3.acc.set_line', when: r => r.status === 'draft', method: 'put', path: r => `/accounting/budgets/${r.id}/lines`,
      // the API replaces all lines: keep the others, replace this account's amount
      prepare: async (r, v) => {
        const lines = (await api.get(`/accounting/budgets/${r.id}`)).data.data.lines ?? []
        return { lines: [...lines.filter(l => String(l.account_id) !== String(v.account_id)).map(l => ({ account_id: l.account_id, amount: l.amount })), { account_id: Number(v.account_id), amount: v.amount }] }
      },
      fields: [{ name: 'account_id', label: 'r3.acc.account', kind: 'select', optionsFrom: 'accounting/accounts', optionLabel: a => `${a.code} ${a.name}`, required: true },
        { name: 'amount', label: 'r3.amount', kind: 'money', required: true }] },
      { key: 'approve', label: 'r3.approve', when: r => r.status === 'draft', path: r => `/accounting/budgets/${r.id}/approve` }]} />
}

const REPORTS = ['trial-balance', 'income-expenditure', 'balance-sheet', 'budget-actual', 'ledger', 'unposted']

export function Reports() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const [name, setName] = useState('trial-balance')
  const [p, setP] = useState({ from: '', to: '', as_of: '', budget_id: '', account_id: '' })
  const budgets = useOptions('accounting/budgets')
  const accounts = useOptions('accounting/accounts', a => `${a.code} ${a.name}`)
  const params = Object.fromEntries(Object.entries(p).filter(([, v]) => v))
  const q = useQuery({ queryKey: ['accounting/reports', name, params], queryFn: () => api.get(`/accounting/reports/${name}`, { params }).then(r => r.data.data),
    enabled: !(name === 'budget-actual' && !p.budget_id) && !(name === 'ledger' && (!p.account_id || !p.from)) && !(name === 'income-expenditure' && !p.from), retry: false })
  const data = q.data ?? {}
  const rows = Array.isArray(data) ? data : (data.rows ?? data.lines ?? [...(data.assets ?? []), ...(data.liabilities ?? []), ...(data.equity ?? []), ...(data.income ?? []), ...(data.expense ?? [])])
  const keys = rows[0] ? Object.keys(rows[0]).filter(k => typeof rows[0][k] !== 'object') : []
  const money = (k) => ['debit', 'credit', 'balance', 'amount', 'budget', 'actual', 'variance', 'running'].includes(k)
  const cols = keys.map((k, i) => ({ key: k, label: t(`r3.cols.${k}`, { defaultValue: k }), primary: i === 0, numeric: money(k),
    render: r => money(k) ? <Ltr>{fmtMoney(r[k], locale)}</Ltr> : <span dir="auto">{r[k] ?? '—'}</span> }))
  const set = (k) => (e) => setP(s => ({ ...s, [k]: e.target.value }))
  const totals = Object.entries(data).filter(([k, v]) => typeof v === 'string' && /total|difference|surplus/.test(k))
  return (
    <div>
      <PageHeader title={t('r3.acc.reports')} />
      <Card>
        <div className="grid gap-3 sm:grid-cols-3">
          <Select label={t('r3.acc.report')} value={name} onChange={e => setName(e.target.value)} options={REPORTS.map(r => ({ value: r, label: t(`r3.acc.report_names.${r}`) }))} />
          {['ledger', 'income-expenditure'].includes(name) && <Input label={t('r3.from')} type="date" ltr value={p.from} onChange={set('from')} />}
          {['ledger', 'income-expenditure'].includes(name) && <Input label={t('r3.to')} type="date" ltr value={p.to} onChange={set('to')} />}
          {['trial-balance', 'balance-sheet'].includes(name) && <Input label={t('r3.acc.as_of')} type="date" ltr value={p.as_of} onChange={set('as_of')} />}
          {name === 'budget-actual' && <Select label={t('r3.acc.budget')} placeholder="—" value={p.budget_id} onChange={set('budget_id')} options={budgets} />}
          {name === 'ledger' && <Select label={t('r3.acc.account')} placeholder="—" value={p.account_id} onChange={set('account_id')} options={accounts} />}
        </div>
      </Card>
      <Card><List columns={cols} rows={rows} loading={q.isFetching} error={q.isError} onRetry={q.refetch} /></Card>
      {totals.length > 0 && <Card><dl className="grid gap-2 sm:grid-cols-3">{totals.map(([k, v]) => (
        <div key={k}><dt className="text-sm text-content-muted">{t(`r3.cols.${k}`, { defaultValue: k })}</dt><dd><Ltr>{fmtMoney(v, locale)}</Ltr></dd></div>))}</dl></Card>}
    </div>
  )
}

export function Bank() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const toast = useUiStore.getState().addToast
  const accounts = useOptions('accounting/accounts?active=1', a => `${a.code} ${a.name}`)
  const [account, setAccount] = useState('')
  const [csv, setCsv] = useState('')
  const [suggest, setSuggest] = useState(null)
  const q = useQuery({ queryKey: ['accounting/bank', account], queryFn: () => api.get(`/accounting/bank-reconciliation/${account}`).then(r => r.data.data), enabled: Boolean(account), retry: false })
  const act = async (action, body) => {
    try { const r = await api.post(`/accounting/bank-reconciliation/${account}/${action}`, body); toast(t('common.saved')); qc.invalidateQueries({ queryKey: ['accounting/bank'] }); return r.data.data }
    catch { return null }
  }
  const lineCols = (withMatch) => [
    { key: 'date', label: t('r3.date'), primary: true, render: r => <Ltr>{r.date}</Ltr> }, { key: 'voucher_no', label: t('r3.acc.voucher_no') },
    { key: 'debit', label: t('r3.cols.debit'), numeric: true, render: r => <Ltr>{fmtMoney(r.debit, locale)}</Ltr> },
    { key: 'credit', label: t('r3.cols.credit'), numeric: true, render: r => <Ltr>{fmtMoney(r.credit, locale)}</Ltr> },
    { key: 'actions', label: t('common.actions'), action: true, render: r => withMatch
      ? <Button variant="ghost" onClick={() => act('unmatch', { line_id: r.id })}>{t('r3.acc.unmatch')}</Button> : null },
  ]
  return (
    <div>
      <PageHeader title={t('r3.acc.bank')} subtitle={t('r3.acc.bank_hint')} />
      <Card><Select label={t('r3.acc.account')} placeholder="—" value={account} onChange={e => { setAccount(e.target.value); setSuggest(null) }} options={accounts} /></Card>
      {account && <Card>
        <Textarea label={t('r3.acc.statement_csv')} hint="date,description,debit,credit,reference" value={csv} onChange={e => setCsv(e.target.value)} />
        <div className="mt-2 flex justify-end"><Button onClick={async () => setSuggest(await act('import', { csv }))} disabled={!csv.trim()}>{t('r3.acc.suggest')}</Button></div>
        {suggest && <List rows={suggest.matches} columns={[{ key: 'reference', label: t('r3.reference'), primary: true },
          { key: 'line', label: t('r3.acc.voucher_no'), render: r => `${r.line.voucher_no} · ${r.line.date}` },
          { key: 'actions', label: t('common.actions'), action: true, render: r => <Button variant="ghost" onClick={() => act('match', { line_id: r.line_id, reference: r.reference || String(r.statement_row) })}>{t('r3.acc.match')}</Button> }]} />}
      </Card>}
      {account && <Card><h2 className="mb-2 font-medium">{t('r3.acc.unreconciled')}</h2><List rows={q.data?.unreconciled ?? []} columns={lineCols(false)} loading={q.isPending} error={q.isError} onRetry={q.refetch} /></Card>}
      {account && <Card><h2 className="mb-2 font-medium">{t('r3.acc.reconciled')}</h2><List rows={q.data?.reconciled ?? []} columns={lineCols(true)} loading={q.isPending} /></Card>}
    </div>
  )
}
