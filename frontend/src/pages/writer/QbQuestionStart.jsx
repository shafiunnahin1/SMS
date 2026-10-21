import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useFieldArray, useForm } from 'react-hook-form'
import { Plus, Trash2 } from 'lucide-react'
import api from '../../api/axios'
import { useAuthStore } from '../../store/authStore'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'
import Check from '../../features/academic/Check'
import { SOURCE_TYPES, sourceToOccurrence } from '../../features/qb/questionMeta'
import CurriculumPicker from '../../features/qb/CurriculumPicker'
import { flattenCurriculum, isLanguagePaperSubject, subjectsForClasses, versionsForSubject } from '../../features/qb/curriculum'
import AddCurriculumItemModal from '../../features/qb/AddCurriculumItemModal'

const EMPTY_SOURCE = { type: '', full: '', short: '', exam_type: '', year: '' }

// A select with a search box above it: typing narrows the choices (qbank's "Search or select")
function SearchSelect({ label, placeholder, options, value, onChange, name, error, onAdd, addLabel }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(null)
  const shown = q ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options
  return (
    <div className="flex flex-col gap-1">
      <Select label={label} placeholder={placeholder} options={shown} value={value} onChange={e => onChange(e.target.value)} name={name} error={error} />
      <div className="flex gap-2">
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t('qbn.search')} aria-label={`${label}: ${t('qbn.search')}`}
          className="h-9 flex-1 rounded-token bg-surface px-2 text-sm [border:1px_solid_var(--line)]" />
        {onAdd && <Button variant="secondary" onClick={() => setAdding({ name_bn: q, name_en: q })} data-action={`add-${name}`}><Plus aria-hidden="true" className="h-4 w-4" />{addLabel}</Button>}
      </div>
      {adding && (
        <div className="flex flex-wrap items-end gap-2 rounded-token p-2 [border:1px_solid_var(--line)]">
          <Input className="flex-1 min-w-32" label={t('qbn.name_bn')} value={adding.name_bn} onChange={e => setAdding({ ...adding, name_bn: e.target.value })} name={`${name}_name_bn`} />
          <Input className="flex-1 min-w-32" label={t('qbn.name_en')} value={adding.name_en} onChange={e => setAdding({ ...adding, name_en: e.target.value })} name={`${name}_name_en`} />
          <Button onClick={async () => { await onAdd(adding); setAdding(null); setQ('') }} data-action={`save-${name}`}>{t('common.save')}</Button>
          <Button variant="secondary" onClick={() => setAdding(null)}>{t('common.cancel')}</Button>
        </div>
      )}
    </div>
  )
}

// D73 (QB.13) /writer/questions/start: qbank's "new question" - the academic place, the question's metadata and where it
// appeared before make a draft; the full question is written in the editor it opens. The Super Admin may add a subject,
// chapter or topic here (the curriculum's own routes).
export default function QbQuestionStart() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const role = useAuthStore(s => s.user?.role)
  const isSuper = role === 'super_admin'
  const canCreateCurriculum = isSuper || role === 'content_writer'
  const tree = useQuery({ queryKey: ['writer', 'curriculum'], queryFn: () => api.get('/writer/curriculum').then(r => r.data.data) })
  const types = useQuery({ queryKey: ['writer', 'types'], queryFn: () => api.get('/writer/question-types').then(r => r.data.data) })
  const { register, control, handleSubmit, watch, getValues, setValue, setError, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { class_level_ids: [], qb_subject_id: '', qb_chapter_id: '', qb_topic_id: '', curriculum_node_ids: [], qb_question_type_id: '', difficulty: '3', marks: '1', exam_type: '', sources: [] },
  })
  const sources = useFieldArray({ control, name: 'sources' })
  const [addItem, setAddItem] = useState(null)
  if (tree.isPending || types.isPending) return <Loader type="page" />
  if (tree.isError || types.isError) return <ErrorState onRetry={() => { tree.refetch(); types.refetch() }} />

  const name = (n) => (locale === 'bn' ? n.name_bn : n.name_en) || n.name_en || n.name_bn
  const v = watch()
  const classSubjects = subjectsForClasses(tree.data.subjects, v.class_level_ids)
  const subject = tree.data.subjects.find(s => String(s.id) === String(v.qb_subject_id))
  const chapter = subject?.chapters.find(c => String(c.id) === String(v.qb_chapter_id))
  const classes = v.class_level_ids.map(Number)
  const curriculumVersions = versionsForSubject(tree.data.curriculum_versions, v.qb_subject_id, v.class_level_ids)
  const curriculumOptions = flattenCurriculum(curriculumVersions, name)
  const pickerVersions = curriculumVersions.map(version => ({ ...version, label: name(version) }))
  const usesCurriculum = curriculumVersions.length > 0 || isLanguagePaperSubject(subject)
  const pickClasses = () => {
    const availableVersions = versionsForSubject(tree.data.curriculum_versions, getValues('qb_subject_id'), getValues('class_level_ids'))
    const availableNodeIds = new Set(flattenCurriculum(availableVersions, name).map(node => String(node.id)))
    setValue('curriculum_node_ids', (getValues('curriculum_node_ids') ?? []).filter(id => availableNodeIds.has(String(id))))
    const stillAvailable = subjectsForClasses(tree.data.subjects, getValues('class_level_ids'))
      .some(item => String(item.id) === String(getValues('qb_subject_id')))
    if (!stillAvailable && getValues('qb_subject_id')) {
      setValue('qb_subject_id', '')
      setValue('qb_chapter_id', '')
      setValue('qb_topic_id', '')
      setValue('curriculum_node_ids', [])
    }
  }
  const add = (kind, parent) => async (names) => {
    try {
      const { data } = await api.post(`/super/qb/${kind}`, { ...names, ...parent, ...(kind !== 'topics' ? { class_level_ids: classes } : {}) })
      await qc.invalidateQueries({ queryKey: ['writer', 'curriculum'] })
      await tree.refetch()
      const field = { subjects: 'qb_subject_id', chapters: 'qb_chapter_id', topics: 'qb_topic_id' }[kind]
      setValue(field, String(data.data.id))
      useUiStore.getState().addToast(t('common.saved'))
    } catch (e) {
      useUiStore.getState().addToast(Object.values(e.response?.data?.errors ?? {})[0]?.[0] ?? e.response?.data?.message ?? t('common.error'), 'error')
    }
  }
  const addCreatedCurriculumNode = row => {
    if (addItem?.mode === 'curriculum-version') {
      setAddItem(null)
      return
    }
    const selected = (getValues('curriculum_node_ids') ?? []).map(String)
    setValue('curriculum_node_ids', [...new Set([...selected, String(row.id)])], { shouldDirty: true })
    setAddItem(null)
  }
  const save = async (f) => {
    const type = types.data.find(ty => String(ty.id) === String(f.qb_question_type_id))
    const num = (x) => (x === '' || x == null ? null : Number(x))
    try {
      const { data } = await api.post('/writer/questions', {
        qb_question_type_id: num(f.qb_question_type_id), qb_subject_id: num(f.qb_subject_id),
        qb_chapter_id: usesCurriculum ? null : num(f.qb_chapter_id), qb_topic_id: usesCurriculum ? null : num(f.qb_topic_id),
        curriculum_node_ids: (f.curriculum_node_ids ?? []).map(Number),
        difficulty: Number(f.difficulty), marks: f.marks, class_level_ids: f.class_level_ids.map(Number),
        question_text: type ? name(type) : t('qb.question'),                // the draft's placeholder - the editor replaces it
        occurrences: f.sources.map(s => sourceToOccurrence({ ...s, exam_type: s.exam_type || f.exam_type })),
      })
      useUiStore.getState().addToast(t('qbn.draft_made'))
      qc.invalidateQueries({ queryKey: ['writer'] })
      navigate(`/writer/questions/${data.data.id}`)
    } catch (e) {
      Object.entries(e.response?.data?.errors ?? {}).forEach(([k, m]) => setError(k.replace(/\.\d+.*$/, ''), { message: m[0] }))
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="qb-question-start">
      <PageHeader title={t('qb.new_question')} />
      <p className="text-sm text-content-muted">{t('qbn.intro')}</p>
      <form id="qb-start-form" onSubmit={handleSubmit(save)} className="grid gap-4 xl:grid-cols-2" noValidate>
        <Card className="flex flex-col gap-3">
          <div><h2 className="font-semibold">{t('qbn.academic')}</h2><p className="text-xs text-content-muted">{t('qbn.academic_hint')}</p></div>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-medium mb-1">{t('qbn.classes')}</legend>
            <div className="flex flex-wrap gap-3">
              {tree.data.class_levels.map(c => <Check key={c.id} label={name(c)} value={String(c.id)} {...register('class_level_ids', { onChange: pickClasses })} />)}
            </div>
          </fieldset>
          <SearchSelect label={t('qb.subject')} placeholder={t('qb.pick')} name="qb_subject_id" value={v.qb_subject_id} error={errors.qb_subject_id?.message}
            options={classSubjects.map(s => ({ value: String(s.id), label: name(s) }))}
            onChange={x => { setValue('qb_subject_id', x); setValue('qb_chapter_id', ''); setValue('qb_topic_id', ''); setValue('curriculum_node_ids', []) }}
            onAdd={isSuper ? add('subjects', {}) : null} addLabel={t('qbn.add')} />
          {usesCurriculum ? <CurriculumPicker label={t('qbed.curriculum_path')} note={t('qbed.type_not_path')}
            versions={pickerVersions} rows={curriculumOptions} value={(v.curriculum_node_ids ?? []).map(String)}
            onAddVersion={canCreateCurriculum && subject ? () => setAddItem({ mode: 'curriculum-version', subjectId: subject.id, defaultSortOrder: 1 }) : undefined}
            onAdd={canCreateCurriculum && curriculumVersions.length ? ({ versionId, parentId, kind }) => {
              const siblings = curriculumOptions.filter(node => String(node.version_id) === String(versionId) && String(node.parent_id ?? '') === String(parentId ?? ''))
              setAddItem({ mode: 'curriculum-node', defaultVersionId: versionId, defaultParentId: parentId ?? '', defaultKind: kind,
                defaultSortOrder: Math.max(0, ...siblings.map(node => Number(node.sort_order) || 0)) + 1 })
            } : undefined}
            onChange={ids => setValue('curriculum_node_ids', ids)} /> : <>
            <SearchSelect label={t('qb.chapter')} placeholder={t('qb.none_option')} name="qb_chapter_id" value={v.qb_chapter_id}
              options={(subject?.chapters ?? []).map(c => ({ value: String(c.id), label: name(c) }))}
              onChange={x => { setValue('qb_chapter_id', x); setValue('qb_topic_id', '') }}
              onAdd={isSuper && subject ? add('chapters', { qb_subject_id: subject.id }) : null} addLabel={t('qbn.add')} />
            <SearchSelect label={t('qb.topic')} placeholder={t('qb.none_option')} name="qb_topic_id" value={v.qb_topic_id}
              options={(chapter?.topics ?? []).map(tp => ({ value: String(tp.id), label: name(tp) }))}
              onChange={x => setValue('qb_topic_id', x)}
              onAdd={isSuper && chapter ? add('topics', { qb_chapter_id: chapter.id }) : null} addLabel={t('qbn.add')} />
          </>}
        </Card>

        <Card className="flex flex-col gap-3">
          <div><h2 className="font-semibold">{t('qbn.metadata')}</h2><p className="text-xs text-content-muted">{t('qbn.metadata_hint')}</p></div>
          <SearchSelect label={t('qb.type')} placeholder={t('qb.pick')} name="qb_question_type_id" value={v.qb_question_type_id} error={errors.qb_question_type_id?.message}
            options={types.data.map(ty => ({ value: String(ty.id), label: name(ty) }))} onChange={x => setValue('qb_question_type_id', x)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label={t('qb.difficulty')} options={[1, 2, 3, 4, 5].map(d => ({ value: String(d), label: t(`qb.difficulty_level.${d}`) }))} {...register('difficulty')} />
            <Input label={t('qb.marks')} ltr inputMode="decimal" error={errors.marks?.message} {...register('marks')} />
          </div>
          <Input label={t('qbn.exam_type')} hint={t('qbn.exam_type_hint')} {...register('exam_type')} />
        </Card>

        <Card className="flex flex-col gap-3 xl:col-span-2">
          <div><h2 className="font-semibold">{t('qbn.sources')}</h2><p className="text-xs text-content-muted">{t('qbn.sources_hint')}</p></div>
          {sources.fields.map((f, i) => (
            <div key={f.id} className="grid gap-2 rounded-token p-2 sm:grid-cols-6 [border:1px_solid_var(--line)]" data-testid="qb-source">
              <span className="text-sm font-medium sm:col-span-6">{i + 1}</span>
              <Select label={t('qbn.source_type')} placeholder={t('qb.pick')} options={SOURCE_TYPES.map(s => ({ value: s, label: t(`qbn.source_types.${s}`) }))} {...register(`sources.${i}.type`)} />
              <Input className="sm:col-span-2" label={t('qbn.source_full')} {...register(`sources.${i}.full`)} />
              <Input label={t('qbn.source_short')} {...register(`sources.${i}.short`)} />
              <Input label={t('qb.year')} ltr inputMode="numeric" {...register(`sources.${i}.year`)} />
              <div className="flex items-end"><Button variant="secondary" onClick={() => sources.remove(i)} aria-label={t('common.delete')}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button></div>
            </div>
          ))}
          <div><Button variant="secondary" onClick={() => sources.append(EMPTY_SOURCE)} data-action="add-source"><Plus aria-hidden="true" className="h-4 w-4" />{t('qbn.add_source')}</Button></div>
        </Card>

        <Card className="flex flex-wrap items-center justify-between gap-3 xl:col-span-2">
          <p className="text-sm text-content-muted">{t('qbn.draft_hint')}</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate('/writer/questions')}>{t('common.cancel')}</Button>
            <Button type="submit" loading={isSubmitting} data-action="make-draft">{t('qbn.make_draft')}</Button>
          </div>
        </Card>
      </form>
      {addItem && <AddCurriculumItemModal {...addItem} classes={tree.data.class_levels} classLevelIds={v.class_level_ids} subjectId={subject?.id}
        versions={curriculumVersions} nodes={curriculumOptions} onClose={() => setAddItem(null)} onCreated={addCreatedCurriculumNode} />}
    </div>
  )
}
