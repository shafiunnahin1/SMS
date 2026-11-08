import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import api from '../../api/axios'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'
import { useUiStore } from '../../store/uiStore'
import Ltr from '../../components/bidi/Ltr'

// D197 AAD.3 /parent/leave: ask leave for a child (an optional doctor's note, PDF/JPG/PNG up to 2 MB) and see the decisions
export default function ParentLeave() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const children = useQuery({ queryKey: ['parent', 'children'], queryFn: () => api.get('/parent/children').then(r => r.data.data) })
  const list = useQuery({ queryKey: ['parent', 'leave'], queryFn: () => api.get('/parent/leave-requests').then(r => r.data.data) })
  const [f, setF] = useState({ child: '', from_date: '', to_date: '', reason: '' })
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [clash, setClash] = useState([])
  const child = f.child || String(children.data?.[0]?.id ?? '')
  const send = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const fd = new FormData()
      for (const k of ['from_date', 'to_date', 'reason']) fd.append(k, f[k])
      if (file) fd.append('attachment', file)
      const { data } = await api.post(`/parent/children/${child}/leave-requests`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      useUiStore.getState().addToast(data.message)
      setClash(data.data.exam_clash ?? [])
      setF(x => ({ ...x, from_date: '', to_date: '', reason: '' })); setFile(null)
      qc.invalidateQueries({ queryKey: ['parent', 'leave'] })
    } catch { /* the interceptor shows it */ } finally { setBusy(false) }
  }
  if (children.isPending) return <><PageHeader title={t('student_leave.parent_title')} /><Loader type="page" count={2} rows={3} /></>
  if (children.isError) return <ErrorState onRetry={children.refetch} />
  if (!children.data.length) return <EmptyState />
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('student_leave.parent_title')} />
      <Card>
        <form onSubmit={send} className="grid gap-3 sm:grid-cols-2" noValidate data-testid="leave-form">
          {children.data.length > 1 && <Select label={t('student_leave.child')} value={child} onChange={e => setF(x => ({ ...x, child: e.target.value }))}
            options={children.data.map(c => ({ value: String(c.id), label: c.name }))} />}
          <Input type="date" ltr label={t('student_leave.from')} value={f.from_date} onChange={e => setF(x => ({ ...x, from_date: e.target.value }))} />
          <Input type="date" ltr label={t('student_leave.to')} value={f.to_date} onChange={e => setF(x => ({ ...x, to_date: e.target.value }))} />
          <Textarea className="sm:col-span-2" label={t('student_leave.reason')} value={f.reason} onChange={e => setF(x => ({ ...x, reason: e.target.value }))} />
          <Input type="file" accept=".pdf,.jpg,.jpeg,.png" label={t('student_leave.attachment_hint')} onChange={e => setFile(e.target.files?.[0] ?? null)} />
          <div className="sm:col-span-2 flex justify-end"><Button type="submit" loading={busy} disabled={!f.from_date || !f.to_date || !f.reason}>{t('student_leave.send')}</Button></div>
        </form>
        {clash.length > 0 && <p className="mt-3 text-sm" data-testid="leave-clash">{t('student_leave.exam_clash')} {clash.map((c, n) => <span key={n} dir="auto">{c.exam} · {c.subject} (<Ltr>{c.date}</Ltr>) </span>)}</p>}
      </Card>
      {list.isPending ? <Loader type="cards" count={1} /> : list.isError ? <ErrorState onRetry={list.refetch} /> : !list.data.length ? <EmptyState title={t('student_leave.none')} /> : list.data.map(l => (
        <Card key={l.id} className="flex flex-wrap items-center justify-between gap-2" data-testid="leave-row">
          <span><span dir="auto">{l.student}</span> · <Ltr>{l.from_date} → {l.to_date}</Ltr></span>
          <span className="text-sm">{t(`student_leave.st_${l.status}`)}{l.decision_note && <> · <span dir="auto">{l.decision_note}</span></>}</span>
        </Card>
      ))}
    </div>
  )
}
