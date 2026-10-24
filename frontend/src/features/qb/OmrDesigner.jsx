import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Lock, Unlock } from 'lucide-react'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import Card from '../../components/Card'
import Button from '../../components/Button'
import PrintButton from '../../components/PrintButton'
import { pdfPages } from './omrSheet'

// D133 / D110: qbank's OMR print screen (resources/views/omr/print.blade.php at 40f769c) - the paper's header card with its chips,
// the sheet's live preview and qbank's "OMR সেটিংস" controller in its order: output (page size, orientation, Generate OMR /
// edit again, print), marking, title & subtitle with sizes, appearance (web font, theme colour), candidate info (digital or
// manual) and candidate codes (show + digits), answer layout. Every change is saved after a short pause and the preview is the
// server's own sheet PDF drawn from the saved settings (`pdf?preview=1`), so what is seen is exactly what "Generate" prints and
// what the scanner reads. A generated form is locked; "edit again" unlocks it (a new layout version, as before).
export const OMR_DEFAULTS = { title: '', subtitle: '', title_size: 20, subtitle_size: 14, font: 'default', theme_color: 'black', entry_mode: 'digital',
  roll_digits: 6, digits: { class: 2, subject: 3, set: 1 }, option_count: 4, option_language: 'bangla', info_boxes: { class: false, roll: true, student_id: true, set: true },   // owner 2026-10-24: roll, 10-digit ID and set; class off by default
  page_size: 'a4', page_orientation: 'portrait', answer_columns: 'auto', question_mark: '1.00', negative_mark_enabled: false, negative_mark: '0.00', multiple_answer_policy: 'wrong' }
// the swatches only point at the colour; the sheet itself uses the server's exact colour for the same key
const SWATCH = { black: 'black', blue: 'royalblue', red: 'crimson', slate: 'slategray', sky: 'dodgerblue', green: 'forestgreen', purple: 'darkorchid',
  orange: 'darkorange', cyan: 'darkcyan', pink: 'mediumvioletred', yellow: 'goldenrod', lime: 'olivedrab' }
const FONTS = ['default', 'solaiman', 'kalpurush', 'noto', 'hind']
const PAGE_MM = { a4: [210, 297], a5: [148, 210], legal: [215.9, 355.6] }
const MAX_DIGITS = { class: 3, roll: 12, student_id: 10, set: 4 }   // D159 (4): the ID box is always 10 digits

export const omrFromSaved = (s) => ({ ...OMR_DEFAULTS, title: s.title ?? '', subtitle: s.subtitle ?? '', title_size: s.title_size ?? 20, subtitle_size: s.subtitle_size ?? 14,
  font: s.font ?? 'default', theme_color: s.theme_color ?? 'black', entry_mode: s.entry_mode ?? 'digital', roll_digits: s.roll_digits ?? 6,
  digits: { class: s.info_boxes?.class?.digits ?? 2, subject: s.info_boxes?.subject?.digits ?? 3, set: s.info_boxes?.set?.digits ?? 1 },
  option_count: s.option_count ?? 4, option_language: s.option_labels?.[0] === 'A' ? 'latin' : 'bangla',
  info_boxes: Object.fromEntries(['class', 'roll', 'student_id', 'set'].map(k => [k, (s.info_boxes?.[k] ?? s.info_boxes?.[k === 'student_id' ? 'subject' : k])?.visible !== false])),
  page_size: s.page_size ?? 'a4', page_orientation: s.page_orientation ?? 'portrait', answer_columns: String(s.answer_columns ?? 'auto'),
  question_mark: s.marking?.question_mark ?? '1.00', negative_mark_enabled: !!s.marking?.negative_mark_enabled, negative_mark: s.marking?.negative_mark ?? '0.00',
  multiple_answer_policy: s.marking?.multiple_answer_policy ?? 'wrong' })

export default function OmrDesigner({ id, form, onSaved }) {
  const { t } = useTranslation()
  const paper = useQuery({ queryKey: ['qb-paper', id], queryFn: () => api.get(`/question-bank/papers/${id}`).then(r => r.data.data) })
  const [v, setV] = useState(() => (form?.settings ? omrFromSaved(form.settings) : OMR_DEFAULTS))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState({ url: '', loading: false, error: false })
  const locked = !!form?.locked_at
  const toast = (m, k) => useUiStore.getState().addToast(m, k)

  // a new form starts with the paper's title
  useEffect(() => { if (!form && paper.data && !v.title) { setV(x => ({ ...x, title: paper.data.title })); setDirty(true) } }, [paper.data])   // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch) => { setV(x => ({ ...x, ...patch })); setDirty(true) }

  const body = () => ({ settings: { ...v, roll_digits: Number(v.roll_digits), option_count: Number(v.option_count), title_size: Number(v.title_size), subtitle_size: Number(v.subtitle_size),
    digits: { class: Number(v.digits.class), subject: Number(v.digits.subject), set: Number(v.digits.set) } } })
  // save after a pause; the preview follows the saved settings
  useEffect(() => {
    if (!dirty || locked || !v.title.trim()) return undefined
    const timer = setTimeout(async () => {
      setSaving(true)
      try { await api.put(`/question-bank/papers/${id}/omr-form`, body()); setError(''); setDirty(false); onSaved() }
      catch (e) { setError(Object.values(e.response?.data?.errors ?? {})[0]?.[0] ?? e.response?.data?.message ?? t('common.error')) }
      finally { setSaving(false) }
    }, 700)
    return () => clearTimeout(timer)
  }, [v, dirty, locked])   // eslint-disable-line react-hooks/exhaustive-deps

  const firstSet = form?.set_codes?.[0]
  const previewKey = JSON.stringify([form?.settings ?? null, form?.locked_at ?? null, form?.layout_version ?? null])
  useEffect(() => {
    if (!form) return undefined
    let gone = false
    setPreview(p => ({ ...p, loading: true, error: false }))
    api.get(`/question-bank/papers/${id}/omr-form/pdf`, { params: locked ? { set: firstSet } : { preview: 1 }, responseType: 'blob' })
      // drawn with the local pdf.js copy (D130) so every browser shows the sheet, also those without a built-in PDF viewer
      .then(async r => { let image = ''; await pdfPages(r.data, (canvas, n) => { if (n === 1) image = canvas.toDataURL('image/png') }); if (!gone) setPreview({ url: image, loading: false, error: false }) })
      .catch(() => { if (!gone) setPreview(p => ({ ...p, loading: false, error: true })) })
    return () => { gone = true }
  }, [previewKey])   // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (path) => {
    try { await api.post(`/question-bank/papers/${id}/omr-form/${path}`); toast(t('common.saved')); onSaved() }
    catch (e) { toast(e.response?.data?.message ?? t('common.error'), 'error') }
  }
  const [w, h] = PAGE_MM[v.page_size] ?? PAGE_MM.a4
  const dims = v.page_orientation === 'landscape' ? [h, w] : [w, h]
  const fits = ['a4', 'legal'].includes(v.page_size) && v.page_orientation === 'portrait'   // as the server's QbOmrFormService::pageFits
  const questions = form?.settings?.question_count ?? (paper.data?.sections ?? []).reduce((n, s) => n + s.items.length, 0)
  const status = locked ? 'generated' : form ? 'ready' : 'draft'
  const field = 'w-full rounded-token border px-3 py-2 text-sm'

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]" data-testid="omr-form">
      <div className="flex min-w-0 flex-col gap-4">
        <Card className="flex flex-wrap items-center justify-between gap-3" data-testid="omr-head">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary-fg">{t('qbomr.answer_sheet')}</p>
            <h2 className="text-lg font-semibold" dir="auto">{paper.data?.title ?? v.title}</h2>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full px-2 py-0.5 [border:1px_solid_var(--line)]">{t('qbomr.chip_questions', { n: questions })}</span>
              <span className="rounded-full px-2 py-0.5 [border:1px_solid_var(--line)]">{t('qbomr.chip_options', { n: v.option_count })}</span>
              {form && <span className="rounded-full px-2 py-0.5 [border:1px_solid_var(--line)]" dir="ltr">{t('qbomr.chip_form', { code: form.code })}</span>}
            </div>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status === 'draft' ? 'bg-surface-muted' : 'bg-primary-soft text-primary-fg'}`} data-status={status}>● {t(`qbomr.status_${status}`)}</span>
        </Card>
        <Card className="flex min-h-[32rem] flex-col items-center justify-center gap-2 bg-surface-muted p-3" data-testid="omr-preview">
          {!form && <p className="text-sm text-content-muted">{t('qbomr.preview_after_save')}</p>}
          {form && preview.error && <p className="text-sm text-content-muted" role="alert">{t('qbomr.preview_failed')}</p>}
          {form && preview.url && <img alt={t('qbomr.preview')} src={preview.url} className={`w-full max-w-[52rem] bg-surface shadow-card transition-opacity ${preview.loading ? 'opacity-60' : ''}`} data-testid="omr-preview-frame" />}
          {form && !preview.url && preview.loading && <p className="text-sm text-content-muted">{t('qbomr.preview_loading')}</p>}
        </Card>
      </div>

      <aside className="flex flex-col gap-3 xl:sticky xl:top-4 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto" data-testid="omr-controller">
        <Card className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{t('qbomr.settings')}</h2>
            <span className="text-xs font-semibold text-primary-fg">{saving ? t('qbomr.saving') : t(`qbomr.status_${status}`)}</span></div>
          <p className="text-xs text-content-muted">{t('qbomr.settings_hint')}</p>
          {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
        </Card>

        <fieldset disabled={locked} className="flex flex-col gap-3">
          <Section title={t('qbomr.sec_output')}>
            <Labelled label={t('qbomr.page_size')}><select className={field} name="page_size" value={v.page_size} onChange={e => set({ page_size: e.target.value })}>{['a4', 'a5', 'legal'].map(x => <option key={x} value={x}>{x.toUpperCase()}</option>)}</select></Labelled>
            <p className="text-xs text-content-muted" dir="ltr">{dims[0]} × {dims[1]} mm</p>
            <Labelled label={t('qbomr.orientation')}>
              <div className="grid grid-cols-2 gap-1 rounded-token bg-surface-muted p-1" role="group" aria-label={t('qbomr.orientation')}>
                {['portrait', 'landscape'].map(x => <button key={x} type="button" aria-pressed={v.page_orientation === x} onClick={() => set({ page_orientation: x })} data-orientation={x}
                  className={`rounded-token px-2 py-1.5 text-sm font-semibold ${v.page_orientation === x ? 'bg-primary text-on-primary' : 'text-content-muted'}`}>{t(`qbomr.${x}`)}</button>)}
              </div>
            </Labelled>
            {fits ? <p className="text-xs text-content-muted">✓ {t('qbomr.fit_note', { size: v.page_size.toUpperCase(), orientation: t(`qbomr.${v.page_orientation}`) })}</p>
              : <p className="text-xs text-red-600" role="alert" data-testid="omr-no-fit">⚠ {t('qbomr.no_fit', { size: v.page_size.toUpperCase(), orientation: t(`qbomr.${v.page_orientation}`) })}</p>}
          </Section>
        </fieldset>
        <Card className="flex flex-col gap-2">
          {!locked && <Button onClick={() => act('generate')} disabled={!form || dirty || saving || !fits} data-action="generate"><Lock aria-hidden="true" className="h-4 w-4" />{t('qbomr.generate')}</Button>}
          {locked && <>
            {/* owner 2026-10-24: one sheet for every set - the student bubbles the set code, the sheet names no set */}
            {firstSet && <div className="flex flex-wrap gap-2"><PrintButton variant="primary" url={`/question-bank/papers/${id}/omr-form/pdf`} params={{ set: firstSet }} filename={`omr-${form.code}.pdf`} label={t('qbpv.print')} /></div>}
            <Button variant="secondary" onClick={() => act('unlock')} data-action="unlock"><Unlock aria-hidden="true" className="h-4 w-4" />{t('qbomr.unlock')}</Button>
            <p className="text-xs text-content-muted">{t('qbomr.locked_hint', { version: form.layout_version })}</p>
          </>}
        </Card>

        <fieldset disabled={locked} className="flex flex-col gap-3">
          <Section title={t('qbomr.sec_marking')}>
            <Labelled label={t('qbomr.question_mark')}><input className={field} dir="ltr" inputMode="decimal" name="question_mark" value={v.question_mark} onChange={e => set({ question_mark: e.target.value })} /></Labelled>
            <Labelled label={t('qbomr.negative')}><select className={field} name="negative_mark_enabled" value={v.negative_mark_enabled ? '1' : '0'} onChange={e => set({ negative_mark_enabled: e.target.value === '1' })}>
              <option value="0">{t('qbomr.off')}</option><option value="1">{t('qbomr.on')}</option></select></Labelled>
            <Labelled label={t('qbomr.negative_mark')}><input className={field} dir="ltr" inputMode="decimal" name="negative_mark" value={v.negative_mark} onChange={e => set({ negative_mark: e.target.value })} /></Labelled>
            <Labelled label={t('qbomr.multiple')}><select className={field} name="multiple_answer_policy" value={v.multiple_answer_policy} onChange={e => set({ multiple_answer_policy: e.target.value })}>
              {['wrong', 'correct_if_any'].map(x => <option key={x} value={x}>{t(`qbomr.policy.${x}`)}</option>)}</select></Labelled>
          </Section>

          <Section title={t('qbomr.sec_title')}>
            <Labelled label={t('qbomr.form_title')}><input className={field} dir="auto" name="title" value={v.title} onChange={e => set({ title: e.target.value })} /></Labelled>
            <Slider label={t('qbomr.title_size')} name="title_size" min={12} max={32} value={v.title_size} onChange={n => set({ title_size: n })} />
            <Labelled label={t('qbomr.subtitle')}><input className={field} dir="auto" name="subtitle" placeholder={t('qbomr.subtitle_ph')} value={v.subtitle} onChange={e => set({ subtitle: e.target.value })} /></Labelled>
            <Slider label={t('qbomr.subtitle_size')} name="subtitle_size" min={10} max={24} value={v.subtitle_size} onChange={n => set({ subtitle_size: n })} />
          </Section>

          <Section title={t('qbomr.sec_appearance')}>
            <Labelled label={t('qbomr.font')}><select className={field} name="font" value={v.font} onChange={e => set({ font: e.target.value })}>{FONTS.map(f => <option key={f} value={f}>{t(`qbomr.fonts.${f}`)}</option>)}</select></Labelled>
            <Labelled label={t('qbomr.theme_color')}>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('qbomr.theme_color')}>
                {Object.entries(SWATCH).map(([key, css]) => <button key={key} type="button" role="radio" aria-checked={v.theme_color === key} aria-label={t(`qbomr.colors.${key}`)} title={t(`qbomr.colors.${key}`)}
                  onClick={() => set({ theme_color: key })} className={`h-8 w-8 rounded-token ${v.theme_color === key ? 'ring-2 ring-primary-fg ring-offset-2' : ''}`} style={{ backgroundColor: css }} data-color={key} />)}
              </div>
            </Labelled>
          </Section>

          <Section title={t('qbomr.sec_candidate')}>
            <div className="grid grid-cols-2 gap-1 rounded-token bg-surface-muted p-1" role="group" aria-label={t('qbomr.sec_candidate')}>
              {['digital', 'manual'].map(x => <button key={x} type="button" aria-pressed={v.entry_mode === x} onClick={() => set({ entry_mode: x })} data-entry={x}
                className={`rounded-token px-2 py-1.5 text-sm font-semibold ${v.entry_mode === x ? 'bg-primary text-on-primary' : 'text-content-muted'}`}>{t(`qbomr.entry.${x}`)}</button>)}
            </div>
            <p className="text-xs text-content-muted">{t(`qbomr.entry_hint.${v.entry_mode}`)}</p>
          </Section>

          <Section title={t('qbomr.sec_codes')}>
            {['class', 'roll', 'student_id', 'set'].map(k => (
              <div key={k} className="grid grid-cols-[1fr_5.5rem] items-end gap-2" data-code={k}>
                <label className="flex flex-col gap-1 text-sm"><span className="font-semibold">{t(`qbomr.box.${k}`)}</span>
                  <span className="flex items-center gap-2"><input type="checkbox" name={`box-${k}`} checked={v.info_boxes[k]} onChange={e => set({ info_boxes: { ...v.info_boxes, [k]: e.target.checked } })} />{t('qbomr.show')}</span></label>
                <label className="flex flex-col gap-1 text-xs text-content-muted">{t('qbomr.digits')}
                  <input className={field} type="number" dir="ltr" min={1} max={MAX_DIGITS[k]} name={`digits-${k}`} value={k === 'roll' ? v.roll_digits : k === 'student_id' ? 10 : v.digits[k]} disabled={k === 'student_id'}
                    onChange={e => { const n = Math.max(1, Math.min(MAX_DIGITS[k], Number(e.target.value) || 1)); if (k === 'roll') set({ roll_digits: n }); else set({ digits: { ...v.digits, [k]: n } }) }} /></label>
              </div>
            ))}
            <p className="text-xs text-content-muted">{t('qbomr.codes_hint')}</p>
          </Section>

          <Section title={t('qbomr.sec_answers')}>
            <Labelled label={t('qbomr.columns')}><select className={field} name="answer_columns" value={v.answer_columns} onChange={e => set({ answer_columns: e.target.value })}>
              {['auto', '1', '2', '3', '4', '5', '6'].map(x => <option key={x} value={x}>{x === 'auto' ? t('qbomr.auto') : x}</option>)}</select></Labelled>
            <p className="text-xs text-content-muted">{t('qbomr.columns_hint')}</p>
            <Labelled label={t('qbomr.option_count')}><select className={field} name="option_count" value={String(v.option_count)} onChange={e => set({ option_count: Number(e.target.value) })}>{[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}</select></Labelled>
            <Labelled label={t('qbomr.option_language')}><select className={field} name="option_language" value={v.option_language} onChange={e => set({ option_language: e.target.value })}>
              <option value="bangla">ক খ গ ঘ</option><option value="latin">A B C D</option></select></Labelled>
          </Section>
        </fieldset>
      </aside>
    </div>
  )
}

function Section({ title, children }) {
  return <Card className="flex flex-col gap-3"><h3 className="text-xs font-bold uppercase tracking-widest text-content-muted">{title}</h3>{children}</Card>
}

function Labelled({ label, children }) {
  return <label className="flex flex-col gap-1 text-sm"><span className="font-semibold">{label}</span>{children}</label>
}

function Slider({ label, name, min, max, value, onChange }) {
  return (
    <label className="flex flex-col gap-1 text-sm"><span className="flex justify-between font-semibold">{label}<span className="text-xs text-content-muted" dir="ltr">{value}px</span></span>
      <input type="range" name={name} min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))} /></label>
  )
}
