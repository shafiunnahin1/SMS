import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { usePrint } from '../../hooks/usePrint'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import StatusBadge from '../../components/StatusBadge'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'

const TYPES = ['attestation', 'testimonial', 'participation', 'merit', 'appreciation', 'completion']

// D210 CERT.1 /admin/certificates: find a student, choose the kind (the title and a starting text are filled in from the student's
// details and can be edited), issue it (certificate number, memo number, verify code), print it, or cancel it.
export default function Certificates() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { preview } = usePrint()
  const [q, setQ] = useState('')
  const [student, setStudent] = useState(null)
  const [f, setF] = useState({ type: 'attestation', title: '', description: '' })
  const [busy, setBusy] = useState(false)
  const found = useQuery({ queryKey: ['students', 'search', q], enabled: q.trim().length >= 2, queryFn: () => api.get('/students', { params: { q: q.trim(), per_page: 10 } }).then(r => r.data.data) })
  const list = useQuery({ queryKey: ['certificates'], queryFn: () => api.get('/certificates').then(r => r.data) })
  const fill = (s, type) => {
    const cls = s?.program?.name ?? s?.enrollments?.[0]?.program?.name ?? ''
    setF({ type, title: t(`cert.titles.${type}`), description: t(`cert.texts.${type}`, { name: s?.name ?? '', father: s?.father_name ?? '—', mother: s?.mother_name ?? '—', cls, interpolation: { escapeValue: false } }) })
  }
  const pick = (s) => { setStudent(s); fill(s, f.type) }
  const issue = async () => {
    setBusy(true)
    try {
      const r = await api.post(`/students/${student.id}/certificates`, f)
      useUiStore.getState().addToast(t('cert.issued', { no: r.data.data.certificate_no }))
      setStudent(null); setQ(''); qc.invalidateQueries({ queryKey: ['certificates'] })
    } catch { /* the interceptor shows the error */ } finally { setBusy(false) }
  }
  const cancel = async (c) => {
    const reason = window.prompt(t('ptc.cancel_reason'))
    if (!reason) return
    try { await api.post(`/certificates/${c.id}/cancel`, { reason }) } catch { /* the interceptor shows the error */ } finally { qc.invalidateQueries({ queryKey: ['certificates'] }) }
  }
  return (
    <div className="flex flex-col gap-4" data-testid="certificates">
      <PageHeader title={t('cert.title')} />
      <Card className="flex flex-col gap-3" data-testid="cert-form">
        {!student ? (
          <>
            <Input label={t('ptc.find')} value={q} onChange={e => setQ(e.target.value)} name="q" />
            {(found.data ?? []).map(s => <Button key={s.id} variant="secondary" onClick={() => pick(s)} data-action="pick">{s.name} · <Ltr>{s.student_id}</Ltr></Button>)}
          </>
        ) : (
          <>
            <p className="font-medium">{student.name} <span className="text-content-muted"><Ltr>{student.student_id}</Ltr></span></p>
            <Select label={t('cert.type')} value={f.type} onChange={e => fill(student, e.target.value)} name="type" options={TYPES.map(k => ({ value: k, label: t(`cert.types.${k}`) }))} />
            <Input label={t('cert.heading')} value={f.title} onChange={e => setF(v => ({ ...v, title: e.target.value }))} name="title" maxLength={150} />
            <Textarea label={t('cert.text')} rows={6} value={f.description} onChange={e => setF(v => ({ ...v, description: e.target.value }))} name="description" maxLength={3000} />
            <p className="text-sm text-content-muted">{t('cert.issue_note')}</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setStudent(null)}>{t('common.cancel')}</Button>
              <Button onClick={issue} loading={busy} disabled={!f.title.trim()} data-action="issue">{t('cert.issue')}</Button>
            </div>
          </>
        )}
      </Card>
      {list.isPending ? <Loader type="skeleton" rows={3} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : !list.data.data.length ? <EmptyState title={t('cert.none')} /> : (
        <Card>
          <ul className="flex flex-col divide-y divide-line" data-testid="cert-list">
            {list.data.data.map(c => (
              <li key={c.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex flex-col">
                  <span className="font-medium">{c.title} · {c.student?.name} · <Ltr>{c.certificate_no}</Ltr></span>
                  <span className="text-content-muted font-mono"><Ltr>{c.memo_no_bn}</Ltr></span>
                </span>
                <span className="inline-flex items-center gap-2">
                  {c.revoked && <StatusBadge status="memo_cancelled" />}
                  <Button variant="secondary" onClick={() => preview(`/certificates/${c.id}/pdf`)} data-action="print">{t('ptc.print')}</Button>
                  {!c.revoked && <Button variant="ghost" onClick={() => cancel(c)} data-action="cancel">{t('memo.cancel')}</Button>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
