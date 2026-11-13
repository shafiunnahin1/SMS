import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import api from '../../api/axios'
import { useTerms } from '../../hooks/useTerms'
import { useUiStore } from '../../store/uiStore'
import { useLocale } from '../../ui/I18nProvider'
import { fmtDate, fmtMoney } from '../../i18n/format'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import StatusBadge from '../../components/StatusBadge'
import Ltr from '../../components/bidi/Ltr'
import Modal from '../../ui/variants/Modal'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'
import { useAuthStore } from '../../store/authStore'
import AdmissionApplications from './AdmissionApplications'
import AdmissionFeeMethods from './AdmissionFeeMethods'

const blank = { name: '', program_id: '', seats: '', apply_from: '', apply_until: '', test_date: '', application_fee: '0', mode: 'merit', waiting: '0', min_marks: '', confirm_within_days: '7', publish_names: false }
// the one step each state allows (testing -> listing happens by building the list)
const NEXT = { draft: 'open', open: 'freeze', listing: 'close' }

// D209 ACY.1 /admin/admission: the admission cycles. Set one up (draft), open it (a lottery cycle shows its seed ONCE - keep it
// safe), freeze it when applications end, close it after the list. Setup can be changed only while it is a draft.
export default function AdmissionCycles() {
  const { t } = useTranslation()
  const term = useTerms()
  const { locale } = useLocale()
  const qc = useQueryClient()
  const [form, setForm] = useState(null)        // null = closed; {id?, ...fields}
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(null)
  const [seed, setSeed] = useState(null)
  const [apps, setApps] = useState(null)        // the cycle whose applications are shown
  const [draw, setDraw] = useState(null)        // ACY.3: {cycle, seed} while the lottery seed is typed in
  const isAdmin = useAuthStore(s => s.user?.role) === 'admin'   // ACY.2: the accountant sees the list and takes cash only
  const programs = useQuery({ queryKey: ['programs'], queryFn: () => api.get('/programs').then(r => r.data.data), enabled: isAdmin })
  const q = useQuery({ queryKey: ['admission', 'cycles', isAdmin], queryFn: () => api.get(isAdmin ? '/admission/cycles' : '/admission/fee-cycles').then(r => r.data.data) })
  const refresh = () => qc.invalidateQueries({ queryKey: ['admission', 'cycles'] })

  const edit = (c) => { setErrors({}); setForm(c ? { id: c.id, name: c.name, program_id: String(c.program?.id ?? ''), seats: String(c.seats), apply_from: c.apply_from, apply_until: c.apply_until,
    test_date: c.test_date ?? '', application_fee: c.application_fee, mode: c.rule.mode, waiting: String(c.rule.waiting), min_marks: c.rule.min_marks ?? '',
    confirm_within_days: String(c.rule.confirm_within_days), publish_names: !!c.rule.publish_names } : { ...blank }) }
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const save = async () => {
    setBusy('save'); setErrors({})
    const body = { name: form.name, program_id: Number(form.program_id) || null, seats: Number(form.seats) || null, apply_from: form.apply_from, apply_until: form.apply_until,
      test_date: form.test_date || null, application_fee: form.application_fee || '0',
      rule: { mode: form.mode, waiting: Number(form.waiting) || 0, min_marks: form.min_marks === '' ? null : form.min_marks, confirm_within_days: Number(form.confirm_within_days) || 7, publish_names: form.publish_names } }
    try {
      await (form.id ? api.put(`/admission/cycles/${form.id}`, body) : api.post('/admission/cycles', body))
      useUiStore.getState().addToast(t('common.saved'))
      setForm(null); refresh()
    } catch (e) {
      const v = e.response?.data?.errors
      if (v) setErrors(Object.fromEntries(Object.entries(v).map(([k, m]) => [k.replace('rule.', ''), [].concat(m)[0]])))
    } finally { setBusy(null) }
  }

  const step = (c) => useUiStore.getState().openConfirm({ title: t(`admission.steps.${NEXT[c.status]}`), description: t(`admission.steps.${NEXT[c.status]}_confirm`),
    onConfirm: async () => {
      setBusy(c.id)
      try {
        const r = await api.post(`/admission/cycles/${c.id}/${NEXT[c.status]}`)
        if (r.data.data.seed) setSeed({ seed: r.data.data.seed, commitment: r.data.data.draw?.seed_commitment, name: c.name })
        refresh()
      } catch { /* the interceptor shows the error */ } finally { setBusy(null) }
    } })

  // ACY.3: the merit list, the lottery (the saved seed is typed in) and the seed-loss fallback (a weaker guarantee, shown publicly)
  const buildMerit = (c) => useUiStore.getState().openConfirm({ title: t('admission.build_merit'), description: t('admission.build_merit_confirm'),
    onConfirm: async () => { setBusy(c.id); try { await api.post(`/admission/cycles/${c.id}/list/merit`); refresh() } catch { /* the interceptor shows the error */ } finally { setBusy(null) } } })
  const runLottery = async () => {
    setBusy('draw')
    try { await api.post(`/admission/cycles/${draw.cycle.id}/list/lottery`, { seed: draw.seed.trim() }); setDraw(null); refresh() }
    catch { /* the interceptor shows the error */ } finally { setBusy(null) }
  }
  const recommit = (c) => useUiStore.getState().openConfirm({ title: t('admission.seed_lost'), description: t('admission.seed_lost_confirm'), type: 'danger',
    onConfirm: async () => {
      try {
        const r = await api.post(`/admission/cycles/${c.id}/draw/recommit`)
        setSeed({ seed: r.data.data.seed, commitment: r.data.data.draw?.seed_commitment, name: c.name })
      } catch { /* the interceptor shows the error */ }
    } })

  if (q.isPending) return <Loader type="page" />
  if (q.isError) return <ErrorState onRetry={q.refetch} />
  return (
    <div className="flex flex-col gap-4" data-testid="admission-cycles">
      <PageHeader title={t('admission.title')} actions={isAdmin && <Button onClick={() => edit(null)} data-action="new"><Plus size={16} aria-hidden="true" />{t('admission.new')}</Button>} />
      {isAdmin && <AdmissionFeeMethods />}
      {!q.data.length ? <EmptyState title={t('admission.none')} /> : (
        <div className="flex flex-col gap-3">
          {q.data.map(c => (
            <Card key={c.id} className="flex flex-col gap-2" data-cycle={c.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{c.name}</span>
                <StatusBadge status={`cycle_${c.status}`} />
              </div>
              <p className="text-sm text-content-muted">
                {term('program')}: {c.program?.name ?? '—'} · {t('admission.seats')}: {c.seats} · {t('admission.waiting')}: {c.rule.waiting} · {t(`admission.modes.${c.rule.mode}`)}
                · {fmtDate(c.apply_from, locale)} – {fmtDate(c.apply_until, locale)} · {t('admission.fee')}: {fmtMoney(c.application_fee, locale)} · {t('admission.applications', { count: c.applications ?? 0 })}
              </p>
              <div className="flex flex-wrap gap-2">
                {c.status !== 'draft' && <Button variant="secondary" onClick={() => setApps(c)} data-action="applications">{t('admission.applications_button')}</Button>}
                {isAdmin && c.status === 'draft' && <Button variant="secondary" onClick={() => edit(c)} data-action="edit">{t('common.edit')}</Button>}
                {isAdmin && NEXT[c.status] && <Button onClick={() => step(c)} loading={busy === c.id} data-action={NEXT[c.status]}>{t(`admission.steps.${NEXT[c.status]}`)}</Button>}
                {isAdmin && c.status === 'testing' && c.rule.mode === 'merit' && <Button onClick={() => buildMerit(c)} loading={busy === c.id} data-action="merit">{t('admission.build_merit')}</Button>}
                {isAdmin && c.status === 'testing' && c.rule.mode === 'lottery' && <>
                  <Button onClick={() => setDraw({ cycle: c, seed: '' })} data-action="lottery">{t('admission.run_lottery')}</Button>
                  <Button variant="ghost" onClick={() => recommit(c)} data-action="recommit">{t('admission.seed_lost')}</Button>
                </>}
                {c.status !== 'draft' && <a className="text-sm underline self-center" href={`/admission?transparency=${c.id}`} target="_blank" rel="noreferrer">{t('admission.public_record')}</a>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!form} onClose={() => setForm(null)} title={form?.id ? t('common.edit') : t('admission.new')}>
        {form && (
          <div className="grid gap-3 sm:grid-cols-2" data-testid="cycle-form">
            <Input className="sm:col-span-2" label={t('admission.name')} value={form.name} onChange={set('name')} error={errors.name} maxLength={120} name="name" />
            <Select label={term('program')} placeholder="—" value={form.program_id} onChange={set('program_id')} error={errors.program_id} name="program_id"
              options={(programs.data ?? []).map(p => ({ value: String(p.id), label: p.name }))} />
            <Input label={t('admission.seats')} ltr inputMode="numeric" value={form.seats} onChange={set('seats')} error={errors.seats} name="seats" />
            <Input label={t('admission.apply_from')} type="date" ltr value={form.apply_from} onChange={set('apply_from')} error={errors.apply_from} name="apply_from" />
            <Input label={t('admission.apply_until')} type="date" ltr value={form.apply_until} onChange={set('apply_until')} error={errors.apply_until} name="apply_until" />
            <Input label={t('admission.test_date')} type="date" ltr value={form.test_date} onChange={set('test_date')} error={errors.test_date} name="test_date" />
            <Input label={t('admission.fee')} ltr inputMode="decimal" value={form.application_fee} onChange={set('application_fee')} error={errors.application_fee} name="application_fee" />
            <Select label={t('admission.mode')} value={form.mode} onChange={set('mode')} error={errors.mode} name="mode" options={['merit', 'lottery'].map(m => ({ value: m, label: t(`admission.modes.${m}`) }))} />
            <Input label={t('admission.waiting')} ltr inputMode="numeric" value={form.waiting} onChange={set('waiting')} error={errors.waiting} name="waiting" />
            {form.mode === 'merit' && <Input label={t('admission.min_marks')} ltr inputMode="decimal" value={form.min_marks} onChange={set('min_marks')} error={errors.min_marks} name="min_marks" />}
            <Input label={t('admission.confirm_days')} ltr inputMode="numeric" value={form.confirm_within_days} onChange={set('confirm_within_days')} error={errors.confirm_within_days} name="confirm_within_days" />
            <label className="sm:col-span-2 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--color-primary)]" checked={form.publish_names} onChange={set('publish_names')} name="publish_names" />
              <span>{t('admission.publish_names')}</span>
            </label>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setForm(null)}>{t('common.cancel')}</Button>
              <Button onClick={save} loading={busy === 'save'} data-action="save">{t('common.save')}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!apps} onClose={() => { setApps(null); refresh() }} title={apps?.name ?? ''}>
        {apps && <AdmissionApplications cycleId={apps.id} isAdmin={isAdmin} mode={apps.rule.mode} />}
      </Modal>

      <Modal open={!!draw} onClose={() => setDraw(null)} title={t('admission.run_lottery')}>
        {draw && (
          <div className="flex flex-col gap-3" data-testid="lottery">
            <p className="text-sm">{t('admission.lottery_hint')}</p>
            <Input label={t('admission.seed')} ltr value={draw.seed} onChange={e => setDraw(d => ({ ...d, seed: e.target.value }))} name="seed" autoComplete="off" />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDraw(null)}>{t('common.cancel')}</Button>
              <Button onClick={runLottery} loading={busy === 'draw'} disabled={!draw.seed.trim()} data-action="draw">{t('admission.run_lottery')}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!seed} onClose={() => setSeed(null)} title={t('admission.seed_title')}>
        {seed && (
          <div className="flex flex-col gap-3" data-testid="seed">
            <p className="text-sm">{t('admission.seed_warning')}</p>
            <p className="font-mono text-sm break-all" data-testid="seed-value"><Ltr>{seed.seed}</Ltr></p>
            <p className="text-xs text-content-muted break-all">{t('admission.commitment')}: <Ltr>{seed.commitment}</Ltr></p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => {
                const url = URL.createObjectURL(new Blob([`${seed.name}\nseed: ${seed.seed}\ncommitment: ${seed.commitment}\n`], { type: 'text/plain' }))
                const a = document.createElement('a'); a.href = url; a.download = 'admission-lottery-seed.txt'; a.click(); URL.revokeObjectURL(url)
              }} data-action="download">{t('admission.seed_download')}</Button>
              <Button onClick={() => setSeed(null)} data-action="seed-done">{t('admission.seed_saved')}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
