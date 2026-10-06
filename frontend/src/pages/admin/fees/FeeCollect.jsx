import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FileDown } from 'lucide-react'
import api from '../../../api/axios'
import { useTerms } from '../../../hooks/useTerms'
import { useLocale } from '../../../ui/I18nProvider'
import { useUiStore } from '../../../store/uiStore'
import { fmtMoney } from '../../../i18n/format'
import { useReceiptPdf } from '../../../features/fees/useReceiptPdf'
import PageHeader from '../../../components/PageHeader'
import Card from '../../../components/Card'
import Button from '../../../components/Button'
import Loader from '../../../components/Loader'
import { EmptyState, ErrorState } from '../../../components/StateViews'
import { Input, Select } from '../../../components/FormField'
import Ltr from '../../../components/bidi/Ltr'

// Counter collection (Step 4.4; walking-skeleton slice): find a student -> the server's dues -> tick lines -> ONE receipt -> PDF.
// Amounts are always the server's (GET /fees/dues); the client only picks which dues.
const METHODS = ['cash', 'bkash', 'nagad', 'card', 'bank_transfer', 'cheque']

export default function FeeCollect() {
  const { t } = useTranslation()
  const term = useTerms()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const pdf = useReceiptPdf()
  const [q, setQ] = useState('')
  const [student, setStudent] = useState(null)
  const [picked, setPicked] = useState({})
  const [method, setMethod] = useState('cash')
  const [saving, setSaving] = useState(false)
  const [receipt, setReceipt] = useState(null)

  const search = useQuery({ queryKey: ['students', 'find', q], enabled: q.length >= 2,
    queryFn: () => api.get('/students', { params: { q, per_page: 8 } }).then(r => r.data.data) })
  const dues = useQuery({ queryKey: ['dues', student?.id], enabled: Boolean(student),
    queryFn: () => api.get('/fees/dues', { params: { student_id: student.id } }).then(r => r.data.data) })

  const lines = dues.data?.lines ?? []
  const selected = lines.filter(l => picked[l.key])
  const total = useMemo(() => selected.reduce((s, l) => s + Math.round(Number(l.amount) * 100), 0) / 100, [selected])

  const choose = (s) => { setStudent(s); setPicked({}); setReceipt(null); setQ('') }
  const collect = async () => {
    setSaving(true)
    try {
      const { data } = await api.post('/fees/collect', { student_id: student.id, payment_method: method, lines: selected.map(l => ({ key: l.key })) })
      setReceipt(data.data); setPicked({})
      useUiStore.getState().addToast(t('fees.collected', { no: data.data.receipt_no }))
      qc.invalidateQueries({ queryKey: ['dues', student.id] })
    } catch { /* toast from the interceptor; validation keeps the selection */ } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('fees.collect_title')} />
      <Card className="flex flex-col gap-2">
        <Input type="search" label={t('fees.find_student')} placeholder={t('students.search_hint')} value={q} onChange={e => setQ(e.target.value)} />
        {q.length >= 2 && (search.isPending ? <Loader type="skeleton" rows={3} /> : search.isError ? <ErrorState onRetry={search.refetch} />
          : !search.data.length ? <EmptyState /> : (
            <ul className="flex flex-col gap-1" data-testid="student-results">
              {search.data.map(s => (
                <li key={s.id}><button type="button" onClick={() => choose(s)} className="w-full text-start px-3 h-row rounded-token hover:bg-primary-soft flex items-center justify-between gap-2">
                  <span dir="auto">{s.name}</span><span className="text-sm text-content-muted"><Ltr>{s.student_id}</Ltr> · {s.batch?.name}</span>
                </button></li>
              ))}
            </ul>))}
      </Card>

      {student && (
        <Card className="flex flex-col gap-3" data-testid="dues-card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold" dir="auto">{student.name} <span className="text-sm text-content-muted"><Ltr>{student.student_id}</Ltr></span></h2>
            <span className="text-sm text-content-muted">{t('fees.dues')}: <Ltr>{dues.data ? fmtMoney(dues.data.total, locale) : '…'}</Ltr></span>
          </div>
          {dues.isPending ? <Loader type="skeleton" rows={4} /> : dues.isError ? <ErrorState onRetry={dues.refetch} /> : !lines.length ? <EmptyState title={t('fees.no_dues')} /> : (
            <>
              <table className="w-full text-sm">
                <thead><tr className="border-b text-content-muted">
                  <th className="w-10" /><th className="text-start py-2">{t('fees.category')}</th><th className="text-start">{term('batch')}</th>
                  <th className="text-start">{t('fees.period')}</th><th className="text-end">{t('fees.amount')}</th></tr></thead>
                <tbody>
                  {lines.map(l => (
                    <tr key={l.key} className="border-b h-row">
                      <td><input type="checkbox" aria-label={`${l.category} ${l.period}`} checked={Boolean(picked[l.key])} onChange={e => setPicked(p => ({ ...p, [l.key]: e.target.checked }))} className="h-4 w-4 accent-[var(--color-primary)]" /></td>
                      <td dir="auto">{l.category}</td><td dir="auto">{dues.data.batches?.[l.batch_id] ?? ''}</td><td><Ltr>{l.period}</Ltr></td>
                      <td className="text-end"><Ltr>{fmtMoney(l.amount, locale)}</Ltr></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <Select label={t('fees.method')} value={method} onChange={e => setMethod(e.target.value)} options={METHODS.map(m => ({ value: m, label: t(`fees.methods.${m}`) }))} className="w-48" />
                <div className="flex items-center gap-3">
                  <span className="text-sm">{t('fees.selected_total')}: <strong><Ltr>{fmtMoney(total, locale)}</Ltr></strong></span>
                  <Button onClick={collect} loading={saving} disabled={!selected.length} data-testid="collect">{t('fees.pay')}</Button>
                </div>
              </div>
            </>
          )}
        </Card>
      )}

      {receipt && (
        <Card className="flex flex-wrap items-center justify-between gap-3" data-testid="receipt-card">
          <div>
            <p className="font-semibold">{t('fees.receipt')} <Ltr>{receipt.receipt_no}</Ltr></p>
            <p className="text-sm text-content-muted">{receipt.lines.length} × · {t('common.total')} <Ltr>{fmtMoney(receipt.total, locale)}</Ltr></p>
          </div>
          <Button variant="secondary" onClick={() => pdf.open(receipt.id)} loading={pdf.loading}><FileDown aria-hidden="true" className="h-4 w-4" />{t('fees.open_pdf')}</Button>
        </Card>
      )}
    </div>
  )
}
