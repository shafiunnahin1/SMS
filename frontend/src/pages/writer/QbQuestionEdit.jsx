import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useFieldArray, useForm } from 'react-hook-form'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import api from '../../api/axios'
import { multipart } from '../../features/students/formData'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { ErrorState } from '../../components/StateViews'
import { Input, Select, Textarea } from '../../components/FormField'
import Check from '../../features/academic/Check'
import QbStatus from '../../features/qb/QbStatus'
import MathText from '../../features/qb/MathText'
import Ribbon from '../../features/qb/Ribbon'
import PictureDialog from '../../features/qb/PictureDialog'
import { insertAt, insertPicture, pictureRange, pushValueHistory, removePicture, stepValueHistory, updatePicture } from '../../features/qb/formatting'
import { openDiagramPicker, pickGraph } from '../../features/qb/qbankTools'
import { transformImageFile } from '../../features/qb/imageTransforms'
import { SOURCE_TYPES, occurrenceToSource, questionCode, sourceToOccurrence } from '../../features/qb/questionMeta'
import CurriculumPicker from '../../features/qb/CurriculumPicker'
import WriterFieldHelp, { WriterFieldHelpButton } from '../../features/qb/WriterFieldHelp'
import AddCurriculumItemModal from '../../features/qb/AddCurriculumItemModal'
import { flattenCurriculum, isLanguagePaperSubject, sourceLabel, subjectsForClasses, versionsForSubject } from '../../features/qb/curriculum'
import { STRUCTURED_EMPTY, StructuredEditor, StructuredPreview, fromQuestion, toPayload } from '../../features/qb/Structured'

const EDITABLE = ['draft', 'rejected']

// D72: one part of the question; defined outside the page so its fields are never remounted (their typed values would be lost)
// the numbered step mark of the metadata panel (1 classes, 2 subject & place, 3 type & marks)
const MetaStep = ({ n }) => <span aria-hidden="true" className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-on-primary">{n}</span>

function Section({ id: key, current, onEnter, children }) {
  return (
    <section id={`qbs-${key}`} data-section={key} onFocusCapture={() => onEnter(key)}
      className={`sm:col-span-2 grid gap-3 sm:grid-cols-2 scroll-mt-20 rounded-token p-2 ${current === key ? 'bg-primary-soft/40' : ''}`}>{children}</section>
  )
}
const BN_LABELS = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ']
const LEVELS = ['knowledge', 'understanding', 'application', 'higher_order']
const CREATIVE = LEVELS.map((level, i) => ({ part_label: BN_LABELS[i], cognitive_level: level, marks: String(i + 1), question_text: '', answer_text: '' }))
const PICTURE_DEFAULTS = { width: 100, align: 'center', position: 'cursor', paragraph: 1, rotation: 0, transparentBackground: false }

function tableRange(value, index) {
  const pattern = /<table\b[\s\S]*?<\/table\s*>/gi
  let match
  let current = 0
  while ((match = pattern.exec(String(value ?? ''))) !== null) {
    if (current++ === index) return { start: match.index, end: match.index + match[0].length }
  }
  return null
}

function hasPictureReference(value, mediaId) {
  if (typeof value === 'string') return Boolean(pictureRange(value, mediaId))
  if (Array.isArray(value)) return value.some(item => hasPictureReference(item, mediaId))
  if (value && typeof value === 'object') return Object.values(value).some(item => hasPictureReference(item, mediaId))
  return false
}
const EMPTY = { qb_question_type_id: '', qb_subject_id: '', qb_chapter_id: '', qb_topic_id: '', difficulty: '3', marks: '1', class_level_ids: [], question_text: '',
  curriculum_node_ids: [], answer_text: '', explanation_text: '', options: [], creative_parts: [], occurrences: [], media: [], structured: STRUCTURED_EMPTY }

// QB.2 + QB.3 /writer/questions/:id and /new (D65, D66): one form for the six core types. Shared fields (place in the curriculum,
// text, answer, explanation), then the type's own part: options with the right one (mcq), the two fixed options (true / false),
// the four creative parts ক-ঘ, a ___ blank (fill in the blank); pictures on the private disk; maths as $...$ built with mathlive;
// a live preview. A writer edits only a draft or a returned question; a moderator reviews; the Super Admin may do both.
export default function QbQuestionEdit() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const { id } = useParams()
  const isNew = id === 'new'
  const navigate = useNavigate()
  const qc = useQueryClient()
  const role = useAuthStore(s => s.user?.role)
  const tree = useQuery({ queryKey: ['writer', 'curriculum'], queryFn: () => api.get('/writer/curriculum').then(r => r.data.data) })
  const types = useQuery({ queryKey: ['writer', 'types'], queryFn: () => api.get('/writer/question-types').then(r => r.data.data) })
  const q = useQuery({ queryKey: ['writer', 'question', id], queryFn: () => api.get(`/writer/questions/${id}`).then(r => r.data.data), enabled: !isNew })
  const revs = useQuery({ queryKey: ['writer', 'revisions', id], queryFn: () => api.get(`/writer/questions/${id}/revisions`).then(r => r.data.data), enabled: !isNew })
  const { register, control, handleSubmit, reset, watch, getValues, setError, setValue, formState: { errors, isSubmitting } } = useForm({ defaultValues: EMPTY })
  const options = useFieldArray({ control, name: 'options' })
  const parts = useFieldArray({ control, name: 'creative_parts' })
  const occurrences = useFieldArray({ control, name: 'occurrences' })
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(null)
  const [history, setHistory] = useState({ undo: [], redo: [] })
  const [pictureDialog, setPictureDialog] = useState(null)
  const [pictureSaving, setPictureSaving] = useState(false)
  const [activeField, setActiveField] = useState(null)
  const [tableRequest, setTableRequest] = useState(0)
  const valueSnapshots = useRef(new Map())
  const [section, setSection] = useState('meta')
  const [sourcesOpen, setSourcesOpen] = useState(true)
  const [helpTopic, setHelpTopic] = useState(null)
  const [addItem, setAddItem] = useState(null)
  const [pane, setPane] = useState('editor')                    // below xl: the editor or the preview, as qbank's mobile switch
  const active = useRef(null)                                   // the text field the ribbon works on, and its selection
  useEffect(() => {
    if (!q.data) return
    const s = (v) => (v == null ? '' : String(v))
    reset({ ...EMPTY, ...q.data, qb_question_type_id: s(q.data.qb_question_type_id), qb_subject_id: s(q.data.qb_subject_id), qb_chapter_id: s(q.data.qb_chapter_id),
      qb_topic_id: s(q.data.qb_topic_id), difficulty: s(q.data.difficulty), marks: s(q.data.marks), answer_text: s(q.data.answer_text), explanation_text: s(q.data.explanation_text),
      creative_parts: q.data.creative_parts.map(p => ({ ...p, marks: s(p.marks), answer_text: s(p.answer_text) })),
      class_level_ids: (q.data.class_level_ids ?? []).map(String),
      curriculum_node_ids: (q.data.curriculum_node_ids ?? []).map(String),
      occurrences: q.data.occurrences.map(occurrenceToSource), structured: fromQuestion(q.data) })
  }, [q.data, reset])

  if (tree.isPending || types.isPending || (!isNew && q.isPending)) return <Loader type="page" />
  if (tree.isError || types.isError || q.isError) return <ErrorState onRetry={() => { tree.refetch(); types.refetch(); q.refetch() }} />

  const status = isNew ? 'draft' : q.data.status
  const canEdit = role === 'super_admin' || (role === 'content_writer' && EDITABLE.includes(status))
  const canCreateCurriculum = role === 'super_admin' || role === 'content_writer'
  const canSubmit = !isNew && role !== 'content_moderator' && EDITABLE.includes(status)
  const canReview = !isNew && role !== 'content_writer' && status === 'review'
  const name = (n) => (locale === 'bn' ? n.name_bn : n.name_en) || n.name_en
  const subject = tree.data.subjects.find(s => String(s.id) === String(watch('qb_subject_id')))
  // D139: class first, then the subjects of those classes; a subject with a curriculum version is placed by its syllabus path,
  // any other subject by chapter → topic. The question type is chosen separately and is never a path node.
  const classSubjects = subjectsForClasses(tree.data.subjects, watch('class_level_ids'))
  const curriculumVersions = versionsForSubject(tree.data.curriculum_versions, watch('qb_subject_id'))
  const curriculumOptions = flattenCurriculum(curriculumVersions, name)
  const usesCurriculum = curriculumVersions.length > 0 || isLanguagePaperSubject(subject)
  const chapter = subject?.chapters.find(c => String(c.id) === String(watch('qb_chapter_id')))
  const curriculumBreadcrumbs = curriculumOptions.filter(node => (watch('curriculum_node_ids') ?? []).includes(String(node.id)))
  const pickClasses = () => {                                     // a subject outside the chosen classes is cleared with its place
    const ok = subjectsForClasses(tree.data.subjects, getValues('class_level_ids')).some(x => String(x.id) === String(getValues('qb_subject_id')))
    if (!ok && getValues('qb_subject_id')) { setValue('qb_subject_id', ''); setValue('qb_chapter_id', ''); setValue('qb_topic_id', ''); setValue('curriculum_node_ids', []) }
  }
  const picked = types.data.find(ty => String(ty.id) === String(watch('qb_question_type_id')))
  const family = picked?.family
  const structure = picked?.structure ?? null                    // QB.4: gap / match / order / passage / passage_mcq
  const optionsFor = ['mcq', 'true_false'].includes(family) && !structure
  const addCreatedItem = row => {
    if (addItem?.mode === 'subject') {
      setValue('qb_subject_id', String(row.id), { shouldDirty: true })
      setValue('qb_chapter_id', '')
      setValue('qb_topic_id', '')
      setValue('curriculum_node_ids', [])
    } else if (addItem?.mode === 'chapter') {
      setValue('qb_chapter_id', String(row.id), { shouldDirty: true })
      setValue('qb_topic_id', '')
    } else if (addItem?.mode === 'topic') setValue('qb_topic_id', String(row.id), { shouldDirty: true })
    else if (addItem?.mode === 'curriculum-node') {
      const selected = (getValues('curriculum_node_ids') ?? []).map(String)
      setValue('curriculum_node_ids', [...new Set([...selected, String(row.id)])], { shouldDirty: true })
    }
    setAddItem(null)
  }
  const addOccurrence = () => {
    occurrences.append({ type: '', full: '', short: '', exam_type: '', year: '', question_number: '', set_label: '', page_reference: '' })
    setSourcesOpen(true)
  }
  const num = (v) => (v === '' || v == null ? null : Number(v))
  const track = (e) => {                                        // D72: remember the field and selection the ribbon acts on
    const el = e.target
    if (!el?.name || !(el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text'))) return
    setActiveField(el.name)
    if (!valueSnapshots.current.has(el.name)) valueSnapshots.current.set(el.name, el.value)
    active.current = { name: el.name, el, start: el.selectionStart, end: el.selectionEnd }
  }
  const recordInput = (e) => {
    const el = e.target
    if (!el?.name || !(el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type === 'text'))) return
    const previous = valueSnapshots.current.get(el.name)
    if (previous !== undefined && previous !== el.value) {
      setHistory(current => pushValueHistory(current, el.name, previous, el.selectionStart, el.selectionEnd))
      valueSnapshots.current.set(el.name, el.value)
    }
    track(e)
  }
  const run = (fn, ...args) => {
    const a = active.current
    if (!a) { useUiStore.getState().addToast(t('qbed.pick_field'), 'error'); return }
    const cur = String(getValues(a.name) ?? '')
    const r = fn(cur, a.start ?? cur.length, a.end ?? cur.length, ...args)
    setHistory(current => pushValueHistory(current, a.name, cur, a.start ?? cur.length, a.end ?? cur.length))
    valueSnapshots.current.set(a.name, r.value)
    setValue(a.name, r.value, { shouldDirty: true })
    active.current = { ...a, start: r.start, end: r.end }
    requestAnimationFrame(() => { a.el.focus(); a.el.setSelectionRange(r.start, r.end) })
  }
  const applyHistory = (direction) => {
    const a = active.current
    if (!a) { useUiStore.getState().addToast(t('qbed.pick_field'), 'error'); return }
    const cur = String(getValues(a.name) ?? '')
    const step = stepValueHistory(history, direction, a.name, { value: cur, start: a.el.selectionStart, end: a.el.selectionEnd })
    if (!step.entry) return
    setHistory(step.history)
    valueSnapshots.current.set(a.name, step.entry.value)
    setValue(a.name, step.entry.value, { shouldDirty: true })
    active.current = { ...a, start: step.entry.start, end: step.entry.end }
    requestAnimationFrame(() => { a.el.focus(); a.el.setSelectionRange(step.entry.start, step.entry.end) })
  }
  // D118: qbank's graph tool opens on the field the writer was last in; its token goes in through run(), like every ribbon action
  const insertGraph = async () => {
    const a = active.current
    if (!a) { useUiStore.getState().addToast(t('qbed.pick_field'), 'error'); return }
    try {
      const token = await pickGraph(a.el)
      if (token) run(insertAt, `\n${token}\n`)
    } catch { useUiStore.getState().addToast(t('qbed.graph_failed'), 'error') }
  }
  // D118: qbank's diagram picker; the chosen editor writes its token into the field (setRangeText + an input event the form reads)
  const insertDiagram = async () => {
    const a = active.current
    if (!a) { useUiStore.getState().addToast(t('qbed.pick_field'), 'error'); return }
    try { await openDiagramPicker(a.el) } catch { useUiStore.getState().addToast(t('qbed.diagram_failed'), 'error') }
  }
  const readActive = () => {
    const field = document.activeElement
    if (field?.name && (field.tagName === 'TEXTAREA' || (field.tagName === 'INPUT' && field.type === 'text'))) {
      const current = { name: field.name, el: field, start: field.selectionStart, end: field.selectionEnd }
      active.current = current
      return { value: String(getValues(field.name) ?? ''), start: current.start, end: current.end }
    }
    const a = active.current
    if (!a) return null
    return { value: String(getValues(a.name) ?? ''), start: a.start ?? 0, end: a.end ?? 0 }
  }
  const v = watch()
  const previewGallery = (v.media ?? []).filter(media => !hasPictureReference(v, media.id))

  const pickType = (e) => {                    // a type's own part starts filled in, so the writer only types the content
    const fam = types.data.find(ty => String(ty.id) === e.target.value)?.family
    if (fam === 'true_false' && getValues('options').length === 0) setValue('options', [{ label: 'T', content_text: t('qb.true'), is_correct: true }, { label: 'F', content_text: t('qb.false'), is_correct: false }])
    if (fam === 'mcq' && !types.data.find(ty => String(ty.id) === e.target.value)?.structure && getValues('options').length === 0) setValue('options', BN_LABELS.slice(0, 4).map((l, i) => ({ label: l, content_text: '', is_correct: i === 0 })))
    if (fam === 'creative' && getValues('creative_parts').length === 0) setValue('creative_parts', CREATIVE)
  }

  const openPictureDialog = () => {
    if (!active.current) { useUiStore.getState().addToast(t('qbed.pick_field'), 'error'); return }
    setPictureDialog({ mode: 'insert', settings: PICTURE_DEFAULTS })
  }
  const queuePicture = (file) => {
    if (!file) return
    if (!active.current) { useUiStore.getState().addToast(t('qbed.pick_field'), 'error'); return }
    setPictureDialog({ mode: 'insert', file, settings: PICTURE_DEFAULTS })
  }
  const editPreviewImage = (fieldName, attrs, sourceUrl) => {
    const field = document.getElementById('qb-question-form')?.elements.namedItem(fieldName)
    const value = String(getValues(fieldName) ?? '')
    const range = pictureRange(value, attrs.media)
    if (field && range) {
      active.current = { name: fieldName, el: field, start: range.start, end: range.end }
      setActiveField(fieldName)
    } else if (field) {
      active.current = { name: fieldName, el: field, start: value.length, end: value.length }
      setActiveField(fieldName)
    } else if (!active.current) {
      useUiStore.getState().addToast(t('qbed.pick_field'), 'error')
      return
    }
    setPictureDialog({ mode: range ? 'edit' : 'attach', mediaId: String(attrs.media), sourceUrl,
      settings: { ...PICTURE_DEFAULTS, width: attrs.width ?? 100, align: attrs.align ?? 'center' } })
  }
  const editPreviewTable = (fieldName, index) => {
    const field = document.getElementById('qb-question-form')?.elements.namedItem(fieldName)
    const value = String(getValues(fieldName) ?? '')
    const range = tableRange(value, index)
    if (!field || !range) return
    active.current = { name: fieldName, el: field, ...range }
    setActiveField(fieldName)
    field.setSelectionRange(range.start, range.end)
    setTableRequest(request => request + 1)
  }
  const savePicture = async ({ file, settings }) => {
    const target = pictureDialog
    if (!target) return
    setPictureSaving(true)
    try {
      let mediaId = target.mediaId
      if (file || (target.mode === 'edit' && settings.rotation !== 0)) {
        const form = new FormData()
        const source = file ?? await fetch(target.sourceUrl).then(response => {
          if (!response.ok) throw new Error('qbed.picture_transform_failed')
          return response.blob()
        }).then(blob => new File([blob], `picture-${target.mediaId}.png`, { type: blob.type || 'image/png' }))
        form.append('file', await transformImageFile(source, { rotation: settings.rotation, transparentBackground: settings.transparentBackground }))
        const { data } = await api.post('/writer/media', form, multipart)
        mediaId = String(data.data.id)
        const media = getValues('media') ?? []
        if (!media.some(item => String(item.id) === mediaId)) setValue('media', [...media, data.data], { shouldDirty: true })
      }
      if (target.mode === 'edit') run(updatePicture, target.mediaId, mediaId, settings)
      else run(insertPicture, Number(mediaId), settings)
      if (target.mode === 'edit' && file && target.mediaId !== mediaId && !hasPictureReference(getValues(), target.mediaId)) {
        setValue('media', (getValues('media') ?? []).filter(item => String(item.id) !== target.mediaId), { shouldDirty: true })
      }
      setPictureDialog(null)
    } catch (err) {
      const message = err.message?.startsWith('qbed.') ? t(err.message) : err.response?.data?.errors?.file?.[0] ?? err.response?.data?.message ?? t('common.error')
      useUiStore.getState().addToast(message, 'error')
    } finally { setPictureSaving(false) }
  }
  const deletePicture = () => {
    const target = pictureDialog
    if (!target || target.mode !== 'edit') return
    run(removePicture, target.mediaId)
    if (!hasPictureReference(getValues(), target.mediaId)) {
      setValue('media', (getValues('media') ?? []).filter(item => String(item.id) !== target.mediaId), { shouldDirty: true })
    }
    setPictureDialog(null)
  }
  const pasteImage = (e) => {
    const item = Array.from(e.clipboardData?.items ?? []).find(x => x.kind === 'file' && x.type.startsWith('image/'))
    const file = item?.getAsFile()
    if (!file) return
    e.preventDefault()
    track(e)
    queuePicture(file)
  }
  const allowImageDrop = (e) => {
    if (Array.from(e.dataTransfer?.items ?? []).some(x => x.kind === 'file' && x.type.startsWith('image/'))) e.preventDefault()
  }
  const dropImage = (e) => {
    const file = Array.from(e.dataTransfer?.files ?? []).find(x => x.type.startsWith('image/'))
    if (!file) return
    e.preventDefault()
    track(e)
    queuePicture(file)
  }

  const save = async (f) => {
    const body = { qb_question_type_id: num(f.qb_question_type_id), qb_subject_id: num(f.qb_subject_id), qb_chapter_id: num(f.qb_chapter_id), qb_topic_id: num(f.qb_topic_id),
      difficulty: Number(f.difficulty), marks: f.marks, class_level_ids: f.class_level_ids.map(Number),
      curriculum_node_ids: usesCurriculum ? (f.curriculum_node_ids ?? []).map(Number) : [],
      question_text: f.question_text, answer_text: f.answer_text || null, explanation_text: f.explanation_text || null,
      options: optionsFor ? f.options.map(o => ({ label: o.label, content_text: o.content_text, is_correct: Boolean(o.is_correct) })) : [],
      creative_parts: family === 'creative' ? f.creative_parts.map(p => ({ ...p, answer_text: p.answer_text || null })) : [],
      occurrences: f.occurrences.map(sourceToOccurrence),
      media_ids: f.media.map(m => m.id), ...toPayload(structure, f.structured) }
    try {
      const { data } = isNew ? await api.post('/writer/questions', body) : await api.put(`/writer/questions/${id}`, body)
      useUiStore.getState().addToast(t('common.saved'))
      qc.invalidateQueries({ queryKey: ['writer'] })
      if (isNew) navigate(`/writer/questions/${data.data.id}`, { replace: true })
    } catch (e) {
      Object.entries(e.response?.data?.errors ?? {}).forEach(([k, m]) => setError(k.replace(/\.\d+.*$/, ''), { message: m[0] }))
    }
  }
  const act = async (action, body) => {
    setBusy(action)
    try {
      await api.post(`/writer/questions/${id}/${action}`, body)
      useUiStore.getState().addToast(t(`qb.done.${action}`))
      setReason('')
      qc.invalidateQueries({ queryKey: ['writer'] })
    } catch (e) {
      if (e.response?.status === 422) useUiStore.getState().addToast(Object.values(e.response.data.errors ?? {})[0]?.[0] ?? e.response.data.message, 'error')
    } finally { setBusy(null) }
  }

  const answerHere = !['mcq', 'true_false', 'creative'].includes(family) && !structure
  // D72 (QB.12): qbank's editor layout - the parts on the side, the text fields under one ribbon in the middle, the live preview
  // beside them (the active part or the whole question). Below xl a switch shows the editor or the preview, as qbank's mobile view.
  return (
    <div className="flex flex-col gap-4" data-testid="qb-question-edit">
      <PageHeader title={isNew ? t('qb.new_question') : t('qb.question_no', { id })} actions={!isNew && <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-token bg-primary-soft px-2 py-1 font-mono text-xs text-primary-fg" dir="ltr" data-testid="qb-code" title={t('qbn.code')}>{questionCode(picked?.slug, id)}</span>
        <QbStatus status={status} /></div>} />
      {status === 'rejected' && q.data?.review_note && (
        <Card className="flex flex-col gap-1" data-testid="review-note" role="status">
          <h2 className="font-semibold">{t('qb.returned')}</h2>
          <p dir="auto" className="text-sm">{q.data.review_note}</p>
        </Card>
      )}
      <div role="tablist" aria-label={t('qbed.view')} className="flex gap-2 xl:hidden">
        {['editor', 'preview'].map(k => (
          <button key={k} type="button" role="tab" aria-selected={pane === k} onClick={() => setPane(k)}
            className={`flex-1 rounded-token px-3 py-2 text-sm font-medium ${pane === k ? 'bg-primary text-on-primary' : 'bg-surface [border:1px_solid_var(--line)]'}`}>{t(`qbed.${k}`)}</button>
        ))}
      </div>
      <div className="grid gap-4 xl:h-[calc(100vh-9rem)] xl:grid-cols-[21rem_minmax(0,1.15fr)_minmax(0,1fr)] 2xl:grid-cols-[23rem_minmax(0,1.15fr)_minmax(0,1fr)]">
        <form id="qb-question-form" onSubmit={handleSubmit(save)} className="contents" noValidate
          onFocusCapture={track} onSelectCapture={track} onKeyUpCapture={track} onMouseUpCapture={track} onInputCapture={recordInput} onPasteCapture={pasteImage}>
        <nav aria-label={t('qbed.sec.meta')} className={`${pane === 'editor' ? 'flex' : 'hidden'} min-w-0 flex-col gap-3 overflow-x-hidden xl:flex xl:min-h-0 xl:overflow-y-auto`} data-testid="qb-sections">
          <Card className="min-w-0 p-3">
            <fieldset disabled={!canEdit} className="flex min-w-0 flex-col gap-4">
              {/* 1 - classes: wrapping chips, no inner scroll; the count shows how many are picked */}
              <fieldset className="flex min-w-0 flex-col gap-2" data-testid="qb-classes">
                <legend className="mb-2 flex w-full items-center justify-between gap-2 text-sm font-semibold">
                  <span className="flex items-center gap-2"><MetaStep n={1} />{t('qbn.classes')}<WriterFieldHelpButton onClick={() => setHelpTopic('classes')} /></span>
                  {(watch('class_level_ids') ?? []).length > 0 && <span className="rounded-token bg-primary-soft px-2 text-xs font-medium text-primary-fg">{t('qbed.classes_picked', { count: (watch('class_level_ids') ?? []).length })}</span>}
                </legend>
                <div className="flex min-w-0 flex-wrap gap-1.5">{tree.data.class_levels.map(c => (
                  <label key={c.id} className="inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-token px-2 py-1 text-sm [border:1px_solid_var(--line)] has-[:checked]:bg-primary-soft has-[:checked]:text-primary-fg has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary-fg">
                    <input type="checkbox" className="h-3.5 w-3.5 shrink-0 accent-[var(--color-primary)]" value={String(c.id)} {...register('class_level_ids', { onChange: pickClasses })} />
                    <span className="min-w-0 break-words" dir="auto">{name(c)}</span>
                  </label>))}</div>
              </fieldset>
              {/* 2 - subject, then where it sits: the syllabus path (language papers) or chapter -> topic */}
              <div className="border-t border-line pt-3"><fieldset className="flex min-w-0 flex-col gap-3">
                <legend className="mb-3 flex items-center gap-2 text-sm font-semibold"><MetaStep n={2} />{t('qbed.group_place')}</legend>
                <div className="flex items-end gap-2"><Select className="min-w-0 flex-1" label={t('qb.subject')} onHelp={() => setHelpTopic('subject')} placeholder={classSubjects.length ? t('qb.pick') : t('qbed.no_subject_for_class')} error={errors.qb_subject_id?.message}
                  options={classSubjects.map(x => ({ value: String(x.id), label: name(x) }))}
                  {...register('qb_subject_id', { required: t('super.required'), onChange: () => { setValue('qb_chapter_id', ''); setValue('qb_topic_id', ''); setValue('curriculum_node_ids', []) } })} />
                  {canCreateCurriculum && <Button variant="secondary" className="shrink-0" onClick={() => setAddItem({ mode: 'subject', defaultSortOrder: Math.max(0, ...tree.data.subjects.map(item => Number(item.sort_order) || 0)) + 1 })} aria-label={t('qbed.add_item.subject.button')}><Plus aria-hidden="true" className="h-4 w-4" />{t('qb.add')}</Button>}</div>
                {usesCurriculum ? (
                  <CurriculumPicker label={t('qbed.curriculum_path')} onHelp={() => setHelpTopic('curriculum')}
                    onAddVersion={canCreateCurriculum && subject && curriculumVersions.length === 0 ? () => setAddItem({ mode: 'curriculum-version', subjectId: subject.id, defaultSortOrder: 1 }) : undefined}
                    onAdd={canCreateCurriculum && curriculumVersions.length ? ({ versionId, parentId, kind }) => {
                      const siblings = curriculumOptions.filter(node => String(node.version_id) === String(versionId) && String(node.parent_id ?? '') === String(parentId ?? ''))
                      setAddItem({ mode: 'curriculum-node', defaultVersionId: versionId, defaultParentId: parentId ?? '', defaultKind: kind, defaultSortOrder: Math.max(0, ...siblings.map(node => Number(node.sort_order) || 0)) + 1 })
                    } : undefined} versions={curriculumVersions.map(version => ({ ...version, label: name(version) }))}
                    note={t('qbed.type_not_path')} rows={curriculumOptions} value={(watch('curriculum_node_ids') ?? []).map(String)}
                    onChange={ids => setValue('curriculum_node_ids', ids, { shouldDirty: true })} disabled={!canEdit} />
                ) : <>
                  <div className="flex items-end gap-2"><Select className="min-w-0 flex-1" label={t('qb.chapter')} onHelp={() => setHelpTopic('chapter')} placeholder={t('qb.none_option')} error={errors.qb_chapter_id?.message}
                    options={(subject?.chapters ?? []).map(c => ({ value: String(c.id), label: name(c) }))} {...register('qb_chapter_id', { onChange: () => setValue('qb_topic_id', '') })} />
                    {canCreateCurriculum && subject && <Button variant="secondary" className="shrink-0" onClick={() => setAddItem({ mode: 'chapter', defaultSortOrder: Math.max(0, ...(subject.chapters ?? []).map(item => Number(item.sort_order) || 0)) + 1 })} aria-label={t('qbed.add_item.chapter.button')}><Plus aria-hidden="true" className="h-4 w-4" />{t('qb.add')}</Button>}</div>
                  <div className="flex items-end gap-2"><Select className="min-w-0 flex-1" label={t('qb.topic')} onHelp={() => setHelpTopic('topic')} placeholder={t('qb.none_option')} error={errors.qb_topic_id?.message}
                    options={(chapter?.topics ?? []).map(tp => ({ value: String(tp.id), label: name(tp) }))} {...register('qb_topic_id')} />
                    {canCreateCurriculum && chapter && <Button variant="secondary" className="shrink-0" onClick={() => setAddItem({ mode: 'topic', defaultSortOrder: Math.max(0, ...(chapter.topics ?? []).map(item => Number(item.sort_order) || 0)) + 1 })} aria-label={t('qbed.add_item.topic.button')}><Plus aria-hidden="true" className="h-4 w-4" />{t('qb.add')}</Button>}</div>
                </>}
              </fieldset></div>
              {/* 3 - what kind of question and how much it is worth */}
              <div className="border-t border-line pt-3"><fieldset className="flex min-w-0 flex-col gap-3">
                <legend className="mb-3 flex items-center gap-2 text-sm font-semibold"><MetaStep n={3} />{t('qbed.group_type')}</legend>
                <Select label={t('qbed.question_type_exam_part')} onHelp={() => setHelpTopic('type')} placeholder={t('qb.pick')} error={errors.qb_question_type_id?.message}
                  options={types.data.map(ty => ({ value: String(ty.id), label: name(ty) }))} {...register('qb_question_type_id', { required: t('super.required'), onChange: pickType })} />
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_6rem] gap-3">
                  <Select label={t('qb.difficulty')} onHelp={() => setHelpTopic('difficulty')} options={[1, 2, 3, 4, 5].map(d => ({ value: String(d), label: t(`qb.difficulty_level.${d}`) }))} {...register('difficulty')} />
                  <Input label={t('qb.marks')} onHelp={() => setHelpTopic('marks')} ltr inputMode="decimal" error={errors.marks?.message} {...register('marks')} />
                </div>
              </fieldset></div>
            </fieldset>
          </Card>
          <details className="group rounded-token bg-surface [border:1px_solid_var(--line)]" open={sourcesOpen}
            onToggle={e => { const next = e.currentTarget.open; setSourcesOpen(current => current === next ? current : next) }}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">{t('qbn.sources')}{occurrences.fields.length > 0 && <span className="rounded-token bg-surface-muted px-2 text-xs font-medium">{occurrences.fields.length}</span>}<WriterFieldHelpButton onClick={e => { e.preventDefault(); e.stopPropagation(); setHelpTopic('sources') }} /></span>
              <ChevronDown aria-hidden="true" className="h-4 w-4 text-content-muted transition group-open:rotate-180" />
            </summary>
            <div className="min-w-0 border-t border-line p-3">
              <fieldset disabled={!canEdit} className="min-w-0">
              <Section id="occurrences" current={section} onEnter={setSection} className="grid min-w-0 gap-3">
                <fieldset className="flex min-w-0 flex-col gap-3 sm:col-span-2">
                  <legend className="sr-only">{t('qbn.sources')}</legend>
                  {occurrences.fields.map((f, i) => (
                    <div key={f.id} className="grid min-w-0 grid-cols-2 gap-2 rounded-token bg-surface-muted p-2" data-testid={`source-${i}`}>
                      <div className="col-span-2 flex items-end gap-2">
                        <div className="min-w-0 flex-1"><Select label={t('qbn.source_type')} placeholder={t('qb.pick')} options={SOURCE_TYPES.map(x => ({ value: x, label: t(`qbn.source_types.${x}`) }))} {...register(`occurrences.${i}.type`)} /></div>
                        <Button variant="secondary" onClick={() => occurrences.remove(i)} aria-label={t('common.delete')}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>
                      </div>
                      <div className="col-span-2"><Input label={t('qbn.source_full')} {...register(`occurrences.${i}.full`)} /></div>
                      <Input label={t('qbn.source_short')} {...register(`occurrences.${i}.short`)} />
                      <Input label={t('qbn.exam_type')} {...register(`occurrences.${i}.exam_type`)} />
                      <Input label={t('qb.year')} ltr inputMode="numeric" {...register(`occurrences.${i}.year`)} />
                      <Input label={t('qbed.question_number')} {...register(`occurrences.${i}.question_number`)} />
                      <Input label={t('qbed.set_label')} {...register(`occurrences.${i}.set_label`)} />
                      <Input label={t('qbed.page_reference')} {...register(`occurrences.${i}.page_reference`)} />
                    </div>
                  ))}
                  <div><Button variant="secondary" onClick={addOccurrence}><Plus aria-hidden="true" className="h-4 w-4" />{t('qb.add_occurrence')}</Button></div>
                </fieldset>
              </Section>
              </fieldset>
            </div>
          </details>
        </nav>

        <div className={`${pane === 'editor' ? 'flex' : 'hidden'} min-w-0 flex-col gap-3 xl:flex xl:min-h-0 xl:overflow-y-auto`} data-testid="qb-editor-pane" onDragOver={allowImageDrop} onDrop={dropImage}>
          {canEdit && <Ribbon run={run} readActive={readActive} onImage={openPictureDialog} onGraph={insertGraph} onDiagram={insertDiagram} tableRequest={tableRequest}
            onUndo={() => applyHistory('undo')} onRedo={() => applyHistory('redo')}
            canUndo={history.undo.some(entry => entry.name === activeField)} canRedo={history.redo.some(entry => entry.name === activeField)}
            onReset={() => { reset(); setHistory({ undo: [], redo: [] }); valueSnapshots.current.clear(); active.current = null; setActiveField(null) }} disabled={!canEdit} saving={isSubmitting} />}
          <Card>
            <div className="grid gap-3 sm:grid-cols-2">
              <fieldset disabled={!canEdit} className="contents">
                {structure !== 'gap' && <Section id="question" current={section} onEnter={setSection}>
                  <Textarea className="sm:col-span-2 [&_textarea]:font-mono" label={family === 'creative' ? t('qb.stem') : t('qb.question')} rows={12}
                    hint={family === 'fill_gap' ? t('qb.blank_hint') : t('qbed.hint')} error={errors.question_text?.message} {...register('question_text', { required: t('super.required') })} />
                </Section>}

                {optionsFor && (
                  <Section id="options" current={section} onEnter={setSection}>
                    <fieldset className="sm:col-span-2 flex flex-col gap-2" data-testid="qb-options">
                      <legend className="font-semibold mb-1">{t('qb.options')}</legend>
                      {options.fields.map((f, i) => (
                        <div key={f.id} className="flex flex-wrap items-end gap-2">
                          <Input className="w-16" label={t('qb.label')} {...register(`options.${i}.label`)} readOnly={family === 'true_false'} />
                          <Input className="flex-1 min-w-40" label={t('qb.option_text')} {...register(`options.${i}.content_text`)} readOnly={family === 'true_false'} />
                          <Check label={t('qb.correct')} {...register(`options.${i}.is_correct`, family === 'true_false'
                            ? { onChange: (e) => { if (e.target.checked) options.fields.forEach((_, j) => j !== i && setValue(`options.${j}.is_correct`, false)) } } : {})} />
                          {family === 'mcq' && <Button variant="secondary" onClick={() => options.remove(i)} aria-label={t('common.delete')}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>}
                        </div>
                      ))}
                      {family === 'mcq' && options.fields.length < 8 && (
                        <div><Button variant="secondary" onClick={() => options.append({ label: BN_LABELS[options.fields.length], content_text: '', is_correct: false })}>
                          <Plus aria-hidden="true" className="h-4 w-4" />{t('qb.add_option')}</Button></div>
                      )}
                      {errors.options && <p role="alert" className="text-xs font-medium text-content">{errors.options.message}</p>}
                    </fieldset>
                  </Section>
                )}

                {family === 'creative' && (
                  <Section id="parts" current={section} onEnter={setSection}>
                    <fieldset className="sm:col-span-2 flex flex-col gap-3" data-testid="qb-parts">
                      <legend className="font-semibold mb-1">{t('qb.parts')}</legend>
                      {parts.fields.map((f, i) => (
                        <div key={f.id} className="grid gap-2 sm:grid-cols-4 rounded-token [border:1px_solid_var(--line)] p-2">
                          <Input label={t('qb.label')} {...register(`creative_parts.${i}.part_label`)} />
                          <Select label={t('qb.level')} options={LEVELS.map(l => ({ value: l, label: t(`qb.levels_cog.${l}`) }))} {...register(`creative_parts.${i}.cognitive_level`)} />
                          <Input label={t('qb.marks')} ltr inputMode="decimal" {...register(`creative_parts.${i}.marks`)} />
                          <Textarea className="sm:col-span-4" label={t('qb.part_question')} rows={2} {...register(`creative_parts.${i}.question_text`)} />
                          <Textarea className="sm:col-span-4" label={t('qb.answer')} rows={2} {...register(`creative_parts.${i}.answer_text`)} />
                        </div>
                      ))}
                      {errors.creative_parts && <p role="alert" className="text-xs font-medium text-content">{errors.creative_parts.message}</p>}
                    </fieldset>
                  </Section>
                )}

                {structure && <Section id="structured" current={section} onEnter={setSection}><StructuredEditor structure={structure} register={register} control={control} getValues={getValues} setValue={setValue} onFieldFocus={track} error={errors.items?.message ?? errors.question_text?.message} /></Section>}

                {answerHere && (
                  <Section id="answer" current={section} onEnter={setSection}>
                  <Textarea className="sm:col-span-2" label={t('qb.answer')} rows={8} error={errors.answer_text?.message} {...register('answer_text')} />
                  </Section>
                )}
                <Section id="explanation" current={section} onEnter={setSection}>
                  <Textarea className="sm:col-span-2" label={t('qb.explanation')} error={errors.explanation_text?.message} {...register('explanation_text')} />
                </Section>

                <Section id="pictures" current={section} onEnter={setSection}>
                  <fieldset className="sm:col-span-2 flex flex-col gap-2">
                    <legend className="font-semibold mb-1">{t('qb.pictures')}</legend>
                    <div className="flex flex-wrap gap-2">
                      {v.media.map(m => (
                        <figure key={m.id} className="flex flex-col items-center gap-1">
                          <img src={m.url} alt={t('qb.picture_n', { id: m.id })} className="h-20 w-auto rounded-token [border:1px_solid_var(--line)]" />
                          <Button variant="secondary" onClick={() => setValue('media', v.media.filter(x => x.id !== m.id), { shouldDirty: true })}>{t('common.delete')}</Button>
                        </figure>
                      ))}
                    </div>
                    {errors.media_ids && <p role="alert" className="text-xs font-medium text-content">{errors.media_ids.message}</p>}
                  </fieldset>
                </Section>

              </fieldset>
            </div>
            {canSubmit && (
              <div className="flex flex-wrap items-center justify-end gap-2 pt-3">
                <WriterFieldHelpButton onClick={() => setHelpTopic('workflow')} />
                <Button variant="secondary" onClick={() => act('submit')} loading={busy === 'submit'} data-action="submit">{t('qb.submit')}</Button>
              </div>
            )}
          </Card>
        </div>
        </form>

        <Card className={`${pane === 'preview' ? 'flex' : 'hidden'} min-w-0 flex-col gap-3 xl:flex xl:min-h-0 xl:overflow-y-auto`} data-testid="qb-preview" aria-live="polite">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">{t('qb.preview')}</h2>
            <span className="inline-flex items-center gap-1 text-xs text-content-muted"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" />{t('qbed.live')}</span>
          </div>
          <div className="flex flex-col gap-1 text-xs text-content-muted" data-testid="qb-preview-meta">
            {[name(tree.data.subjects.find(x => String(x.id) === String(v.qb_subject_id)) ?? {}), name(types.data.find(ty => String(ty.id) === String(v.qb_question_type_id)) ?? {})].filter(Boolean).length > 0 && (
              <span dir="auto">{[name(tree.data.subjects.find(x => String(x.id) === String(v.qb_subject_id)) ?? {}), name(types.data.find(ty => String(ty.id) === String(v.qb_question_type_id)) ?? {})].filter(Boolean).join(' · ')}</span>)}
            {usesCurriculum
              ? curriculumBreadcrumbs.map(node => <span key={node.id} dir="auto" className="break-words">{node.label}</span>)
              : <span dir="auto">{[name(chapter ?? {}), name(chapter?.topics?.find(tp => String(tp.id) === String(v.qb_topic_id)) ?? {})].filter(Boolean).join(' › ')}</span>}
            {(v.occurrences ?? []).map((o, i) => { const line = sourceLabel(sourceToOccurrence(o), t); return line && <span key={i} dir="auto">{line}</span> })}
          </div>
          {structure !== 'gap' && <div className="text-base"><MathText text={v.question_text} media={v.media} onImageClick={canEdit ? attrs => editPreviewImage('question_text', attrs, v.media.find(m => String(m.id) === attrs.media)?.url) : undefined}
            onTableClick={canEdit ? index => editPreviewTable('question_text', index) : undefined} /></div>}
          {previewGallery.map(m => canEdit
            ? <button key={m.id} type="button" onClick={() => editPreviewImage('question_text', { media: String(m.id), width: 100, align: 'center' }, m.url)} className="max-h-48 w-fit self-start rounded-token focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-fg" aria-label={t('qb.picture_n', { id: m.id })}><img src={m.url} alt="" className="max-h-48 w-auto" /></button>
            : <img key={m.id} src={m.url} alt={t('qb.picture_n', { id: m.id })} className="max-h-48 w-auto self-start" />)}
          <StructuredPreview structure={structure} s={v.structured} questionText={v.question_text} media={v.media} onImageClick={canEdit ? (fieldName, attrs, url) => editPreviewImage(fieldName, attrs, url) : undefined}
            onTableClick={canEdit ? (fieldName, index) => editPreviewTable(fieldName, index) : undefined} />
          {optionsFor && (
            <ol className="flex flex-col gap-1">
              {v.options.map((o, i) => <li key={i} className="flex gap-2"><span className="font-medium">{o.label}.</span><MathText text={o.content_text} media={v.media} onImageClick={canEdit ? attrs => editPreviewImage(`options.${i}.content_text`, attrs, v.media.find(m => String(m.id) === attrs.media)?.url) : undefined} />{o.is_correct && <span className="text-xs text-content-muted">({t('qb.correct')})</span>}</li>)}
            </ol>
          )}
          {family === 'creative' && (
            <ol className="flex flex-col gap-2">
              {v.creative_parts.map((p, i) => <li key={i}><span className="font-medium">{p.part_label}.</span> <MathText text={p.question_text} media={v.media} onImageClick={canEdit ? attrs => editPreviewImage(`creative_parts.${i}.question_text`, attrs, v.media.find(m => String(m.id) === attrs.media)?.url) : undefined} /> <span className="text-xs text-content-muted">[{p.marks}]</span></li>)}
            </ol>
          )}
          {v.answer_text && <div className="text-sm"><span className="font-medium">{t('qb.answer')}: </span><MathText text={v.answer_text} media={v.media} onImageClick={canEdit ? attrs => editPreviewImage('answer_text', attrs, v.media.find(m => String(m.id) === attrs.media)?.url) : undefined} /></div>}
          {v.explanation_text && <div className="text-sm text-content-muted"><MathText text={v.explanation_text} media={v.media} onImageClick={canEdit ? attrs => editPreviewImage('explanation_text', attrs, v.media.find(m => String(m.id) === attrs.media)?.url) : undefined} /></div>}
        </Card>
      </div>
      <PictureDialog open={Boolean(pictureDialog)} initial={pictureDialog} onClose={() => setPictureDialog(null)} onSave={savePicture} onDelete={deletePicture} saving={pictureSaving} />
      {helpTopic && <WriterFieldHelp topic={helpTopic} onClose={() => setHelpTopic(null)} />}
      {addItem && <AddCurriculumItemModal {...addItem} classes={tree.data.class_levels} classLevelIds={watch('class_level_ids') ?? []} subjectId={subject?.id}
        chapterId={chapter?.id} versions={curriculumVersions} nodes={curriculumOptions}
        onClose={() => setAddItem(null)} onCreated={addCreatedItem} />}

      {canReview && (
        <Card className="flex flex-col gap-3" data-testid="review-actions">
          <div className="flex items-center gap-2"><h2 className="font-semibold">{t('qb.review')}</h2><WriterFieldHelpButton onClick={() => setHelpTopic('workflow')} /></div>
          <Textarea label={t('qb.reason')} hint={t('qb.reason_hint')} rows={2} value={reason} onChange={e => setReason(e.target.value)} name="reason" />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => act('reject', { reason })} loading={busy === 'reject'} data-action="reject">{t('qb.reject')}</Button>
            <Button onClick={() => act('publish')} loading={busy === 'publish'} data-action="publish">{t('qb.publish')}</Button>
          </div>
        </Card>
      )}
      {!isNew && (revs.data?.length ?? 0) > 0 && (
        <Card className="flex flex-col gap-2">
          <h2 className="font-semibold">{t('qb.revisions')}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {revs.data.map(r => <li key={r.id} className="flex flex-wrap gap-2"><span dir="auto">{r.edited_by ?? '—'}</span><span className="text-content-muted" dir="ltr">{r.created_at?.slice(0, 16).replace('T', ' ')}</span></li>)}
          </ul>
        </Card>
      )}
    </div>
  )
}
