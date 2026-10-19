import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import api from '../../api/axios'
import { useLocale } from '../../ui/I18nProvider'
import { useUiStore } from '../../store/uiStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'
import MathText from '../../features/qb/MathText'
import { fmtNumber as formatNumber } from '../../i18n/format'

const FILTERS = ['', 'valid', 'invalid', 'duplicate', 'imported']

// R2.1.3 /writer/imports/:id (D123, D110): qbank's staging review - exact counts, every record with its field-path errors,
// the possible-duplicate choice, qbank's quick edit and bulk settings (they change the staged record only), then "import
// selected", which makes drafts of the selected valid records. Reads progress while the file is still being read.
export default function QbImportReview() {
  const { id } = useParams()
  const { t, i18n } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const openConfirm = useUiStore(s => s.openConfirm)
  const n = (v) => formatNumber(v, i18n.language)
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(null)
  const [bulk, setBulk] = useState({ subject: '', chapter: '', topic: '', type: '', difficulty: '', language: '' })
  const [result, setResult] = useState(null)

  const batch = useQuery({ queryKey: ['writer', 'import', id], queryFn: () => api.get(`/writer/imports/${id}`).then(r => r.data.data),
    refetchInterval: (q) => (q.state.data?.status === 'parsing' ? 1500 : false) })
  const records = useQuery({ queryKey: ['writer', 'import', id, 'records', filter, page], enabled: batch.data?.status === 'ready',
    queryFn: () => api.get(`/writer/imports/${id}/records`, { params: { filter: filter || undefined, page } }).then(r => r.data) })
  const tree = useQuery({ queryKey: ['writer', 'curriculum'], queryFn: () => api.get('/writer/curriculum').then(r => r.data.data) })
  const types = useQuery({ queryKey: ['writer', 'types'], queryFn: () => api.get('/writer/question-types').then(r => r.data.data) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['writer', 'import', id] })
  const act = useMutation({ mutationFn: ({ method = 'post', url, body }) => api[method](`/writer/imports/${id}${url}`, body).then(r => r.data), onSuccess: refresh })

  if (batch.isPending || tree.isPending || types.isPending) return <Loader type="page" />
  if (batch.isError || tree.isError || types.isError) return <ErrorState onRetry={() => { batch.refetch(); tree.refetch(); types.refetch() }} />
  const b = batch.data
  const name = (x) => (x ? ((locale === 'bn' ? x.name_bn : x.name_en) || x.name_en || x.name_bn) : '')
  const subjectOf = (ref) => tree.data.subjects.find(s => (ref?.id && s.id === ref.id) || (ref?.name && [s.name_bn, s.name_en].includes(ref.name)))
  const typeName = (slug) => name(types.data.find(ty => ty.slug === slug)) || slug || '—'
  const bulkSubject = tree.data.subjects.find(s => String(s.id) === bulk.subject)
  const bulkChapter = bulkSubject?.chapters.find(c => String(c.id) === bulk.chapter)
  const download = async () => {
    const blob = (await api.get(`/writer/imports/${id}/errors.csv`, { responseType: 'blob' })).data
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `import-${id}-errors.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const openSource = async (page) => {                 // D124: the uploaded PDF at the question's page
    const blob = (await api.get(`/writer/imports/${id}/source.pdf`, { responseType: 'blob' })).data
    window.open(`${URL.createObjectURL(blob)}#page=${page}`, '_blank', 'noopener')
  }
  const rejected = (r) => r.errors.length === 1 && r.errors[0].message === 'rejected by the reviewer'
  const finalize = () => openConfirm({ title: t('qbi.import_selected'), description: t('qbi.import_confirm'), onConfirm: async () => {
    const r = await act.mutateAsync({ url: '/finalize' })
    setResult(r.result)
  } })
  const applyBulk = () => {
    const changes = {}
    if (bulk.subject) changes.subject = Number(bulk.subject)
    if (bulk.chapter) changes.chapter = Number(bulk.chapter)
    if (bulk.topic) changes.topic = Number(bulk.topic)
    if (bulk.type) changes.type = bulk.type
    if (bulk.difficulty) changes.difficulty = Number(bulk.difficulty)
    if (bulk.language) changes.language = bulk.language
    act.mutate({ url: '/settings', body: { selected: true, changes } })
  }

  return (
    <div className="flex flex-col gap-4" data-testid="qb-import-review" data-status={b.status}>
      <PageHeader title={t('qbi.review_title')} subtitle={b.files.map(f => f.name).join(', ')}
        actions={<Link to="/writer/imports" className="text-sm text-primary-fg underline">{t('qbi.back')}</Link>} />
      <Card>
        <dl className="grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6" data-testid="qbi-counts">
          {['total', 'parsed', 'valid', 'invalid', 'duplicate', 'imported'].map(k => (
            <div key={k} data-count={k}><dt className="text-content-muted">{t(`qbi.count.${k}`)}</dt><dd className="text-lg font-semibold" dir="ltr">{n(b.counts[k])}</dd></div>
          ))}
        </dl>
        {b.status === 'parsing' && <p className="mt-2 text-sm">{t('qbi.parsing')} <Button variant="ghost" onClick={() => act.mutate({ url: '/resume' })}>{t('qbi.resume')}</Button></p>}
        {b.status === 'failed' && <p className="mt-2 text-sm text-red-600" role="alert">{t('qbi.status.failed')}: <span dir="ltr">{b.error}</span></p>}
        {b.status === 'needs_ocr' && <p className="mt-2 text-sm text-red-600" role="alert" data-testid="qbi-needs-ocr">{t('qbi.needs_ocr')}</p>}
        {b.pdf && (
          <p className="mt-2 text-sm" data-testid="qbi-pdf" data-kind={b.pdf.document_kind}>
            {t('qbi.pdf_pages', { from: n(b.pdf.page_from ?? 1), to: n(b.pdf.page_to ?? 1) })} · {t(`qbi.kind.${b.pdf.document_kind ?? 'text'}`)}
            {b.pdf.unreadable_pages.length > 0 && <> · {t('qbi.unreadable', { pages: b.pdf.unreadable_pages.map(n).join(', ') })}</>}
            {' '}<Button variant="ghost" onClick={() => openSource(1)}>{t('qbi.open_pdf')}</Button>
          </p>
        )}
        {b.counts.invalid > 0 && <Button variant="ghost" className="mt-2" onClick={download}>{t('qbi.errors_csv')}</Button>}
        {result && <p className="mt-2 text-sm" data-testid="qbi-result">{t('qbi.result', { imported: n(result.imported), invalid: n(result.invalid), dupes: n(result.duplicate_unresolved), skipped: n(result.skipped) })}</p>}
      </Card>

      {b.status === 'ready' && (
        <>
          <Card>
            <h2 className="mb-1 font-semibold">{t('qbi.bulk')}</h2>
            <p className="mb-3 text-sm text-content-muted">{t('qbi.bulk_hint')}</p>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Select label={t('qb.subject')} name="bulk_subject" value={bulk.subject} placeholder="—" onChange={e => setBulk({ ...bulk, subject: e.target.value, chapter: '', topic: '' })}
                options={tree.data.subjects.map(s => ({ value: String(s.id), label: name(s) }))} />
              <Select label={t('qb.chapter')} name="bulk_chapter" value={bulk.chapter} placeholder="—" onChange={e => setBulk({ ...bulk, chapter: e.target.value, topic: '' })}
                options={(bulkSubject?.chapters ?? []).map(c => ({ value: String(c.id), label: name(c) }))} />
              <Select label={t('qb.topic')} name="bulk_topic" value={bulk.topic} placeholder="—" onChange={e => setBulk({ ...bulk, topic: e.target.value })}
                options={(bulkChapter?.topics ?? []).map(tp => ({ value: String(tp.id), label: name(tp) }))} />
              <Select label={t('qb.type')} name="bulk_type" value={bulk.type} placeholder="—" onChange={e => setBulk({ ...bulk, type: e.target.value })}
                options={types.data.map(ty => ({ value: ty.slug, label: name(ty) }))} />
              <Select label={t('qbi.difficulty')} name="bulk_difficulty" value={bulk.difficulty} placeholder="—" onChange={e => setBulk({ ...bulk, difficulty: e.target.value })}
                options={[1, 2, 3, 4, 5].map(d => ({ value: String(d), label: n(d) }))} />
              <Select label={t('qbf.language')} name="bulk_language" value={bulk.language} placeholder="—" onChange={e => setBulk({ ...bulk, language: e.target.value })}
                options={[{ value: 'bn', label: t('qbf.lang_bn') }, { value: 'en', label: t('qbf.lang_en') }, { value: 'und', label: t('qbi.mixed') }]} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={applyBulk} disabled={!Object.values(bulk).some(Boolean)} data-testid="qbi-bulk-apply">{t('qbi.bulk_apply')}</Button>
              <Button variant="secondary" onClick={() => act.mutate({ url: '/select', body: { all_valid: true, selected: true } })} data-testid="qbi-select-valid">{t('qbi.select_valid')}</Button>
              <Button variant="secondary" onClick={() => act.mutate({ url: '/select', body: { all_valid: true, selected: false } })}>{t('qbi.select_none')}</Button>
              <Button onClick={finalize} loading={act.isPending} data-testid="qbi-finalize">{t('qbi.import_selected')}</Button>
            </div>
          </Card>

          <Card>
            <div className="mb-3 flex flex-wrap gap-2" role="tablist">
              {FILTERS.map(f => (
                <Button key={f || 'all'} variant={filter === f ? 'primary' : 'secondary'} role="tab" aria-selected={filter === f} data-filter={f || 'all'}
                  onClick={() => { setFilter(f); setPage(1) }}>{t(`qbi.filter.${f || 'all'}`)}</Button>
              ))}
            </div>
            {records.isPending ? <Loader type="list" /> : records.isError ? <ErrorState onRetry={records.refetch} /> : records.data.data.length === 0 ? <EmptyState title={t('qbi.no_records')} /> : (
              <ol className="flex flex-col gap-2">
                {records.data.data.map(r => (
                  <li key={r.id} data-record={r.record} data-valid={r.errors.length === 0 ? '1' : '0'} data-rejected={rejected(r) ? '1' : '0'}
                    className={`flex flex-col gap-2 rounded-token [border:1px_solid_var(--line)] p-3 ${rejected(r) ? 'opacity-60' : ''}`}>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <input type="checkbox" aria-label={t('qbi.select')} checked={r.selected} disabled={r.errors.length > 0 || Boolean(r.qb_question_id)}
                        onChange={e => act.mutate({ url: '/select', body: { record_ids: [r.id], selected: e.target.checked } })} />
                      <span className="font-semibold" dir="ltr">#{n(r.record)}</span>
                      {r.page && <button type="button" className="text-primary-fg underline" onClick={() => openSource(r.page)} data-testid="qbi-page">{t('qbi.page', { page: n(r.page) })}</button>}
                      <span>{typeName(r.type)}</span>
                      <span className="text-content-muted">{name(subjectOf(r.payload.subject)) || r.payload.subject?.name || ''}</span>
                      {r.has_math && <span className="rounded-token bg-surface-muted px-2">{t('qbi.has_math')}</span>}
                      {r.qb_question_id && <Link to={`/writer/questions/${r.qb_question_id}`} className="text-primary-fg underline">{t('qbi.open_draft')}</Link>}
                    </div>
                    <span dir="auto"><MathText text={r.payload.question_text ?? ''} /></span>
                    {r.errors.length > 0 && (
                      <ul className="text-sm text-red-600" data-testid="qbi-errors">
                        {r.errors.map((e, i) => <li key={i}><code dir="ltr">{e.path || '—'}</code>: {e.message}</li>)}
                      </ul>
                    )}
                    {r.warnings.length > 0 && <ul className="text-sm text-content-muted">{r.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
                    {r.duplicate_status !== 'none' && !r.qb_question_id && (
                      <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="qbi-duplicate" data-choice={r.duplicate_status}>
                        <span>{t('qbi.duplicate')} (<Link to={`/writer/questions/${r.duplicate_question_id}`} className="underline" dir="ltr">#{n(r.duplicate_question_id)}</Link>)</span>
                        <Button variant={r.duplicate_status === 'skip' ? 'primary' : 'secondary'} onClick={() => act.mutate({ url: `/records/${r.id}/duplicate`, body: { choice: 'skip' } })}>{t('qbi.dup_skip')}</Button>
                        <Button variant={r.duplicate_status === 'import' ? 'primary' : 'secondary'} onClick={() => act.mutate({ url: `/records/${r.id}/duplicate`, body: { choice: 'import' } })}>{t('qbi.dup_import')}</Button>
                      </div>
                    )}
                    {!r.qb_question_id && (editing?.id === r.id ? (
                      <QuickEdit record={r} types={types.data} tree={tree.data} name={name} t={t} saving={act.isPending}
                        onCancel={() => setEditing(null)}
                        onSave={async (changes) => { await act.mutateAsync({ method: 'patch', url: `/records/${r.id}`, body: changes }); setEditing(null) }} />
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {!rejected(r) && <Button variant="ghost" onClick={() => setEditing(r)} data-testid="qbi-edit">{t('qbi.quick_edit')}</Button>}
                        {b.format === 'pdf' && <Button variant="ghost" data-testid="qbi-reject" onClick={() => act.mutate({ url: `/records/${r.id}/reject`, body: { rejected: !rejected(r) } })}>{rejected(r) ? t('qbi.unreject') : t('qbi.reject')}</Button>}
                      </div>
                    ))}
                  </li>
                ))}
              </ol>
            )}
            {records.data?.meta?.last_page > 1 && (
              <div className="mt-3 flex items-center gap-2 text-sm">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('qbi.prev')}</Button>
                <span dir="ltr">{n(page)} / {n(records.data.meta.last_page)}</span>
                <Button variant="secondary" disabled={page >= records.data.meta.last_page} onClick={() => setPage(p => p + 1)}>{t('qbi.next')}</Button>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

// qbank's quick edit: the record's text, type and placement; the parts stay as imported (open the draft for the full editor)
function QuickEdit({ record, types, tree, name, t, saving, onSave, onCancel }) {
  const p = record.payload
  const [f, setF] = useState({ type: record.type ?? '', question_text: p.question_text ?? '', answer_text: p.answer_text ?? '', marks: p.marks ?? '',
    subject: p.subject?.id ? String(p.subject.id) : String(tree.subjects.find(s => [s.name_bn, s.name_en].includes(p.subject?.name))?.id ?? '') })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  return (
    <form className="flex flex-col gap-2" data-testid="qbi-quick-edit" onSubmit={(e) => {
      e.preventDefault()
      const changes = { question_text: f.question_text, answer_text: f.answer_text || null }
      if (f.type) changes.type = f.type
      if (f.subject) changes.subject = Number(f.subject)
      if (f.marks !== '') changes.marks = f.marks
      onSave(changes)
    }}>
      <div className="grid gap-2 sm:grid-cols-3">
        <Select label={t('qb.type')} name="type" value={f.type} placeholder="—" onChange={set('type')} options={types.map(ty => ({ value: ty.slug, label: name(ty) }))} />
        <Select label={t('qb.subject')} name="subject" value={f.subject} placeholder="—" onChange={set('subject')} options={tree.subjects.map(s => ({ value: String(s.id), label: name(s) }))} />
        <Input label={t('qbi.marks')} name="marks" value={f.marks} onChange={set('marks')} ltr />
      </div>
      <Textarea label={t('qbi.question')} name="question_text" rows={3} dir="auto" value={f.question_text} onChange={set('question_text')} />
      <Textarea label={t('qbi.answer')} name="answer_text" rows={2} dir="auto" value={f.answer_text} onChange={set('answer_text')} />
      <div className="flex gap-2">
        <Button type="submit" loading={saving} data-testid="qbi-save">{t('qbi.save')}</Button>
        <Button variant="secondary" onClick={onCancel}>{t('qbi.cancel')}</Button>
      </div>
    </form>
  )
}
