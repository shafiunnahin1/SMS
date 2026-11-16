import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { useTerms } from '../../hooks/useTerms'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import Tabs from '../../ui/variants/Tabs'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'
import LessonPlans, { keyOf } from '../../features/syllabus/LessonPlans'
import { Behind } from './SyllabusTeacher'

// D224 SYL.3 /admin/academic/syllabus: build each class subject's unit tree (by hand, from another class, from the question bank or
// from Excel), the subject x batch x teacher matrix (a help, never a penalty), lesson plans, lessons behind, and the parent view switch
export default function SyllabusAdmin() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('units')
  return (
    <div className="flex flex-col gap-4" data-testid="syllabus-admin">
      <PageHeader title={t('syl.title')} />
      <Tabs label={t('syl.title')} value={tab} onChange={setTab} items={['units', 'overview', 'plans', 'behind', 'settings'].map(k => ({ key: k, label: t(`syl.tabs.${k}`) }))} />
      {tab === 'units' && <Units />}
      {tab === 'overview' && <Overview />}
      {tab === 'plans' && <Plans />}
      {tab === 'behind' && <Behind />}
      {tab === 'settings' && <Settings />}
    </div>
  )
}

function usePrograms() { return useQuery({ queryKey: ['programs'], queryFn: () => api.get('/programs').then(r => r.data.data) }) }

function Units() {
  const { t } = useTranslation()
  const term = useTerms()
  const qc = useQueryClient()
  const programs = usePrograms()
  const [program, setProgram] = useState('')
  const [subject, setSubject] = useState('')
  const subjects = useQuery({ queryKey: ['subjects', program], enabled: !!program, queryFn: () => api.get('/subjects', { params: { program_id: program } }).then(r => r.data.data) })
  const units = useQuery({ queryKey: ['syllabus', 'units', Number(program), Number(subject)], enabled: !!program && !!subject,
    queryFn: () => api.get('/syllabus/units', { params: { program_id: program, subject_id: subject } }).then(r => r.data.data) })
  const qbs = useQuery({ queryKey: ['syllabus', 'qb-subjects', program], enabled: !!program, queryFn: () => api.get('/syllabus/qb-subjects', { params: { program_id: program } }).then(r => r.data.data) })
  const [f, setF] = useState({ title: '', term: '', planned_periods: '' })
  const [lesson, setLesson] = useState({})
  const [from, setFrom] = useState('')
  const [qb, setQb] = useState('')
  const refresh = () => qc.invalidateQueries({ queryKey: ['syllabus'] })
  const act = async (fn, msg) => { try { const r = await fn(); refresh(); if (msg) useUiStore.getState().addToast(msg(r)); return true } catch { return false } }
  const add = async (parent, values) => act(() => api.post('/syllabus/units', { program_id: Number(program), subject_id: Number(subject), parent_id: parent ?? null,
    title: values.title, term: values.term || null, planned_periods: values.planned_periods ? Number(values.planned_periods) : null }))
  const rename = (u) => { const title = window.prompt(t('syl.rename'), u.title); if (title && title.trim() && title !== u.title) act(() => api.put(`/syllabus/units/${u.id}`, { title: title.trim() })) }
  const remove = (u) => useUiStore.getState().openConfirm({ title: t('syl.remove_unit'), description: u.title, confirmLabel: t('common.delete'), type: 'danger', onConfirm: () => act(() => api.delete(`/syllabus/units/${u.id}`)) })
  if (programs.isPending) return <Loader type="page" />
  if (programs.isError) return <ErrorState onRetry={programs.refetch} />
  const list = units.data ?? []
  const chapters = list.filter(u => !u.parent_id)
  return (
    <div className="flex flex-col gap-4">
      <Card className="grid gap-3 sm:grid-cols-2">
        <Select name="program" label={term('program')} placeholder={t('syl.pick')} value={program} onChange={(e) => { setProgram(e.target.value); setSubject('') }}
          options={programs.data.map(p => ({ value: String(p.id), label: p.name }))} />
        <Select name="subject" label={t('syl.subject')} placeholder={t('syl.pick')} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!program}
          options={(subjects.data ?? []).map(s => ({ value: String(s.id), label: s.name }))} />
      </Card>
      {program && (
        <Card className="flex flex-wrap items-end gap-3" data-testid="unit-tools">
          <Select name="clone_from" label={t('syl.clone_from')} placeholder={t('syl.pick')} value={from} onChange={(e) => setFrom(e.target.value)} className="min-w-48"
            options={programs.data.filter(p => String(p.id) !== program).map(p => ({ value: String(p.id), label: p.name }))} />
          <Button variant="secondary" disabled={!from} data-action="clone" onClick={() => act(() => api.post('/syllabus/units/clone', { from_program_id: Number(from), to_program_id: Number(program) }),
            (r) => t('syl.made', { n: r.data.data.made }))}>{t('syl.clone')}</Button>
          {subject && (qbs.data ?? []).length > 0 && <>
            <Select name="qb_subject" label={t('syl.qb_subject')} placeholder={t('syl.pick')} value={qb} onChange={(e) => setQb(e.target.value)} className="min-w-48"
              options={qbs.data.map(s => ({ value: String(s.id), label: s.name_bn }))} />
            <Button variant="secondary" disabled={!qb} data-action="from-qb" onClick={() => act(() => api.post('/syllabus/units/from-question-bank', { program_id: Number(program), subject_id: Number(subject), qb_subject_id: Number(qb) }),
              (r) => t('syl.made', { n: r.data.data.made }))}>{t('syl.from_qb')}</Button>
          </>}
          <Link to="/admin/settings/imports?kind=syllabus" className="text-sm text-primary-fg underline" data-action="excel">{t('syl.from_excel')}</Link>
        </Card>
      )}
      {program && subject && (
        <Card className="flex flex-col gap-3" data-testid="unit-tree">
          {units.isPending ? <Loader type="skeleton" rows={4} /> : units.isError ? <ErrorState onRetry={units.refetch} /> : !chapters.length ? <EmptyState title={t('syl.no_units')} /> : (
            <ul className="flex flex-col gap-3">
              {chapters.map(c => (
                <li key={c.id} className="flex flex-col gap-1" data-testid="chapter">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold" dir="auto">{c.title}</span>{c.term && <span className="text-xs text-content-muted" dir="auto">· {c.term}</span>}
                    <span className="ms-auto flex gap-1"><Button variant="ghost" onClick={() => rename(c)}>{t('syl.rename')}</Button><Button variant="ghost" onClick={() => remove(c)}>{t('common.delete')}</Button></span>
                  </div>
                  <ul className="flex flex-col gap-1 ps-6">
                    {list.filter(u => u.parent_id === c.id).map(u => (
                      <li key={u.id} className="flex flex-wrap items-center gap-2 text-sm"><span dir="auto">{u.title}</span>{u.planned_periods != null && <span className="text-xs text-content-muted">· {t('syl.periods_n', { n: u.planned_periods })}</span>}
                        <span className="ms-auto flex gap-1"><Button variant="ghost" onClick={() => rename(u)}>{t('syl.rename')}</Button><Button variant="ghost" onClick={() => remove(u)}>{t('common.delete')}</Button></span></li>
                    ))}
                  </ul>
                  <form className="flex flex-wrap items-end gap-2 ps-6" onSubmit={async (e) => { e.preventDefault(); if (await add(c.id, lesson[c.id] ?? {})) setLesson({ ...lesson, [c.id]: { title: '' } }) }}>
                    <Input name={`lesson-${c.id}`} label={t('syl.new_lesson')} value={lesson[c.id]?.title ?? ''} onChange={(e) => setLesson({ ...lesson, [c.id]: { ...(lesson[c.id] ?? {}), title: e.target.value } })} required maxLength={200} />
                    <Button type="submit" variant="secondary" data-action="add-lesson">{t('syl.add')}</Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form className="flex flex-wrap items-end gap-2 border-t border-line pt-3" data-testid="chapter-form" onSubmit={async (e) => { e.preventDefault(); if (await add(null, f)) setF({ title: '', term: '', planned_periods: '' }) }}>
            <Input name="title" label={t('syl.new_chapter')} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={200} />
            <Input name="term" label={t('syl.term')} value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })} maxLength={20} className="w-32" />
            <Input name="planned_periods" label={t('syl.periods')} inputMode="numeric" ltr value={f.planned_periods} onChange={(e) => setF({ ...f, planned_periods: e.target.value })} className="w-28" />
            <Button type="submit" data-action="add-chapter">{t('syl.add')}</Button>
          </form>
        </Card>
      )}
    </div>
  )
}

function Overview() {
  const { t } = useTranslation()
  const term = useTerms()
  const programs = usePrograms()
  const [program, setProgram] = useState('')
  const [termName, setTermName] = useState('')
  const q = useQuery({ queryKey: ['syllabus', 'overview', program, termName], enabled: !!program, queryFn: () => api.get('/syllabus/overview', { params: { program_id: program, term: termName || undefined } }).then(r => r.data.data) })
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-content-muted">{t('syl.matrix_note')}</p>
      <Card className="flex flex-wrap items-end gap-3">
        <Select name="program" label={term('program')} placeholder={t('syl.pick')} value={program} onChange={(e) => setProgram(e.target.value)} options={(programs.data ?? []).map(p => ({ value: String(p.id), label: p.name }))} />
        <Input name="term" label={t('syl.term')} value={termName} onChange={(e) => setTermName(e.target.value)} className="w-40" />
      </Card>
      {program && (q.isPending ? <Loader type="skeleton" rows={4} /> : q.isError ? <ErrorState onRetry={q.refetch} /> : !q.data.length ? <EmptyState title={t('syl.no_units')} /> : (
        <Card><table className="w-full text-sm" data-testid="matrix"><thead><tr className="text-start text-content-muted"><th className="text-start py-1">{t('syl.subject')}</th><th className="text-start">{term('batch')}</th><th className="text-start">{t('syl.teacher')}</th><th className="text-end">{t('syl.done_col')}</th></tr></thead>
          <tbody>{q.data.map(r => <tr key={`${r.subject.id}:${r.batch.id}`} className="border-t border-line"><td className="py-1" dir="auto">{r.subject.name}</td><td dir="auto">{r.batch.name}</td><td dir="auto">{r.teachers.join(', ')}</td>
            <td className="text-end"><Ltr>{r.percent}%</Ltr> <span className="text-xs text-content-muted">({r.covered}/{r.leaves})</span></td></tr>)}</tbody></table></Card>
      ))}
    </div>
  )
}

function Plans() {
  const { t } = useTranslation()
  const rows = useQuery({ queryKey: ['syllabus', 'assignments', 'admin'], queryFn: () => api.get('/lesson-plans/assignments').then(r => r.data.data) })
  const [pick, setPick] = useState('')
  const a = rows.data?.find(x => keyOf(x) === pick) ?? rows.data?.[0]
  const units = useQuery({ queryKey: ['syllabus', 'units', a?.program_id, a?.subject_id], enabled: !!a, queryFn: () => api.get('/syllabus/units', { params: { program_id: a.program_id, subject_id: a.subject_id } }).then(r => r.data.data) })
  if (rows.isPending) return <Loader type="page" />
  if (rows.isError) return <ErrorState onRetry={rows.refetch} />
  if (!a) return <EmptyState title={t('syl.no_assignment')} />
  return (
    <div className="flex flex-col gap-3">
      <Select name="assignment" label={t('syl.batch_subject_teacher')} value={keyOf(a)} onChange={(e) => setPick(e.target.value)} className="sm:w-96"
        options={rows.data.map(x => ({ value: keyOf(x), label: `${x.batch} · ${x.subject} · ${x.teacher}` }))} />
      <Card>{units.data && <LessonPlans assignment={a} units={units.data} />}</Card>
    </div>
  )
}

function Settings() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['syllabus', 'settings'], queryFn: () => api.get('/syllabus/settings').then(r => r.data.data) })
  if (q.isPending) return <Loader type="skeleton" rows={2} />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  const set = async (v) => { try { await api.put('/syllabus/settings', { show_parents: v }); qc.invalidateQueries({ queryKey: ['syllabus', 'settings'] }) } catch { /* the interceptor shows it */ } }
  return (
    <Card className="flex flex-col gap-2" data-testid="syllabus-settings">
      <label className="flex items-center gap-2"><input type="checkbox" name="show_parents" checked={q.data.show_parents} onChange={(e) => set(e.target.checked)} className="h-4 w-4" />{t('syl.show_parents')}</label>
      <p className="text-sm text-content-muted">{t('syl.show_parents_hint')}</p>
    </Card>
  )
}
