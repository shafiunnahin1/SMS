import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus } from 'lucide-react'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import StatusBadge from '../../components/StatusBadge'
import { ErrorState, EmptyState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'
import Modal from '../../ui/variants/Modal'
import Check from '../../features/academic/Check'
import RowActions from '../../features/academic/RowActions'

const KEY = ['super', 'qb-curriculum']

// QB.1 /super-admin/qb/curriculum (D65, docs/modules/question-bank.md §3ক): the platform curriculum every question hangs on -
// class → subject → chapter → topic. Four columns side by side (stacked on a phone); picking a class narrows the subjects,
// a subject shows its chapters, a chapter its topics. A node in use cannot be deleted (the server answers qb_in_use).
export default function QbCurriculum() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: KEY, queryFn: () => api.get('/super/qb/curriculum').then(r => r.data.data) })
  const [cls, setCls] = useState(null)
  const [subj, setSubj] = useState(null)
  const [chap, setChap] = useState(null)
  const [editing, setEditing] = useState(null)          // { kind, row } - row = {} for a new node
  if (q.isPending) return <Loader type="page" />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  const d = q.data
  const name = (n) => (locale === 'bn' ? n.name_bn : n.name_en) || n.name_en || n.name_bn
  const subjects = cls ? d.subjects.filter(s => s.class_level_ids.includes(cls)) : d.subjects
  const subject = d.subjects.find(s => s.id === subj) ?? null
  const chapter = subject?.chapters.find(c => c.id === chap) ?? null

  const remove = (kind, row, after) => useUiStore.getState().openConfirm({
    title: t('common.delete_confirm', { name: name(row) }), description: t('common.delete_hint'), type: 'danger', confirmLabel: t('common.delete'),
    onConfirm: async () => {
      try {
        await api.delete(`/super/qb/${kind}/${row.id}`)
        useUiStore.getState().addToast(t('common.deleted'))
        after?.()
        qc.invalidateQueries({ queryKey: KEY })
      } catch (e) {
        if (e.response?.status === 422) useUiStore.getState().addToast(e.response.data.message, 'error')
      }
    },
  })

  return (
    <div className="flex flex-col gap-4" data-testid="qb-curriculum">
      <PageHeader title={t('qb.curriculum')} />
      <p className="text-sm text-content-muted">{t('qb.curriculum_hint')}</p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Column title={t('qb.class_levels')} testid="col-class-levels" onAdd={() => setEditing({ kind: 'class-levels', row: {} })}
          empty={d.class_levels.length === 0 && t('qb.empty_class_levels')}>
          <Row active={cls === null} onSelect={() => setCls(null)} label={t('qb.all_classes')} />
          {d.class_levels.map(c => (
            <Row key={c.id} active={cls === c.id} onSelect={() => setCls(c.id)} label={name(c)} muted={!c.is_active}
              badge={!c.is_active && <StatusBadge status="inactive" />}
              actions={<RowActions name={name(c)} onEdit={() => setEditing({ kind: 'class-levels', row: c })} onDelete={() => remove('class-levels', c, () => cls === c.id && setCls(null))} />} />
          ))}
        </Column>
        <Column title={t('qb.subjects')} testid="col-subjects" onAdd={() => setEditing({ kind: 'subjects', row: cls ? { class_level_ids: [cls] } : {} })}
          empty={subjects.length === 0 && t('qb.empty_subjects')}>
          {subjects.map(s => (
            <Row key={s.id} active={subj === s.id} onSelect={() => { setSubj(s.id); setChap(null) }} label={name(s)} muted={!s.is_active}
              badge={!s.is_active && <StatusBadge status="inactive" />}
              actions={<RowActions name={name(s)} onEdit={() => setEditing({ kind: 'subjects', row: s })} onDelete={() => remove('subjects', s, () => subj === s.id && setSubj(null))} />} />
          ))}
        </Column>
        <Column title={t('qb.chapters')} testid="col-chapters" onAdd={subject && (() => setEditing({ kind: 'chapters', row: { qb_subject_id: subject.id, class_level_ids: cls ? [cls] : [] } }))}
          empty={!subject ? t('qb.pick_subject') : subject.chapters.length === 0 && t('qb.empty_chapters')}>
          {subject?.chapters.map(c => (
            <Row key={c.id} active={chap === c.id} onSelect={() => setChap(c.id)} label={c.number ? `${c.number}. ${name(c)}` : name(c)}
              actions={<RowActions name={name(c)} onEdit={() => setEditing({ kind: 'chapters', row: c })} onDelete={() => remove('chapters', c, () => chap === c.id && setChap(null))} />} />
          ))}
        </Column>
        <Column title={t('qb.topics')} testid="col-topics" onAdd={chapter && (() => setEditing({ kind: 'topics', row: { qb_chapter_id: chapter.id } }))}
          empty={!chapter ? t('qb.pick_chapter') : chapter.topics.length === 0 && t('qb.empty_topics')}>
          {chapter?.topics.map(tp => (
            <Row key={tp.id} label={name(tp)}
              actions={<RowActions name={name(tp)} onEdit={() => setEditing({ kind: 'topics', row: tp })} onDelete={() => remove('topics', tp)} />} />
          ))}
        </Column>
      </div>
      {editing && <NodeForm {...editing} classLevels={d.class_levels} levels={d.education_levels} name={name} onClose={() => setEditing(null)}
        onSaved={(row) => { if (editing.kind === 'subjects' && !editing.row.id) setSubj(row.id); setEditing(null); qc.invalidateQueries({ queryKey: KEY }) }} />}
    </div>
  )
}

function Column({ title, testid, onAdd, empty, children }) {
  const { t } = useTranslation()
  return (
    <Card className="flex flex-col gap-2" data-testid={testid}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {onAdd && <Button variant="secondary" onClick={onAdd} data-action="add"><Plus aria-hidden="true" className="h-4 w-4" />{t('qb.add')}</Button>}
      </div>
      <ul className="flex flex-col gap-1">{children}</ul>
      {empty && <EmptyState title={empty} />}
    </Card>
  )
}

function Row({ label, active, onSelect, actions, badge, muted }) {
  return (
    <li className={`flex items-center gap-2 rounded-token ${active ? 'bg-primary-soft' : ''}`}>
      {onSelect
        ? <button type="button" onClick={onSelect} aria-pressed={active} className={`flex-1 min-h-10 px-2 text-start ${muted ? 'text-content-muted' : ''}`}><span dir="auto">{label}</span></button>
        : <span dir="auto" className="flex-1 min-h-10 px-2 inline-flex items-center">{label}</span>}
      {badge}
      {actions}
    </li>
  )
}

function NodeForm({ kind, row, classLevels, levels, name, onClose, onSaved }) {
  const { t } = useTranslation()
  const isNew = !row.id
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { name_bn: row.name_bn ?? '', name_en: row.name_en ?? '', education_level: row.education_level ?? 'other', code: row.code ?? '',
      number: row.number ?? '', sort_order: row.sort_order ?? 0, is_active: row.is_active ?? true, class_level_ids: (row.class_level_ids ?? []).map(String) },
  })
  const submit = async (v) => {
    const body = { name_bn: v.name_bn, name_en: v.name_en, sort_order: Number(v.sort_order) || 0 }
    if (kind === 'class-levels') Object.assign(body, { education_level: v.education_level, is_active: Boolean(v.is_active) })
    if (kind === 'subjects') Object.assign(body, { code: v.code || null, is_active: Boolean(v.is_active) })
    if (kind === 'chapters') Object.assign(body, { number: v.number === '' ? null : Number(v.number) })
    if (kind === 'subjects' || kind === 'chapters') body.class_level_ids = [].concat(v.class_level_ids || []).map(Number)
    if (isNew && kind === 'chapters') body.qb_subject_id = row.qb_subject_id
    if (isNew && kind === 'topics') body.qb_chapter_id = row.qb_chapter_id
    try {
      const { data } = isNew ? await api.post(`/super/qb/${kind}`, body) : await api.put(`/super/qb/${kind}/${row.id}`, body)
      useUiStore.getState().addToast(t('common.saved'))
      onSaved(data.data)
    } catch (e) {
      Object.entries(e.response?.data?.errors ?? {}).forEach(([f, m]) => setError(f.replace(/\.\d+$/, ''), { message: m[0] }))
    }
  }
  const req = { required: t('super.required') }
  return (
    <Modal open onClose={onClose} title={t(isNew ? 'qb.add_kind' : 'qb.edit_kind', { kind: t(`qb.kind.${kind}`) })}>
      <form onSubmit={handleSubmit(submit)} className="grid gap-3 sm:grid-cols-2" noValidate data-testid="qb-node-form">
        <Input label={t('qb.name_bn')} error={errors.name_bn?.message} {...register('name_bn', req)} />
        <Input label={t('qb.name_en')} ltr error={errors.name_en?.message} {...register('name_en', req)} />
        {kind === 'class-levels' && <Select label={t('qb.education_level')} options={levels.map(l => ({ value: l, label: t(`qb.levels.${l}`) }))} {...register('education_level')} />}
        {kind === 'subjects' && <Input label={t('qb.code')} ltr error={errors.code?.message} {...register('code')} />}
        {kind === 'chapters' && <Input label={t('qb.number')} ltr inputMode="numeric" error={errors.number?.message} {...register('number')} />}
        <Input label={t('qb.sort_order')} ltr inputMode="numeric" error={errors.sort_order?.message} {...register('sort_order')} />
        {(kind === 'class-levels' || kind === 'subjects') && <Check label={t('qb.active')} {...register('is_active')} />}
        {(kind === 'subjects' || kind === 'chapters') && (
          <fieldset className="sm:col-span-2 flex flex-col gap-1">
            <legend className="text-sm font-medium mb-1">{t('qb.taught_in')}</legend>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3">
              {classLevels.map(c => <Check key={c.id} label={name(c)} value={String(c.id)} {...register('class_level_ids')} />)}
            </div>
            {errors.class_level_ids && <p role="alert" className="text-xs font-medium text-content">{errors.class_level_ids.message}</p>}
          </fieldset>
        )}
        <div className="sm:col-span-2 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
        </div>
      </form>
    </Modal>
  )
}
