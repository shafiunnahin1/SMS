import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useFieldArray, useForm } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
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
import { insertPicture, pushValueHistory, stepValueHistory } from '../../features/qb/formatting'
import { transformImageFile } from '../../features/qb/imageTransforms'
import { SOURCE_TYPES, occurrenceToSource, questionCode, sourceToOccurrence } from '../../features/qb/questionMeta'
import { STRUCTURED_EMPTY, StructuredEditor, StructuredPreview, fromQuestion, toPayload } from '../../features/qb/Structured'

const EDITABLE = ['draft', 'rejected']

// D72: one part of the question; defined outside the page so its fields are never remounted (their typed values would be lost)
function Section({ id: key, current, onEnter, children }) {
  return (
    <section id={`qbs-${key}`} data-section={key} onFocusCapture={() => onEnter(key)}
      className={`sm:col-span-2 grid gap-3 sm:grid-cols-2 scroll-mt-20 rounded-token p-2 ${current === key ? 'bg-primary-soft/40' : ''}`}>{children}</section>
  )
}
const BN_LABELS = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ']
const LEVELS = ['knowledge', 'understanding', 'application', 'higher_order']
const CREATIVE = LEVELS.map((level, i) => ({ part_label: BN_LABELS[i], cognitive_level: level, marks: String(i + 1), question_text: '', answer_text: '' }))
const EMPTY = { qb_question_type_id: '', qb_subject_id: '', qb_chapter_id: '', qb_topic_id: '', difficulty: '3', marks: '1', language: 'bn', content_mode: '', class_level_ids: [], question_text: '',
  answer_text: '', explanation_text: '', options: [], creative_parts: [], occurrences: [], media: [], structured: STRUCTURED_EMPTY }

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
  const [pictureTransform, setPictureTransform] = useState({ rotation: 0, transparentBackground: false })
  const [activeField, setActiveField] = useState(null)
  const valueSnapshots = useRef(new Map())
  const [section, setSection] = useState('meta')
  const [pane, setPane] = useState('editor')                    // below xl: the editor or the preview, as qbank's mobile switch
  const active = useRef(null)                                   // the text field the ribbon works on, and its selection
  useEffect(() => {
    if (!q.data) return
    const s = (v) => (v == null ? '' : String(v))
    reset({ ...EMPTY, ...q.data, qb_question_type_id: s(q.data.qb_question_type_id), qb_subject_id: s(q.data.qb_subject_id), qb_chapter_id: s(q.data.qb_chapter_id),
      qb_topic_id: s(q.data.qb_topic_id), difficulty: s(q.data.difficulty), marks: s(q.data.marks), answer_text: s(q.data.answer_text), explanation_text: s(q.data.explanation_text),
      creative_parts: q.data.creative_parts.map(p => ({ ...p, marks: s(p.marks), answer_text: s(p.answer_text) })),
      content_mode: s(q.data.content_mode), class_level_ids: (q.data.class_level_ids ?? []).map(String),
      occurrences: q.data.occurrences.map(occurrenceToSource), structured: fromQuestion(q.data) })
  }, [q.data, reset])

  if (tree.isPending || types.isPending || (!isNew && q.isPending)) return <Loader type="page" />
  if (tree.isError || types.isError || q.isError) return <ErrorState onRetry={() => { tree.refetch(); types.refetch(); q.refetch() }} />

  const status = isNew ? 'draft' : q.data.status
  const canEdit = role === 'super_admin' || (role === 'content_writer' && EDITABLE.includes(status))
  const canSubmit = !isNew && role !== 'content_moderator' && EDITABLE.includes(status)
  const canReview = !isNew && role !== 'content_writer' && status === 'review'
  const name = (n) => (locale === 'bn' ? n.name_bn : n.name_en) || n.name_en
  const subject = tree.data.subjects.find(s => String(s.id) === String(watch('qb_subject_id')))
  const chapter = subject?.chapters.find(c => String(c.id) === String(watch('qb_chapter_id')))
  const picked = types.data.find(ty => String(ty.id) === String(watch('qb_question_type_id')))
  const family = picked?.family
  const structure = picked?.structure ?? null                    // QB.4: gap / match / order / passage / passage_mcq
  const optionsFor = ['mcq', 'true_false'].includes(family) && !structure
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
  const go = (key) => { setSection(key); setPane('editor'); document.getElementById(`qbs-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  const v = watch()

  const pickType = (e) => {                    // a type's own part starts filled in, so the writer only types the content
    const fam = types.data.find(ty => String(ty.id) === e.target.value)?.family
    if (fam === 'true_false' && getValues('options').length === 0) setValue('options', [{ label: 'T', content_text: t('qb.true'), is_correct: true }, { label: 'F', content_text: t('qb.false'), is_correct: false }])
    if (fam === 'mcq' && !types.data.find(ty => String(ty.id) === e.target.value)?.structure && getValues('options').length === 0) setValue('options', BN_LABELS.slice(0, 4).map((l, i) => ({ label: l, content_text: '', is_correct: i === 0 })))
    if (fam === 'creative' && getValues('creative_parts').length === 0) setValue('creative_parts', CREATIVE)
  }

  const uploadFile = async (file, placement) => {
    if (!file) return
    try {
      const form = new FormData()
      form.append('file', await transformImageFile(file, pictureTransform))
      const { data } = await api.post('/writer/media', form, multipart)
      setValue('media', [...getValues('media'), data.data], { shouldDirty: true })
      if (active.current) run(insertPicture, data.data.id, placement)
    } catch (err) {
      const message = err.message?.startsWith('qbed.') ? t(err.message) : err.response?.data?.errors?.file?.[0] ?? err.response?.data?.message ?? t('common.error')
      useUiStore.getState().addToast(message, 'error')
    }
  }
  const upload = (e, placement) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    uploadFile(file, placement)
  }
  const pasteImage = (e) => {
    const item = Array.from(e.clipboardData?.items ?? []).find(x => x.kind === 'file' && x.type.startsWith('image/'))
    const file = item?.getAsFile()
    if (!file) return
    e.preventDefault()
    track(e)
    uploadFile(file)
  }
  const allowImageDrop = (e) => {
    if (Array.from(e.dataTransfer?.items ?? []).some(x => x.kind === 'file' && x.type.startsWith('image/'))) e.preventDefault()
  }
  const dropImage = (e) => {
    const file = Array.from(e.dataTransfer?.files ?? []).find(x => x.type.startsWith('image/'))
    if (!file) return
    e.preventDefault()
    track(e)
    uploadFile(file)
  }

  const save = async (f) => {
    const body = { qb_question_type_id: num(f.qb_question_type_id), qb_subject_id: num(f.qb_subject_id), qb_chapter_id: num(f.qb_chapter_id), qb_topic_id: num(f.qb_topic_id),
      difficulty: Number(f.difficulty), marks: f.marks, language: f.language, content_mode: f.content_mode || (/\$[^$]+\$/.test(f.question_text) ? 'rich_math' : 'plain_text'), class_level_ids: f.class_level_ids.map(Number),
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
  const sections = [
    ['meta', t('qbed.sec.meta')],
    ['question', family === 'creative' ? t('qb.stem') : t('qb.question')],
    optionsFor && ['options', t('qb.options')],
    family === 'creative' && ['parts', t('qb.parts')],
    structure && ['structured', t('qbed.sec.structured')],
    answerHere && ['answer', t('qb.answer')],
    ['explanation', t('qb.explanation')],
    ['pictures', t('qb.pictures')],
    ['occurrences', t('qb.occurrences')],
  ].filter(Boolean)
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
      <div className="grid gap-4 xl:h-[calc(100vh-9rem)] xl:grid-cols-[13rem_minmax(0,1fr)_minmax(0,1fr)]">
        <nav aria-label={t('qbed.parts_nav')} className={`${pane === 'editor' ? 'flex' : 'hidden'} flex-col gap-1 xl:flex xl:min-h-0 xl:overflow-y-auto`} data-testid="qb-sections">
          <Card className="flex flex-row flex-wrap gap-1 p-2 xl:flex-col">
            {sections.map(([key, label]) => (
              <button key={key} type="button" onClick={() => go(key)} aria-current={section === key ? 'true' : undefined}
                className={`rounded-token px-3 py-2 text-start text-sm ${section === key ? 'bg-primary-soft font-semibold text-primary-fg' : 'hover:bg-surface-muted'}`}>{label}</button>
            ))}
          </Card>
        </nav>

        <div className={`${pane === 'editor' ? 'flex' : 'hidden'} min-w-0 flex-col gap-3 xl:flex xl:min-h-0 xl:overflow-y-auto`} data-testid="qb-editor-pane" onDragOver={allowImageDrop} onDrop={dropImage}>
          {canEdit && <Ribbon run={run} readActive={readActive} onImage={upload} imageTransform={pictureTransform} onImageTransformChange={setPictureTransform}
            onUndo={() => applyHistory('undo')} onRedo={() => applyHistory('redo')}
            canUndo={history.undo.some(entry => entry.name === activeField)} canRedo={history.redo.some(entry => entry.name === activeField)}
            onReset={() => { reset(); setHistory({ undo: [], redo: [] }); valueSnapshots.current.clear(); active.current = null; setActiveField(null) }} disabled={!canEdit} saving={isSubmitting} />}
          <Card>
            <form id="qb-question-form" onSubmit={handleSubmit(save)} className="grid gap-3 sm:grid-cols-2" noValidate
              onFocusCapture={track} onSelectCapture={track} onKeyUpCapture={track} onMouseUpCapture={track} onInputCapture={recordInput} onPasteCapture={pasteImage}>
              <fieldset disabled={!canEdit} className="contents">
                <Section id="meta" current={section} onEnter={setSection}>
                  <Select label={t('qb.type')} placeholder={t('qb.pick')} error={errors.qb_question_type_id?.message}
                    options={types.data.map(ty => ({ value: String(ty.id), label: name(ty) }))} {...register('qb_question_type_id', { required: t('super.required'), onChange: pickType })} />
                  <Select label={t('qb.subject')} placeholder={t('qb.pick')} error={errors.qb_subject_id?.message}
                    options={tree.data.subjects.map(s => ({ value: String(s.id), label: name(s) }))}
                    {...register('qb_subject_id', { required: t('super.required'), onChange: () => { setValue('qb_chapter_id', ''); setValue('qb_topic_id', '') } })} />
                  <Select label={t('qb.chapter')} placeholder={t('qb.none_option')} error={errors.qb_chapter_id?.message}
                    options={(subject?.chapters ?? []).map(c => ({ value: String(c.id), label: name(c) }))} {...register('qb_chapter_id', { onChange: () => setValue('qb_topic_id', '') })} />
                  <Select label={t('qb.topic')} placeholder={t('qb.none_option')} error={errors.qb_topic_id?.message}
                    options={(chapter?.topics ?? []).map(tp => ({ value: String(tp.id), label: name(tp) }))} {...register('qb_topic_id')} />
                  <Select label={t('qb.difficulty')} options={[1, 2, 3, 4, 5].map(d => ({ value: String(d), label: t(`qb.difficulty_level.${d}`) }))} {...register('difficulty')} />
                  <Input label={t('qb.marks')} ltr inputMode="decimal" error={errors.marks?.message} {...register('marks')} />
                  <Select label={t('qb.language')} options={[{ value: 'bn', label: 'বাংলা' }, { value: 'en', label: 'English' }]} {...register('language')} />
                  <Select label={t('qbn.content_mode')} placeholder={t('qbn.modes.plain_text')} options={['plain_text', 'rich_math', 'mixed'].map(m => ({ value: m, label: t(`qbn.modes.${m}`) }))} {...register('content_mode')} />
                  <fieldset className="sm:col-span-2 flex flex-col gap-1">
                    <legend className="text-sm font-medium mb-1">{t('qbn.classes')}</legend>
                    <div className="flex flex-wrap gap-3">{tree.data.class_levels.map(c => <Check key={c.id} label={name(c)} value={String(c.id)} {...register('class_level_ids')} />)}</div>
                  </fieldset>
                </Section>

                <Section id="question" current={section} onEnter={setSection}>
                  <Textarea className="sm:col-span-2 [&_textarea]:font-mono" label={family === 'creative' ? t('qb.stem') : t('qb.question')} rows={8}
                    hint={family === 'fill_gap' ? t('qb.blank_hint') : t('qbed.hint')} error={errors.question_text?.message} {...register('question_text', { required: t('super.required') })} />
                </Section>

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

                {structure && <Section id="structured" current={section} onEnter={setSection}><StructuredEditor structure={structure} register={register} control={control} error={errors.items?.message} /></Section>}

                {answerHere && (
                  <Section id="answer" current={section} onEnter={setSection}>
                    <Textarea className="sm:col-span-2" label={t('qb.answer')} rows={4} error={errors.answer_text?.message} {...register('answer_text')} />
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
                    <label className="text-sm">
                      <span className="block mb-1">{t('qb.add_picture')}</span>
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={upload} name="picture" className="text-sm" />
                    </label>
                    {errors.media_ids && <p role="alert" className="text-xs font-medium text-content">{errors.media_ids.message}</p>}
                  </fieldset>
                </Section>

                <Section id="occurrences" current={section} onEnter={setSection}>
                  <fieldset className="sm:col-span-2 flex flex-col gap-2">
                    <legend className="font-semibold mb-1">{t('qbn.sources')}</legend>
                    {occurrences.fields.map((f, i) => (
                      <div key={f.id} className="flex flex-wrap items-end gap-2">
                        <Select className="w-36" label={t('qbn.source_type')} placeholder={t('qb.pick')} options={SOURCE_TYPES.map(x => ({ value: x, label: t(`qbn.source_types.${x}`) }))} {...register(`occurrences.${i}.type`)} />
                        <Input className="flex-1 min-w-40" label={t('qbn.source_full')} {...register(`occurrences.${i}.full`)} />
                        <Input className="w-28" label={t('qbn.source_short')} {...register(`occurrences.${i}.short`)} />
                        <Input className="w-28" label={t('qbn.exam_type')} {...register(`occurrences.${i}.exam_type`)} />
                        <Input className="w-24" label={t('qb.year')} ltr inputMode="numeric" {...register(`occurrences.${i}.year`)} />
                        <Button variant="secondary" onClick={() => occurrences.remove(i)} aria-label={t('common.delete')}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    <div><Button variant="secondary" onClick={() => occurrences.append({ type: '', full: '', short: '', exam_type: '', year: '' })}><Plus aria-hidden="true" className="h-4 w-4" />{t('qb.add_occurrence')}</Button></div>
                  </fieldset>
                </Section>
              </fieldset>
            </form>
            {canSubmit && (
              <div className="flex flex-wrap justify-end gap-2 pt-3">
                <Button variant="secondary" onClick={() => act('submit')} loading={busy === 'submit'} data-action="submit">{t('qb.submit')}</Button>
              </div>
            )}
          </Card>
        </div>

        <Card className={`${pane === 'preview' ? 'flex' : 'hidden'} min-w-0 flex-col gap-3 xl:flex xl:min-h-0 xl:overflow-y-auto`} data-testid="qb-preview" aria-live="polite">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">{t('qb.preview')}</h2>
            <span className="inline-flex items-center gap-1 text-xs text-content-muted"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-primary" />{t('qbed.live')}</span>
          </div>
          <div className="text-base"><MathText text={v.question_text} media={v.media} /></div>
          {v.media.map(m => <img key={m.id} src={m.url} alt={t('qb.picture_n', { id: m.id })} className="max-h-48 w-auto self-start" />)}
          <StructuredPreview structure={structure} s={v.structured} />
          {optionsFor && (
            <ol className="flex flex-col gap-1">
              {v.options.map((o, i) => <li key={i} className="flex gap-2"><span className="font-medium">{o.label}.</span><MathText text={o.content_text} media={v.media} />{o.is_correct && <span className="text-xs text-content-muted">({t('qb.correct')})</span>}</li>)}
            </ol>
          )}
          {family === 'creative' && (
            <ol className="flex flex-col gap-2">
              {v.creative_parts.map((p, i) => <li key={i}><span className="font-medium">{p.part_label}.</span> <MathText text={p.question_text} media={v.media} /> <span className="text-xs text-content-muted">[{p.marks}]</span></li>)}
            </ol>
          )}
          {v.answer_text && <div className="text-sm"><span className="font-medium">{t('qb.answer')}: </span><MathText text={v.answer_text} /></div>}
          {v.explanation_text && <div className="text-sm text-content-muted"><MathText text={v.explanation_text} /></div>}
        </Card>
      </div>

      {canReview && (
        <Card className="flex flex-col gap-3" data-testid="review-actions">
          <h2 className="font-semibold">{t('qb.review')}</h2>
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
