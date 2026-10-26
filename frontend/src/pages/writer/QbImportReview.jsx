import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../../api/axios'
import { useLocale } from '../../ui/I18nProvider'
import { useUiStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'
import Check from '../../features/academic/Check'
import MathText from '../../features/qb/MathText'
import { SOURCE_TYPES, sourceToOccurrence } from '../../features/qb/questionMeta'
import { flattenCurriculum, isLanguagePaperSubject, subjectsForClasses, versionsForSubject } from '../../features/qb/curriculum'
import CurriculumPicker from '../../features/qb/CurriculumPicker'
import AddCurriculumItemModal from '../../features/qb/AddCurriculumItemModal'
import { fmtNumber as formatNumber } from '../../i18n/format'

const FILTERS = ['', 'valid', 'invalid', 'duplicate', 'imported']
const emptyBulkSource = () => ({ type: '', full: '', short: '', exam_type: '', year: '', question_number: '', set_label: '', page_reference: '' })

// R2.1.3 /writer/imports/:id (D123, D154, D110): qbank's staging review - exact counts, every record with its field-path errors,
// the possible-duplicate choice, qbank's quick edit and bulk settings (they change the staged record only), then "send selected
// to review", which creates review items of the selected valid records. Reads progress while the file is still being read.
export default function QbImportReview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const openConfirm = useUiStore(s => s.openConfirm)
  const role = useAuthStore(s => s.user?.role)
  const n = (v) => formatNumber(v, i18n.language)
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(null)
  const [shownAnswers, setShownAnswers] = useState(() => new Set())
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkCurriculumItem, setBulkCurriculumItem] = useState(null)
  const [bulk, setBulk] = useState({ subject: '', chapter: '', topic: '', type: '', difficulty: '', language: '', marks: '', class_levels: [], curriculum_node_ids: [] })
  const [bulkSources, setBulkSources] = useState([emptyBulkSource()])
  const [result, setResult] = useState(null)

  const batch = useQuery({ queryKey: ['writer', 'import', id], queryFn: () => api.get(`/writer/imports/${id}`).then(r => r.data.data),
    refetchInterval: (q) => (q.state.data?.status === 'parsing' ? 1500 : false) })
  const records = useQuery({ queryKey: ['writer', 'import', id, 'records', filter, page], enabled: batch.data?.status === 'ready',
    queryFn: () => api.get(`/writer/imports/${id}/records`, { params: { filter: filter || undefined, page } }).then(r => r.data) })
  const tree = useQuery({ queryKey: ['writer', 'curriculum'], queryFn: () => api.get('/writer/curriculum').then(r => r.data.data) })
  const types = useQuery({ queryKey: ['writer', 'types'], queryFn: () => api.get('/writer/question-types').then(r => r.data.data) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['writer', 'import', id] })
  const act = useMutation({ mutationFn: ({ method = 'post', url, body }) => api[method](`/writer/imports/${id}${url}`, body).then(r => r.data), onSuccess: refresh })
  const openEditor = useMutation({
    mutationFn: (recordId) => api.post(`/writer/imports/${id}/records/${recordId}/open-editor`).then(r => r.data.data),
    onSuccess: (data) => { refresh(); navigate(`/writer/questions/${data.question_id}`) },
  })

  if (batch.isPending || tree.isPending || types.isPending) return <Loader type="page" />
  if (batch.isError || tree.isError || types.isError) return <ErrorState onRetry={() => { batch.refetch(); tree.refetch(); types.refetch() }} />
  const b = batch.data
  const selectableOnPage = (records.data?.data ?? []).filter(record => record.errors.length === 0 && !record.qb_question_id)
  const pageAllSelected = selectableOnPage.length > 0 && selectableOnPage.every(record => record.selected)
  const pagePartiallySelected = selectableOnPage.some(record => record.selected) && !pageAllSelected
  const name = (x) => (x ? ((locale === 'bn' ? x.name_bn : x.name_en) || x.name_en || x.name_bn) : '')
  const subjectOf = (ref) => tree.data.subjects.find(s => (ref?.id && s.id === ref.id) || (ref?.name && [s.name_bn, s.name_en].includes(ref.name)))
  const typeName = (slug) => name(types.data.find(ty => ty.slug === slug)) || slug || '—'
  const bulkSubjects = subjectsForClasses(tree.data.subjects, bulk.class_levels)
  const bulkSubject = bulkSubjects.find(s => String(s.id) === bulk.subject)
  const bulkChapter = bulkSubject?.chapters.find(c => String(c.id) === bulk.chapter)
  const bulkCurriculumVersions = versionsForSubject(tree.data.curriculum_versions, bulk.subject, bulk.class_levels)
  const bulkCurriculumRows = flattenCurriculum(bulkCurriculumVersions, name)
  const bulkUsesCurriculum = bulkCurriculumVersions.length > 0 || isLanguagePaperSubject(bulkSubject)
  const canCreateCurriculum = role === 'super_admin' || role === 'content_writer'
  const pickBulkClasses = (classId) => setBulk(old => {
    const classLevels = old.class_levels.includes(classId) ? old.class_levels.filter(value => value !== classId) : [...old.class_levels, classId]
    const subjectIsAvailable = subjectsForClasses(tree.data.subjects, classLevels).some(subject => String(subject.id) === old.subject)
    return { ...old, class_levels: classLevels, subject: subjectIsAvailable ? old.subject : '', chapter: subjectIsAvailable ? old.chapter : '',
      topic: subjectIsAvailable ? old.topic : '', curriculum_node_ids: [] }
  })
  const createdBulkCurriculumItem = row => {
    if (bulkCurriculumItem?.mode === 'subject') setBulk(old => ({ ...old, subject: String(row.id), chapter: '', topic: '', curriculum_node_ids: [] }))
    if (bulkCurriculumItem?.mode === 'chapter') setBulk(old => ({ ...old, chapter: String(row.id), topic: '' }))
    if (bulkCurriculumItem?.mode === 'topic') setBulk(old => ({ ...old, topic: String(row.id) }))
    if (bulkCurriculumItem?.mode === 'curriculum-node') setBulk(old => ({ ...old, curriculum_node_ids: [...new Set([...old.curriculum_node_ids, String(row.id)])] }))
    setBulkCurriculumItem(null)
  }
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
  const applyBulk = async () => {
    const changes = {}
    if (bulk.subject) changes.subject = Number(bulk.subject)
    if (bulk.chapter) changes.chapter = Number(bulk.chapter)
    if (bulk.topic) changes.topic = Number(bulk.topic)
    if (bulk.type) changes.type = bulk.type
    if (bulk.difficulty) changes.difficulty = Number(bulk.difficulty)
    if (bulk.language) changes.language = bulk.language
    if (bulk.marks !== '') changes.marks = bulk.marks
    if (bulk.class_levels.length) changes.class_levels = bulk.class_levels.map(Number)
    if (bulk.curriculum_node_ids.length) changes.curriculum_node_ids = bulk.curriculum_node_ids.map(Number)
    if (Object.keys(changes).length) await act.mutateAsync({ url: '/settings', body: { selected: true, changes } })
    for (const source of bulkSources.filter(row => row.type)) {
      await act.mutateAsync({ url: '/settings', body: { selected: true, changes: { source_occurrence: sourceToOccurrence(source) } } })
    }
    setBulkSources([emptyBulkSource()])
    setBulkOpen(false)
  }
  const hasBulkChanges = Boolean(bulk.subject || bulk.chapter || bulk.topic || bulk.type || bulk.difficulty || bulk.language || bulk.marks !== '' || bulk.class_levels.length || bulk.curriculum_node_ids.length || bulkSources.some(source => source.type))

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
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setBulkOpen(true)} data-testid="qbi-open-bulk">{t('qbi.bulk')}</Button>
            <Button variant="secondary" onClick={() => act.mutate({ url: '/select', body: { all_valid: true, selected: true } })} data-testid="qbi-select-valid">{t('qbi.select_valid')}</Button>
            <Button variant="secondary" onClick={() => act.mutate({ url: '/select', body: { all_valid: true, selected: false } })}>{t('qbi.select_none')}</Button>
            <Button onClick={finalize} loading={act.isPending} data-testid="qbi-finalize">{t('qbi.import_selected')}</Button>
          </div>
          {bulkOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-5" onClick={() => setBulkOpen(false)}>
          <section role="dialog" aria-modal="true" aria-labelledby="qbi-bulk-title" onClick={e => e.stopPropagation()}
            className="flex max-h-[92vh] w-full max-w-5xl flex-col gap-4 overflow-y-auto rounded-token bg-surface p-density text-content shadow-card">
              <div className="flex items-center justify-between gap-3"><div><h2 id="qbi-bulk-title" className="font-semibold">{t('qbi.bulk')}</h2><p className="mt-1 text-sm text-content-muted">{t('qbi.bulk_hint')}</p></div>
                <Button variant="ghost" aria-label={t('qbi.cancel')} onClick={() => setBulkOpen(false)}><X aria-hidden="true" className="h-5 w-5" /></Button></div>
            <fieldset className="flex flex-wrap gap-2" data-testid="qbi-bulk-classes">
              <legend className="mb-1 w-full text-sm font-medium">{t('qb.class_levels')}</legend>
              {(tree.data.class_levels ?? []).map(level => <Check key={level.id} label={name(level)} value={String(level.id)} checked={bulk.class_levels.includes(String(level.id))}
                onChange={() => pickBulkClasses(String(level.id))} />)}
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="flex min-w-0 items-end gap-2 sm:col-span-3 lg:col-span-2"><Select className="min-w-0 flex-1" label={t('qb.subject')} name="bulk_subject" value={bulk.subject} placeholder={bulkSubjects.length ? t('qb.pick') : t('qbed.no_subject_for_class')}
                onChange={e => setBulk({ ...bulk, subject: e.target.value, chapter: '', topic: '', curriculum_node_ids: [] })}
                options={bulkSubjects.map(s => ({ value: String(s.id), label: name(s) }))} />
                {canCreateCurriculum && <Button variant="secondary" className="shrink-0" aria-label={t('qbed.add_item.subject.button')} onClick={() => setBulkCurriculumItem({ mode: 'subject', defaultSortOrder: Math.max(0, ...tree.data.subjects.map(item => Number(item.sort_order) || 0)) + 1 })}><Plus aria-hidden="true" className="h-4 w-4" />{t('qb.add')}</Button>}</div>
              {bulkUsesCurriculum ? <div className="sm:col-span-3 lg:col-span-6" data-testid="qbi-bulk-curriculum">
                <CurriculumPicker label={t('qbed.curriculum_path')} rows={bulkCurriculumRows}
                  versions={bulkCurriculumVersions.map(version => ({ ...version, label: name(version) || version.version_key }))} value={bulk.curriculum_node_ids}
                  onAddVersion={canCreateCurriculum && bulkSubject && bulkCurriculumVersions.length === 0 ? () => setBulkCurriculumItem({ mode: 'curriculum-version', subjectId: bulkSubject.id, defaultSortOrder: 1 }) : undefined}
                  onAdd={canCreateCurriculum && bulkCurriculumVersions.length ? ({ versionId, parentId, kind }) => {
                    const siblings = bulkCurriculumRows.filter(node => String(node.version_id) === String(versionId) && String(node.parent_id ?? '') === String(parentId ?? ''))
                    setBulkCurriculumItem({ mode: 'curriculum-node', defaultVersionId: versionId, defaultParentId: parentId ?? '', defaultKind: kind,
                      defaultSortOrder: Math.max(0, ...siblings.map(node => Number(node.sort_order) || 0)) + 1 })
                  } : undefined}
                  onChange={ids => setBulk(old => ({ ...old, curriculum_node_ids: ids }))} />
              </div> : <>
                <div className="flex min-w-0 items-end gap-2 sm:col-span-3 lg:col-span-2"><Select className="min-w-0 flex-1" label={t('qb.chapter')} name="bulk_chapter" value={bulk.chapter} placeholder={t('qb.none_option')}
                  onChange={e => setBulk({ ...bulk, chapter: e.target.value, topic: '' })}
                  options={(bulkSubject?.chapters ?? []).map(c => ({ value: String(c.id), label: name(c) }))} />
                  {canCreateCurriculum && bulkSubject && <Button variant="secondary" className="shrink-0" aria-label={t('qbed.add_item.chapter.button')}
                    onClick={() => setBulkCurriculumItem({ mode: 'chapter', subjectId: bulkSubject.id, classLevelIds: bulk.class_levels, defaultSortOrder: Math.max(0, ...(bulkSubject.chapters ?? []).map(item => Number(item.sort_order) || 0)) + 1 })}><Plus aria-hidden="true" className="h-4 w-4" />{t('qb.add')}</Button>}</div>
                <div className="flex min-w-0 items-end gap-2 sm:col-span-3 lg:col-span-2"><Select className="min-w-0 flex-1" label={t('qb.topic')} name="bulk_topic" value={bulk.topic} placeholder={t('qb.none_option')}
                  onChange={e => setBulk({ ...bulk, topic: e.target.value })}
                  options={(bulkChapter?.topics ?? []).map(tp => ({ value: String(tp.id), label: name(tp) }))} />
                  {canCreateCurriculum && <Button variant="secondary" className="shrink-0" aria-label={t('qbed.add_item.topic.button')} disabled={!bulkChapter}
                    onClick={() => setBulkCurriculumItem({ mode: 'topic', chapterId: bulkChapter.id, defaultSortOrder: Math.max(0, ...(bulkChapter.topics ?? []).map(item => Number(item.sort_order) || 0)) + 1 })}><Plus aria-hidden="true" className="h-4 w-4" />{t('qb.add')}</Button>}</div>
              </>}
              <Select label={t('qb.type')} name="bulk_type" value={bulk.type} placeholder="—" onChange={e => setBulk({ ...bulk, type: e.target.value })}
                options={types.data.map(ty => ({ value: ty.slug, label: name(ty) }))} />
              <Select label={t('qbi.difficulty')} name="bulk_difficulty" value={bulk.difficulty} placeholder="—" onChange={e => setBulk({ ...bulk, difficulty: e.target.value })}
                options={[1, 2, 3, 4, 5].map(d => ({ value: String(d), label: n(d) }))} />
              <Select label={t('qbf.language')} name="bulk_language" value={bulk.language} placeholder="—" onChange={e => setBulk({ ...bulk, language: e.target.value })}
                options={[{ value: 'bn', label: t('qbf.lang_bn') }, { value: 'en', label: t('qbf.lang_en') }, { value: 'und', label: t('qbi.mixed') }]} />
              <Input label={t('qbi.marks')} name="bulk_marks" value={bulk.marks} onChange={e => setBulk({ ...bulk, marks: e.target.value })} ltr />
            </div>
            <fieldset className="mt-4 grid gap-3 [border-top:1px_solid_var(--line)] pt-3" data-testid="qbi-bulk-source">
              <legend className="font-medium">{t('qbi.bulk_source')}</legend>
              <p className="text-sm text-content-muted">{t('qbi.bulk_source_hint')}</p>
              {bulkSources.map((source, index) => <div key={index} className="rounded-token border border-border-subtle p-3">
                <div className="mb-2 flex items-center justify-between gap-2"><span className="text-sm font-medium">{t('qbn.add_source')} {n(index + 1)}</span>
                  {bulkSources.length > 1 && <Button variant="ghost" className="h-8 px-2" aria-label={`${t('common.delete')} ${n(index + 1)}`} onClick={() => setBulkSources(old => old.filter((_, rowIndex) => rowIndex !== index))}><X aria-hidden="true" className="h-4 w-4" /></Button>}</div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Select label={t('qbn.source_type')} name={`bulk_source_type_${index}`} value={source.type} placeholder="—"
                    onChange={e => setBulkSources(old => old.map((row, rowIndex) => rowIndex === index ? { ...row, type: e.target.value } : row))}
                    options={SOURCE_TYPES.map(type => ({ value: type, label: t(`qbn.source_types.${type}`) }))} />
                  <Input label={t('qbn.source_full')} name={`bulk_source_full_${index}`} value={source.full}
                    onChange={e => setBulkSources(old => old.map((row, rowIndex) => rowIndex === index ? { ...row, full: e.target.value } : row))} />
                  <Input label={t('qbn.source_short')} name={`bulk_source_short_${index}`} value={source.short}
                    onChange={e => setBulkSources(old => old.map((row, rowIndex) => rowIndex === index ? { ...row, short: e.target.value } : row))} />
                  <Input label={t('qbn.exam_type')} name={`bulk_source_exam_type_${index}`} value={source.exam_type}
                    onChange={e => setBulkSources(old => old.map((row, rowIndex) => rowIndex === index ? { ...row, exam_type: e.target.value } : row))} />
                  <Input label={t('qb.year')} name={`bulk_source_year_${index}`} type="number" min="1950" max="2100" ltr value={source.year}
                    onChange={e => setBulkSources(old => old.map((row, rowIndex) => rowIndex === index ? { ...row, year: e.target.value } : row))} />
                  <Input label={t('qbn.question_number')} name={`bulk_source_question_number_${index}`} value={source.question_number}
                    onChange={e => setBulkSources(old => old.map((row, rowIndex) => rowIndex === index ? { ...row, question_number: e.target.value } : row))} />
                  <Input label={t('qbn.set_label')} name={`bulk_source_set_label_${index}`} value={source.set_label}
                    onChange={e => setBulkSources(old => old.map((row, rowIndex) => rowIndex === index ? { ...row, set_label: e.target.value } : row))} />
                  <Input label={t('qbn.page_reference')} name={`bulk_source_page_reference_${index}`} value={source.page_reference}
                    onChange={e => setBulkSources(old => old.map((row, rowIndex) => rowIndex === index ? { ...row, page_reference: e.target.value } : row))} />
                </div>
              </div>)}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setBulkSources(old => [...old, emptyBulkSource()])} data-testid="qbi-source-add"><Plus aria-hidden="true" className="h-4 w-4" />{t('qbn.add_source')}</Button>
              </div>
            </fieldset>
            <div className="flex justify-end border-t border-border-subtle pt-3">
              <Button variant="secondary" onClick={applyBulk} disabled={!hasBulkChanges || act.isPending} data-testid="qbi-bulk-apply">{t('qbi.bulk_apply')}</Button>
            </div>
          </section>
          </div>}
          {bulkCurriculumItem && <AddCurriculumItemModal {...bulkCurriculumItem} classes={tree.data.class_levels} classLevelIds={bulk.class_levels}
            subjectId={bulkSubject?.id} chapterId={bulkChapter?.id} versions={bulkCurriculumVersions} nodes={bulkCurriculumRows}
            onClose={() => setBulkCurriculumItem(null)} onCreated={createdBulkCurriculumItem} />}

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <Check label={t('qbaq.select_all')} checked={pageAllSelected} disabled={selectableOnPage.length === 0 || act.isPending}
                ref={checkbox => { if (checkbox) checkbox.indeterminate = pagePartiallySelected }}
                onChange={event => act.mutate({ url: '/select', body: { record_ids: selectableOnPage.map(record => record.id), selected: event.target.checked } })} />
            </div>
            <div className="mb-3 flex flex-wrap gap-2" role="tablist">
              {FILTERS.map(f => (
                <Button key={f || 'all'} variant={filter === f ? 'primary' : 'secondary'} role="tab" aria-selected={filter === f} data-filter={f || 'all'}
                  onClick={() => { setFilter(f); setPage(1) }}>{t(`qbi.filter.${f || 'all'}`)}</Button>
              ))}
            </div>
            {records.isPending ? <Loader type="list" /> : records.isError ? <ErrorState onRetry={records.refetch} /> : records.data.data.length === 0 ? <EmptyState title={t('qbi.no_records')} /> : (
              <ol className="flex flex-col gap-3">
                {records.data.data.map(r => (
                  <li key={r.id} data-record={r.record} data-valid={r.errors.length === 0 ? '1' : '0'} data-rejected={rejected(r) ? '1' : '0'}
                    className={`group flex flex-col gap-0 overflow-hidden rounded-token border border-border-subtle bg-surface shadow-sm transition-shadow hover:shadow-md ${rejected(r) ? 'opacity-60' : ''}`}>
                    <header className="flex flex-wrap items-start gap-3 border-b border-border-subtle bg-surface-muted/30 px-5 py-4">
                      <input type="checkbox" aria-label={t('qbi.select')} className="mt-2" checked={r.selected} disabled={r.errors.length > 0 || Boolean(r.qb_question_id)}
                        onChange={e => act.mutate({ url: '/select', body: { record_ids: [r.id], selected: e.target.checked } })} />
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-token bg-primary font-semibold text-on-primary"><bdi>{n(r.record)}</bdi></span>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2 font-semibold">
                          <span>{t('qb.question_no', { id: n(r.record) })}</span>
                          {r.page && <button type="button" className="text-sm font-normal text-primary-fg underline" onClick={() => openSource(r.page)} data-testid="qbi-page">{t('qbi.page', { page: n(r.page) })}</button>}
                        </div>
                        <span className="flex flex-wrap gap-1.5 text-xs">
                          {[typeName(r.type), name(subjectOf(r.payload.subject)) || r.payload.subject?.name, name(r.payload.chapter), name(r.payload.topic)]
                            .filter(Boolean).map((label, index) => <span key={`${index}-${label}`} className="rounded-token bg-primary-soft px-2 py-0.5" dir="auto">{label}</span>)}
                          {r.has_math && <span className="rounded-token bg-primary-soft px-2 py-0.5">{t('qbi.has_math')}</span>}
                          {r.errors.length > 0 && <span className="rounded-token bg-red-100 px-2 py-0.5 text-red-700">{t('qbi.filter.invalid')}</span>}
                          {r.qb_question_id && <Link to={`/writer/questions/${r.qb_question_id}`} className="rounded-token bg-primary-soft px-2 py-0.5 text-primary-fg underline" data-testid="qbi-full-editor">{t('qbi.continue_full_editor')}</Link>}
                        </span>
                      </div>
                    </header>
                    <div className="flex flex-col gap-3 px-5 py-4">
                      <div className="text-base leading-8" dir="auto"><span className="whitespace-normal [overflow-wrap:anywhere]"><MathText text={r.payload.question_text ?? ''} /></span></div>
                      <QuestionContent payload={r.payload} t={t} showAnswers={shownAnswers.has(r.id)} onToggleAnswers={() => setShownAnswers(old => {
                        const next = new Set(old); next.has(r.id) ? next.delete(r.id) : next.add(r.id); return next
                      })} />
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
                    </div>
                    <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-subtle bg-surface-muted/30 px-5 py-3 text-xs text-content-muted">
                      {r.payload.class_levels?.length > 0 && <span>{t('qbaq.class')}: <bdi>{r.payload.class_levels.map(level => name(level) || level?.name || level).join(', ')}</bdi></span>}
                      {r.payload.marks != null && <span>{t('qbaq.marks')}: <bdi>{r.payload.marks}</bdi></span>}
                      {r.payload.difficulty && <span>{t('qbaq.difficulty')}: {t(`qbaq.level.${r.payload.difficulty}`, { defaultValue: r.payload.difficulty })}</span>}
                      {r.payload.occurrences?.[0] && <span className="rounded-token bg-surface-muted px-2 py-0.5">{Object.values(r.payload.occurrences[0]).filter(value => value != null && value !== '').join(' · ')}</span>}
                      {!r.qb_question_id && (
                      <div className="ms-auto flex flex-wrap gap-2">
                        {!rejected(r) && <Button variant="ghost" onClick={() => setEditing(r)} data-testid="qbi-edit">{t('qbi.quick_edit')}</Button>}
                        {r.errors.length === 0 && r.duplicate_status !== 'skip' && r.duplicate_status !== 'possible' && <Button variant="ghost"
                          loading={openEditor.isPending && openEditor.variables === r.id} disabled={openEditor.isPending}
                          onClick={() => openEditor.mutate(r.id)} data-testid="qbi-full-editor">{t('qbi.full_editor')}</Button>}
                        {b.format === 'pdf' && <Button variant="ghost" data-testid="qbi-reject" onClick={() => act.mutate({ url: `/records/${r.id}/reject`, body: { rejected: !rejected(r) } })}>{rejected(r) ? t('qbi.unreject') : t('qbi.reject')}</Button>}
                      </div>
                    )}
                    {openEditor.isError && openEditor.variables === r.id && <p className="text-sm text-red-600" role="alert">{openEditor.error?.response?.data?.message ?? t('qbi.full_editor_failed')}</p>}
                    </footer>
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
          {editing && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-5" onClick={() => setEditing(null)}>
            <section role="dialog" aria-modal="true" aria-labelledby="qbi-quick-edit-title" onClick={e => e.stopPropagation()}
              className="flex max-h-[92vh] w-full max-w-4xl flex-col gap-4 overflow-y-auto rounded-token bg-surface p-density text-content shadow-card">
              <div className="flex items-center justify-between gap-3"><h2 id="qbi-quick-edit-title" className="text-lg font-semibold">{t('qbi.quick_edit')} · #{n(editing.record)}</h2>
                <Button variant="ghost" aria-label={t('qbi.cancel')} onClick={() => setEditing(null)}>×</Button></div>
              <QuickEdit key={editing.id} record={editing} types={types.data} tree={tree.data} name={name} t={t} saving={act.isPending}
                onCancel={() => setEditing(null)}
                onSave={async (changes) => { await act.mutateAsync({ method: 'patch', url: `/records/${editing.id}`, body: changes }); setEditing(null) }} />
            </section>
          </div>}
        </>
      )}
    </div>
  )
}

const OPTION_LABELS = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ']

function QuestionContent({ payload, t, showAnswers, onToggleAnswers }) {
  const valueText = value => typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value, null, 2)
  const hasAnswer = (payload.options ?? []).some(option => option.is_correct) || (payload.creative_parts ?? []).some(part => part.answer_text)
    || (payload.items ?? []).some(item => item.answer_text || item.answer_json != null) || payload.answer_text || payload.explanation_text
  const hasContent = (payload.options?.length ?? 0) || (payload.creative_parts?.length ?? 0) || (payload.stimuli?.length ?? 0)
    || (payload.items?.length ?? 0) || hasAnswer || (payload.occurrences?.length ?? 0)
    || (payload.figure_descriptions?.length ?? 0) || (payload.visuals?.length ?? 0)
  if (!hasContent) return null
  return <div className="flex flex-col gap-3" data-testid="qbi-question-content">
    {(payload.stimuli ?? []).map((stimulus, index) => <section key={`stimulus-${index}`} className="rounded-token bg-surface-muted p-3">
      <h3 className="mb-1 text-sm font-semibold">{stimulus.label || t('qbi.stimulus')}</h3><MathText text={valueText(stimulus.content_text ?? stimulus.text)} />
    </section>)}
    {!!payload.figure_descriptions?.length && <section><h3 className="mb-1 text-sm font-semibold">{t('qbi.figure_descriptions')}</h3><ul className="list-inside list-disc">
      {payload.figure_descriptions.map((description, index) => <li key={`figure-${index}`}><MathText text={valueText(description)} /></li>)}
    </ul></section>}
    {!!payload.visuals?.length && <section><h3 className="mb-1 text-sm font-semibold">{t('qbi.visuals')}</h3><ul className="flex flex-col gap-1">
      {payload.visuals.map((visual, index) => <li key={`visual-${index}`}><pre className="overflow-x-auto whitespace-pre-wrap rounded-token bg-surface-muted p-2 text-sm">{valueText(visual)}</pre></li>)}
    </ul></section>}
    {!!payload.options?.length && <section><h3 className="mb-1 text-sm font-semibold">{t('qbi.options')}</h3><ol className="grid gap-2 sm:grid-cols-2">
      {payload.options.map((option, index) => <li key={`option-${index}`} className={`flex min-h-12 items-center gap-3 rounded-token border border-border-subtle bg-surface-muted/30 px-3 py-2 ${showAnswers && option.is_correct ? 'bg-primary-soft' : ''}`} dir="auto">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs">{option.label || ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ'][index] || index + 1}</span><MathText text={valueText(option.content_text ?? option.text)} />
      </li>)}
    </ol></section>}
    {!!payload.creative_parts?.length && <section><h3 className="mb-1 text-sm font-semibold">{t('qbi.creative_parts')}</h3><ol className="flex flex-col gap-3">
      {payload.creative_parts.map((part, index) => <li key={`part-${index}`} className="rounded-token [border:1px_solid_var(--line)] p-3">
        <div className="mb-1 flex flex-wrap items-center gap-2"><strong>{part.part_label || part.label || `${index + 1}.`}</strong>
          {part.cognitive_level && <span className="text-sm text-content-muted">{part.cognitive_level}</span>}{part.marks != null && <span className="text-sm text-content-muted">{t('qbi.marks')}: {part.marks}</span>}</div>
        <MathText text={valueText(part.question_text ?? part.text)} />
      </li>)}
    </ol></section>}
    {!!payload.items?.length && <section><h3 className="mb-1 text-sm font-semibold">{t('qbi.question_parts')}</h3><ol className="flex flex-col gap-2">
      {payload.items.map((item, index) => <li key={`item-${index}`} className="rounded-token [border:1px_solid_var(--line)] p-3">
        <MathText text={valueText(item.prompt_text ?? item.prompt_json)} />
        {/* a stimulus MCQ's choices live in prompt_json.options; the right one is marked only after "উত্তর দেখুন" */}
        {item.item_type === 'sub_mcq' && Array.isArray(item.prompt_json?.options) && <ol className="mt-2 grid gap-2 sm:grid-cols-2" data-testid="qbi-sub-mcq-options">
          {item.prompt_json.options.map((option, optionIndex) => {
            const correct = showAnswers && item.answer_json?.correct === optionIndex
            return <li key={`item-${index}-option-${optionIndex}`} className={`flex min-h-12 items-center gap-3 rounded-token border border-border-subtle bg-surface-muted/30 px-3 py-2 ${correct ? 'bg-primary-soft' : ''}`} dir="auto" data-correct={correct ? 'true' : undefined}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs">{OPTION_LABELS[optionIndex] || optionIndex + 1}</span><MathText text={valueText(option)} />
            </li>
          })}
        </ol>}
        {item.marks != null && <p className="text-sm text-content-muted">{t('qbi.marks')}: {item.marks}</p>}
      </li>)}
    </ol></section>}
    {hasAnswer && <>
      <Button variant="secondary" className="self-start" onClick={onToggleAnswers} aria-expanded={showAnswers} data-testid="qbi-toggle-answer">
        {showAnswers ? t('qbaq.hide_answer') : t('qbaq.show_answer')}
      </Button>
      {showAnswers && <section className="flex flex-col gap-2 rounded-token bg-primary-soft p-3 text-sm" data-testid="qbi-answer">
        {(payload.options ?? []).some(option => option.is_correct) && <div><p className="font-semibold">{t('qbaq.correct')}</p><div className="flex flex-wrap gap-2">{payload.options.map((option, index) => option.is_correct && <span key={index}>{option.label || ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ'][index] || index + 1} <MathText text={valueText(option.content_text ?? option.text)} /></span>)}</div></div>}
        {payload.answer_text && <div><p className="font-semibold">{t('qbi.answer')}</p><MathText text={valueText(payload.answer_text)} /></div>}
        {(payload.creative_parts ?? []).filter(part => part.answer_text).map((part, index) => <div key={`answer-part-${index}`}><p className="font-semibold">{part.part_label || part.label} {t('qbi.answer')}</p><MathText text={valueText(part.answer_text)} /></div>)}
        {(payload.items ?? []).filter(item => item.answer_text || item.answer_json != null).map((item, index) => {
          const choice = item.item_type === 'sub_mcq' && Number.isInteger(item.answer_json?.correct) ? item.prompt_json?.options?.[item.answer_json.correct] : undefined
          return <div key={`answer-item-${index}`}><p className="font-semibold">{t('qbi.answer')}</p>
            {choice !== undefined ? <span>{OPTION_LABELS[item.answer_json.correct] || item.answer_json.correct + 1} <MathText text={valueText(choice)} /></span>
              : <MathText text={valueText(item.answer_text ?? item.answer_json)} />}</div>
        })}
        {payload.explanation_text && <div><p className="font-semibold">{t('qbi.explanation')}</p><MathText text={valueText(payload.explanation_text)} /></div>}
      </section>}
    </>}
    {!!payload.occurrences?.length && <section><h3 className="mb-1 text-sm font-semibold">{t('qbi.sources')}</h3><ul className="flex flex-col gap-1 text-sm text-content-muted">
      {payload.occurrences.map((occurrence, index) => <li key={`source-${index}`}>{Object.entries(occurrence).filter(([, value]) => value != null && value !== '').map(([key, value]) => `${key}: ${value}`).join(' · ')}</li>)}
    </ul></section>}
  </div>
}

// qbank's quick edit: the record's text, type and placement; the parts stay as imported (open the draft for the full editor)
function QuickEdit({ record, types, tree, name, t, saving, onSave, onCancel }) {
  const p = record.payload
  const [f, setF] = useState({ type: record.type ?? '', question_text: p.question_text ?? '', answer_text: p.answer_text ?? '', marks: p.marks ?? '',
    subject: p.subject?.id ? String(p.subject.id) : String(tree.subjects.find(s => [s.name_bn, s.name_en].includes(p.subject?.name))?.id ?? ''),
    chapter: p.chapter?.id ? String(p.chapter.id) : '', topic: p.topic?.id ? String(p.topic.id) : '',
    class_levels: (p.class_levels ?? []).map(level => String(level?.id ?? level)), curriculum_node_ids: (p.curriculum_node_ids ?? []).map(String),
    difficulty: p.difficulty ?? '', language: p.language ?? '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const subject = tree.subjects.find(item => String(item.id) === f.subject)
  const chapter = (subject?.chapters ?? []).find(item => String(item.id) === f.chapter)
  const curriculumVersions = versionsForSubject(tree.curriculum_versions, f.subject, f.class_levels)
  const curriculumRows = flattenCurriculum(curriculumVersions, name)
  const toggleClass = id => setF(old => ({ ...old, class_levels: old.class_levels.includes(id)
    ? old.class_levels.filter(value => value !== id) : [...old.class_levels, id] }))
  return (
    <form className="flex flex-col gap-2" data-testid="qbi-quick-edit" onSubmit={(e) => {
      e.preventDefault()
      const changes = { question_text: f.question_text, answer_text: f.answer_text || null }
      if (f.type) changes.type = f.type
      if (f.subject) changes.subject = Number(f.subject)
      changes.chapter = f.chapter ? Number(f.chapter) : null
      changes.topic = f.topic ? Number(f.topic) : null
      changes.class_levels = f.class_levels.map(Number)
      changes.curriculum_node_ids = f.curriculum_node_ids.map(Number)
      if (f.marks !== '') changes.marks = f.marks
      if (f.difficulty !== '') changes.difficulty = Number(f.difficulty)
      if (f.language) changes.language = f.language
      onSave(changes)
    }}>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Select label={t('qb.type')} name="type" value={f.type} placeholder="—" onChange={set('type')} options={types.map(ty => ({ value: ty.slug, label: name(ty) }))} />
        <Select label={t('qb.subject')} name="subject" value={f.subject} placeholder="—" onChange={e => setF({ ...f, subject: e.target.value, chapter: '', topic: '', curriculum_node_ids: [] })} options={tree.subjects.map(s => ({ value: String(s.id), label: name(s) }))} />
        <Select label={t('qb.chapter')} name="chapter" value={f.chapter} placeholder="—" onChange={e => setF({ ...f, chapter: e.target.value, topic: '' })}
          options={(subject?.chapters ?? []).map(item => ({ value: String(item.id), label: name(item) }))} />
        <Select label={t('qb.topic')} name="topic" value={f.topic} placeholder="—" onChange={set('topic')}
          options={(chapter?.topics ?? []).map(item => ({ value: String(item.id), label: name(item) }))} />
        <Input label={t('qbi.marks')} name="marks" value={f.marks} onChange={set('marks')} ltr />
        <Select label={t('qbi.difficulty')} name="difficulty" value={String(f.difficulty)} placeholder="—" onChange={set('difficulty')}
          options={[1, 2, 3, 4, 5].map(value => ({ value: String(value), label: t(`qbi.level.${value}`, { defaultValue: value }) }))} />
        <Select label={t('qbf.language')} name="language" value={f.language} placeholder="—" onChange={set('language')}
          options={[{ value: 'bn', label: t('qbf.lang_bn') }, { value: 'en', label: t('qbf.lang_en') }, { value: 'und', label: t('qbi.mixed') }]} />
      </div>
      <fieldset className="flex flex-wrap gap-2" data-testid="qbi-quick-edit-classes">
        <legend className="mb-1 text-sm font-medium">{t('qb.class_levels')}</legend>
        {(tree.class_levels ?? []).map(level => <Check key={level.id} label={name(level)} value={String(level.id)} checked={f.class_levels.includes(String(level.id))}
          onChange={() => toggleClass(String(level.id))} />)}
      </fieldset>
      {curriculumVersions.length > 0 && <CurriculumPicker label={t('qbed.curriculum_path')} rows={curriculumRows}
        versions={curriculumVersions.map(version => ({ ...version, label: name(version) || version.version_key }))} value={f.curriculum_node_ids}
        onChange={ids => setF(old => ({ ...old, curriculum_node_ids: ids }))} />}
      <Textarea label={t('qbi.question')} name="question_text" rows={3} dir="auto" value={f.question_text} onChange={set('question_text')} />
      <Textarea label={t('qbi.answer')} name="answer_text" rows={2} dir="auto" value={f.answer_text} onChange={set('answer_text')} />
      <div className="flex gap-2">
        <Button type="submit" loading={saving} data-testid="qbi-save">{t('qbi.save')}</Button>
        <Button variant="secondary" onClick={onCancel}>{t('qbi.cancel')}</Button>
      </div>
    </form>
  )
}
