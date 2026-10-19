import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'

const RULE = { section_title: '', qb_question_type_id: '', question_count: '1', marks_each: '1', qb_chapter_id: '', difficulty: '' }
const EMPTY = { id: null, name_bn: '', name_en: '', qb_subject_id: '', duration_minutes: '', is_active: true, items: [{ ...RULE }] }

// R2.1.5 /super-admin/qb/blueprints (D126 (3)): qbank's assessment blueprints - each a list of rules (section, question type, how
// many, marks each, optionally a chapter and difficulty); the total is the server's sum. Teachers build papers from active ones.
export default function QbBlueprints() {
  const { t } = useTranslation()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const [v, setV] = useState(null)
  const list = useQuery({ queryKey: ['super', 'qb-blueprints'], queryFn: () => api.get('/super/qb/blueprints').then(r => r.data.data) })
  const tree = useQuery({ queryKey: ['writer', 'curriculum'], queryFn: () => api.get('/writer/curriculum').then(r => r.data.data) })
  const types = useQuery({ queryKey: ['writer', 'types'], queryFn: () => api.get('/writer/question-types').then(r => r.data.data) })
  if (list.isPending || tree.isPending || types.isPending) return <Loader type="page" />
  if (list.isError || tree.isError || types.isError) return <ErrorState onRetry={() => { list.refetch(); tree.refetch(); types.refetch() }} />
  const name = (x) => (x ? ((locale === 'bn' ? x.name_bn : x.name_en) || x.name_en || x.name_bn) : '')
  const subject = tree.data.subjects.find(s => String(s.id) === String(v?.qb_subject_id))
  const rule = (k, patch) => setV({ ...v, items: v.items.map((x, j) => (j === k ? { ...x, ...patch } : x)) })
  const toast = (m, k) => useUiStore.getState().addToast(m, k)
  const save = async () => {
    const body = { name_bn: v.name_bn, name_en: v.name_en || null, qb_subject_id: Number(v.qb_subject_id), duration_minutes: v.duration_minutes ? Number(v.duration_minutes) : null,
      is_active: v.is_active, items: v.items.map(x => ({ section_title: x.section_title, qb_question_type_id: Number(x.qb_question_type_id), question_count: Number(x.question_count),
        marks_each: x.marks_each, qb_chapter_id: x.qb_chapter_id ? Number(x.qb_chapter_id) : null, difficulty: x.difficulty ? Number(x.difficulty) : null })) }
    try {
      if (v.id) await api.put(`/super/qb/blueprints/${v.id}`, body); else await api.post('/super/qb/blueprints', body)
      toast(t('common.saved')); setV(null); qc.invalidateQueries({ queryKey: ['super', 'qb-blueprints'] })
    } catch (e) { toast(Object.values(e.response?.data?.errors ?? {})[0]?.[0] ?? e.response?.data?.message, 'error') }
  }
  const edit = (b) => setV({ id: b.id, name_bn: b.name_bn, name_en: b.name_en ?? '', qb_subject_id: String(b.qb_subject_id), duration_minutes: b.duration_minutes ? String(b.duration_minutes) : '',
    is_active: b.is_active, items: b.items.map(x => ({ section_title: x.section_title, qb_question_type_id: String(x.qb_question_type_id), question_count: String(x.question_count),
      marks_each: String(x.marks_each), qb_chapter_id: x.qb_chapter_id ? String(x.qb_chapter_id) : '', difficulty: x.difficulty ? String(x.difficulty) : '' })) })

  return (
    <div className="flex flex-col gap-4" data-testid="qb-blueprints">
      <PageHeader title={t('qbbp.title')} subtitle={t('qbbp.subtitle')} actions={!v && <Button onClick={() => setV({ ...EMPTY, items: [{ ...RULE }] })} data-action="new-blueprint"><Plus aria-hidden="true" className="h-4 w-4" />{t('qbbp.new')}</Button>} />
      {v && (
        <Card className="flex flex-col gap-3" data-testid="blueprint-form">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input label={t('qbbp.name_bn')} name="name_bn" value={v.name_bn} onChange={e => setV({ ...v, name_bn: e.target.value })} />
            <Input label={t('qbbp.name_en')} name="name_en" value={v.name_en} onChange={e => setV({ ...v, name_en: e.target.value })} />
            <Select label={t('qb.subject')} name="qb_subject_id" value={v.qb_subject_id} placeholder="—" onChange={e => setV({ ...v, qb_subject_id: e.target.value, items: v.items.map(x => ({ ...x, qb_chapter_id: '' })) })}
              options={tree.data.subjects.map(s => ({ value: String(s.id), label: name(s) }))} />
            <Input label={t('qbpp.duration')} name="duration_minutes" ltr inputMode="numeric" value={v.duration_minutes} onChange={e => setV({ ...v, duration_minutes: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="is_active" checked={v.is_active} onChange={e => setV({ ...v, is_active: e.target.checked })} />{t('qbbp.active')}</label>
          <h3 className="font-semibold">{t('qbbp.rules')}</h3>
          {v.items.map((x, k) => (
            <div key={k} className="grid gap-2 rounded-token [border:1px_solid_var(--line)] p-2 sm:grid-cols-3 lg:grid-cols-7" data-rule={k}>
              <Input label={t('qbpp.section_title')} name={`rule-${k}-section`} value={x.section_title} onChange={e => rule(k, { section_title: e.target.value })} />
              <Select label={t('qb.type')} name={`rule-${k}-type`} value={x.qb_question_type_id} placeholder="—" onChange={e => rule(k, { qb_question_type_id: e.target.value })}
                options={types.data.map(ty => ({ value: String(ty.id), label: name(ty) }))} />
              <Input label={t('qbbp.count')} name={`rule-${k}-count`} ltr inputMode="numeric" value={x.question_count} onChange={e => rule(k, { question_count: e.target.value })} />
              <Input label={t('qbbp.marks_each')} name={`rule-${k}-marks`} ltr inputMode="decimal" value={x.marks_each} onChange={e => rule(k, { marks_each: e.target.value })} />
              <Select label={t('qb.chapter')} name={`rule-${k}-chapter`} value={x.qb_chapter_id} placeholder={t('qbf.any')} onChange={e => rule(k, { qb_chapter_id: e.target.value })}
                options={(subject?.chapters ?? []).map(c => ({ value: String(c.id), label: name(c) }))} />
              <Select label={t('qbi.difficulty')} name={`rule-${k}-difficulty`} value={x.difficulty} placeholder={t('qbf.any')} onChange={e => rule(k, { difficulty: e.target.value })}
                options={[1, 2, 3, 4, 5].map(d => ({ value: String(d), label: String(d) }))} />
              <div className="flex items-end">{v.items.length > 1 && <Button variant="secondary" aria-label={t('common.delete')} onClick={() => setV({ ...v, items: v.items.filter((_, j) => j !== k) })}><Trash2 aria-hidden="true" className="h-4 w-4" /></Button>}</div>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setV({ ...v, items: [...v.items, { ...RULE }] })} data-action="add-rule"><Plus aria-hidden="true" className="h-4 w-4" />{t('qbbp.add_rule')}</Button>
            <Button onClick={save} data-action="save-blueprint">{t('common.save')}</Button>
            <Button variant="secondary" onClick={() => setV(null)}>{t('qbi.cancel')}</Button>
          </div>
        </Card>
      )}
      <Card>
        {list.data.length === 0 ? <EmptyState title={t('qbbp.none')} /> : (
          <ul className="flex flex-col gap-2">
            {list.data.map(b => (
              <li key={b.id} data-blueprint={b.id}>
                <button type="button" onClick={() => edit(b)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-token [border:1px_solid_var(--line)] p-3 text-start hover:bg-surface-muted">
                  <span dir="auto" className="font-medium">{b.name_bn}</span>
                  <span className="text-sm">{t('qbbp.summary', { rules: b.items.length })} · <Ltr>{b.total_marks}</Ltr> {!b.is_active && `· ${t('qbbp.inactive')}`}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
