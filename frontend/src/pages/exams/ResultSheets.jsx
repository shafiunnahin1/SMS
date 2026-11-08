import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { FileDown, Printer, Plus, Trash2 } from 'lucide-react'
import api from '../../api/axios'
import { usePrint } from '../../hooks/usePrint'
import { useTerms } from '../../hooks/useTerms'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'
import { useCrud } from '../../features/academic/useCrud'
import { useUiStore } from '../../store/uiStore'
import Ltr from '../../components/bidi/Ltr'

const blankRule = () => ({ components: [{ exam_id: '', weight: '100' }], absent_policy: 'zero', missing_subject_policy: 'error', pass_rule: 'every_subject', pass_percent: '33' })

// D197 AAD.2 /admin/exams/result-sheets: a final result sheet weighs several exams (weights add up to 100, a component may be
// "best k of n"); compute -> preview -> publish (immutable; a new version copies it); tabulation PDF and Excel.
export default function ResultSheets() {
  const { t } = useTranslation()
  const term = useTerms()
  const qc = useQueryClient()
  const toast = useUiStore.getState().addToast
  const { preview, download, loading } = usePrint()
  const programs = useCrud('programs').list
  const exams = useCrud('exams').list
  const sheets = useQuery({ queryKey: ['result-sheets'], queryFn: () => api.get('/result-sheets').then(r => r.data.data) })
  const [form, setForm] = useState(null)
  const [open, setOpen] = useState(null)
  const [missing, setMissing] = useState([])
  const shown = useQuery({ queryKey: ['result-sheet-preview', open], enabled: Boolean(open), queryFn: () => api.get(`/result-sheets/${open}/preview`).then(r => r.data.data) })

  const sum = form ? form.rule.components.reduce((a, c) => a + (Number(c.weight) || 0), 0) : 0
  const setRule = (patch) => setForm(f => ({ ...f, rule: { ...f.rule, ...patch } }))
  const setComp = (i, patch) => setRule({ components: form.rule.components.map((c, n) => (n === i ? { ...c, ...patch } : c)) })
  const programExams = (exams.data ?? []).filter(e => form && String(e.program?.id ?? e.program_id) === String(form.program_id))
  const refresh = () => { qc.invalidateQueries({ queryKey: ['result-sheets'] }); qc.invalidateQueries({ queryKey: ['result-sheet-preview'] }) }

  const save = async () => {
    const components = form.rule.components.map(c => (c.best_of
      ? { of: c.of.map(Number), best_of: Number(c.best_of), weight: Number(c.weight) } : { exam_id: Number(c.exam_id), weight: Number(c.weight) }))
    const body = { program_id: Number(form.program_id), name: form.name, rule: { ...form.rule, pass_percent: Number(form.rule.pass_percent), components } }
    try {
      await (form.id ? api.put(`/result-sheets/${form.id}`, body) : api.post('/result-sheets', body))
      toast(t('common.saved')); setForm(null); refresh()
    } catch { /* the interceptor and the form errors show it */ }
  }
  const act = async (id, what) => {
    try {
      if (what === 'compute') {
        setMissing([])
        await api.post(`/result-sheets/${id}/compute`)
        setOpen(id); toast(t('result_sheets.computed'))
      } else if (what === 'publish') {
        if (!window.confirm(t('result_sheets.publish_confirm'))) return
        await api.post(`/result-sheets/${id}/publish`)
      } else if (what === 'version') await api.post(`/result-sheets/${id}/new-version`)
      else if (what === 'delete') { if (!window.confirm(t('common.delete_confirm', { name: sheets.data.find(x => x.id === id)?.name }))) return; await api.delete(`/result-sheets/${id}`) }
      refresh()
    } catch (e) {
      if (e?.response?.data?.data?.missing) setMissing(e.response.data.data.missing)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('result_sheets.title')} actions={!form && <Button onClick={() => setForm({ program_id: '', name: '', rule: blankRule() })}><Plus aria-hidden="true" className="h-4 w-4" />{t('result_sheets.new')}</Button>} />
      {form && (
        <Card className="flex flex-col gap-3" data-testid="sheet-form">
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label={term('program')} placeholder="—" value={String(form.program_id)} onChange={e => setForm(f => ({ ...f, program_id: e.target.value }))}
              options={(programs.data ?? []).map(p => ({ value: String(p.id), label: p.name }))} />
            <Input label={t('result_sheets.name')} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <h3 className="font-semibold">{t('result_sheets.components')}</h3>
          {form.rule.components.map((c, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-4 items-end" data-testid="component">
              {c.best_of ? (
                <Select multiple label={t('result_sheets.best_of_exams')} value={c.of.map(String)} onChange={e => setComp(i, { of: [...e.target.selectedOptions].map(o => o.value) })}
                  options={programExams.map(x => ({ value: String(x.id), label: x.name }))} />
              ) : (
                <Select label={t('result_sheets.exam')} placeholder="—" value={String(c.exam_id)} onChange={e => setComp(i, { exam_id: e.target.value })}
                  options={programExams.map(x => ({ value: String(x.id), label: x.name }))} />
              )}
              {c.best_of != null && <Input type="number" ltr label={t('result_sheets.best_of')} value={c.best_of} onChange={e => setComp(i, { best_of: e.target.value })} />}
              <Input type="number" ltr label={t('result_sheets.weight')} value={c.weight} onChange={e => setComp(i, { weight: e.target.value })} />
              <Button variant="ghost" aria-label={t('common.delete')} onClick={() => setRule({ components: form.rule.components.filter((_, n) => n !== i) })} disabled={form.rule.components.length < 2}>
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setRule({ components: [...form.rule.components, { exam_id: '', weight: '0' }] })}>{t('result_sheets.add_exam')}</Button>
            <Button variant="secondary" onClick={() => setRule({ components: [...form.rule.components, { of: [], best_of: '1', weight: '0' }] })}>{t('result_sheets.add_best_of')}</Button>
          </div>
          <p className={`text-sm ${sum === 100 ? 'text-content-muted' : 'text-danger'}`} data-testid="weight-sum">{t('result_sheets.weight_sum', { sum })}</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Select label={t('result_sheets.absent')} value={form.rule.absent_policy} onChange={e => setRule({ absent_policy: e.target.value })}
              options={['zero', 'exclude'].map(v => ({ value: v, label: t(`result_sheets.absent_${v}`) }))} />
            <Select label={t('result_sheets.missing')} value={form.rule.missing_subject_policy} onChange={e => setRule({ missing_subject_policy: e.target.value })}
              options={['error', 'skip_redistribute'].map(v => ({ value: v, label: t(`result_sheets.missing_${v}`) }))} />
            <Select label={t('result_sheets.pass_rule')} value={form.rule.pass_rule} onChange={e => setRule({ pass_rule: e.target.value })}
              options={['total_only', 'every_subject', 'every_subject_every_exam'].map(v => ({ value: v, label: t(`result_sheets.pass_${v}`) }))} />
            <Input type="number" ltr label={t('result_sheets.pass_percent')} value={form.rule.pass_percent} onChange={e => setRule({ pass_percent: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setForm(null)}>{t('common.cancel')}</Button>
            <Button onClick={save} disabled={sum !== 100 || !form.program_id || !form.name}>{t('common.save')}</Button>
          </div>
        </Card>
      )}
      {missing.length > 0 && (
        <Card data-testid="sheet-missing"><h3 className="font-semibold">{t('result_sheets.missing_title', { n: missing.length })}</h3>
          <ul className="text-sm">{missing.slice(0, 50).map((m, n) => <li key={n} dir="auto">#<Ltr>{m.student_id}</Ltr> · {m.subject} · {t('result_sheets.component_n', { n: m.component })}</li>)}</ul>
        </Card>
      )}
      {sheets.isPending ? <Loader type="cards" count={2} /> : sheets.isError ? <ErrorState onRetry={sheets.refetch} />
        : !sheets.data.length ? <EmptyState title={t('result_sheets.none')} /> : sheets.data.map(s => (
          <Card key={s.id} className="flex flex-col gap-2" data-testid="sheet">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold"><span dir="auto">{s.name}</span> <Ltr>v{s.version}</Ltr> · <span dir="auto">{s.program}</span></h2>
              <span className="text-sm">{t(`result_sheets.status_${s.status}`)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {s.status === 'draft' && <>
                <Button variant="secondary" onClick={() => setForm({ id: s.id, program_id: String(s.program_id), name: s.name, rule: { ...s.rule, components: s.rule.components.map(c => ({ ...c, best_of: c.best_of ?? undefined })) } })}>{t('common.edit')}</Button>
                <Button onClick={() => act(s.id, 'compute')}>{t('result_sheets.compute')}</Button>
                <Button variant="secondary" onClick={() => act(s.id, 'publish')}>{t('result_sheets.publish')}</Button>
                <Button variant="ghost" onClick={() => act(s.id, 'delete')}>{t('common.delete')}</Button>
              </>}
              {s.status === 'published' && <Button variant="secondary" onClick={() => act(s.id, 'version')}>{t('result_sheets.new_version')}</Button>}
              <Button variant="secondary" onClick={() => setOpen(open === s.id ? null : s.id)}>{t('result_sheets.preview')}</Button>
              <Button variant="secondary" loading={loading} onClick={() => preview(`/result-sheets/${s.id}/tabulation.pdf`)}><Printer aria-hidden="true" className="h-4 w-4" />{t('result_sheets.tabulation')}</Button>
              <Button variant="secondary" loading={loading} onClick={() => download(`/result-sheets/${s.id}/export.xlsx`, `tabulation-${s.id}.xlsx`)}><FileDown aria-hidden="true" className="h-4 w-4" />Excel</Button>
            </div>
            {open === s.id && (shown.isPending ? <Loader /> : shown.isError ? <ErrorState onRetry={shown.refetch} /> : !shown.data.results.length ? <EmptyState title={t('result_sheets.not_computed')} /> : (
              <div className="overflow-x-auto" data-testid="sheet-preview">
                <table className="w-full text-sm">
                  <thead><tr><th className="text-start">{t('result_sheets.student')}</th><th>%</th><th>GPA</th><th>{t('result_sheets.grade')}</th><th>{t('result_sheets.position')}</th></tr></thead>
                  <tbody>{shown.data.results.map(r => (
                    <tr key={r.student_id} className="border-t border-line">
                      <td dir="auto">{r.name}</td><td className="text-center"><Ltr>{r.total_percentage ?? '—'}</Ltr></td><td className="text-center"><Ltr>{r.gpa ?? '—'}</Ltr></td>
                      <td className="text-center">{r.grade ?? '—'}</td><td className="text-center"><Ltr>{r.position_program ?? '—'}</Ltr></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ))}
          </Card>
        ))}
    </div>
  )
}
