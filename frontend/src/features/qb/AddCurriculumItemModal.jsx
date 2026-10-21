import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useAuthStore } from '../../store/authStore'
import Modal from '../../ui/variants/Modal'
import Button from '../../components/Button'
import Check from '../academic/Check'
import { Input, Select } from '../../components/FormField'

const NODE_KINDS = ['Part', 'Unit', 'Lesson', 'Text', 'Topic', 'Other']

export default function AddCurriculumItemModal({ mode, classes = [], classLevelIds = [], subjectId, chapterId, versions = [], nodes = [], defaultVersionId = '', defaultParentId = '', defaultSortOrder = 0, onClose, onCreated }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const role = useAuthStore(s => s.user?.role)
  const [selectedClasses, setSelectedClasses] = useState(classLevelIds.map(String))
  const { register, handleSubmit, setError, setValue, watch, formState: { errors, isSubmitting } } = useForm({
    defaultValues: { name_bn: '', name_en: '', number: '', kind: defaultParentId ? 'Text' : 'Part', version_id: String(defaultVersionId), parent_id: String(defaultParentId), sort_order: String(defaultSortOrder) },
  })
  const name = t(`qbed.add_item.${mode}.title`)
  const submit = async values => {
    if (mode === 'subject' && selectedClasses.length === 0) {
      setError('class_level_ids', { message: t('qbed.add_item.class_required') })
      return
    }
    const body = { name_bn: values.name_bn.trim(), name_en: values.name_en.trim(), sort_order: Number(values.sort_order) || 0 }
    if (mode === 'subject') Object.assign(body, { class_level_ids: selectedClasses.map(Number) })
    if (mode === 'chapter') Object.assign(body, { qb_subject_id: Number(subjectId), number: values.number === '' ? null : Number(values.number), class_level_ids: classLevelIds.map(Number) })
    if (mode === 'topic') Object.assign(body, { qb_chapter_id: Number(chapterId) })
    if (mode === 'curriculum-node') Object.assign(body, {
      qb_curriculum_version_id: Number(values.version_id), parent_id: values.parent_id === '' ? null : Number(values.parent_id), kind: values.kind,
    })
    try {
      const kind = { subject: 'subjects', chapter: 'chapters', topic: 'topics', 'curriculum-node': 'curriculum-nodes' }[mode]
      const base = role === 'super_admin' ? '/super' : '/writer'
      const { data } = await api.post(`${base}/qb/${kind}`, body)
      useUiStore.getState().addToast(t('common.saved'))
      await qc.invalidateQueries({ queryKey: ['writer', 'curriculum'] })
      await qc.invalidateQueries({ queryKey: ['super', 'qb-curriculum'] })
      onCreated(data.data)
    } catch (e) {
      Object.entries(e.response?.data?.errors ?? {}).forEach(([field, messages]) => setError(field.replace(/\.\d+$/, ''), { message: messages[0] }))
    }
  }
  const req = { required: t('super.required') }
  const currentVersionId = Number(watch('version_id'))
  return <Modal open onClose={onClose} title={name}>
    <form onSubmit={handleSubmit(submit)} className="grid gap-3 sm:grid-cols-2" noValidate>
      {mode === 'curriculum-node' && <>
        <Select label={t('qbed.node_kind')} options={NODE_KINDS.map(kind => ({ value: kind, label: t(`qbed.node_kinds.${kind}`) }))} {...register('kind', req)} />
        <Select label={t('qbed.node_version')} options={versions.map(version => ({ value: String(version.id), label: version.name_bn || version.name_en || version.version_key }))} {...register('version_id', { ...req, onChange: () => setValue('parent_id', '') })} />
        <Select label={t('qbed.parent_node')} options={[{ value: '', label: t('qb.none_option') }, ...nodes.filter(node => Number(node.version_id) === currentVersionId).map(node => ({ value: String(node.id), label: node.label }))]} {...register('parent_id')} />
      </>}
      {mode === 'chapter' && <Input label={t('qb.number')} ltr inputMode="numeric" error={errors.number?.message} {...register('number')} />}
      <Input label={t('qb.name_bn')} error={errors.name_bn?.message} {...register('name_bn', req)} />
      <Input label={t('qb.name_en')} ltr error={errors.name_en?.message} {...register('name_en', req)} />
      <Input label={t('qb.sort_order')} ltr inputMode="numeric" {...register('sort_order')} />
      {mode === 'subject' && <fieldset className="sm:col-span-2 grid gap-1">
        <legend className="mb-1 text-sm font-medium">{t('qb.taught_in')}</legend>
        <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-3">{classes.map(item => <Check key={item.id} label={item.name_bn || item.name_en} value={String(item.id)} checked={selectedClasses.includes(String(item.id))}
          onChange={e => setSelectedClasses(ids => e.target.checked ? [...new Set([...ids, String(item.id)])] : ids.filter(id => id !== String(item.id)))} />)}</div>
        {errors.class_level_ids && <p role="alert" className="text-xs text-red-600">{errors.class_level_ids.message}</p>}
      </fieldset>}
      <div className="sm:col-span-2 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
      </div>
    </form>
  </Modal>
}
