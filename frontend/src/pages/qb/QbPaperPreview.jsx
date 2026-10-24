import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, ArrowDown, ArrowUp, FileText, Image as ImageIcon, ImagePlus, Pencil, Printer, RotateCcw, Trash2 } from 'lucide-react'
import api from '../../api/axios'
import Loader from '../../components/Loader'
import { ErrorState } from '../../components/StateViews'
import MathText from '../../features/qb/MathText'
import { loadFont } from '../../theme/fonts'

// D133 / D110: qbank's question-paper print preview with its Paper Controller (resources/views/question-paper/preview.blade.php at
// 40f769c) - export bar, language, section controls and order, header settings with a size ruler per line, content visibility,
// typography, layout (column line, margin, text boxes, columns). The paper is the set's printable data (GET papers/{id}/pdf?format=json,
// answers only for bought questions as on the server); every setting is the viewer's own and is remembered in this browser only.
// Visible differences forced by SMS (D110 (3)): PDF goes through the browser's print dialog ("Save as PDF") and the picture export is
// off, because qbank's html2canvas/jsPDF are not SMS dependencies (G7); the font list is the families SMS can load (D52) plus the
// Bangla system fonts qbank names; questions carry no source line yet (the printable shape has no occurrences).
// Owner request 2026-10-24: a question's wording can be changed for this paper only - the edit is kept with this paper and set in
// this browser and never reaches the question bank (no decision yet stores it on the server; D133 adds no table); which option is
// right cannot change here, so the OMR answer key stays true. Text boxes and pictures are dropped between two questions, open a
// gap there and take that place in the flow; their corner handle resizes them.
// Owner request 2026-10-24 (as Word's "Wrap Text"): every box has a wrap mode - In line, Square, Tight, Top and bottom (in the
// flow, dropped into any gap: above, between or under the header lines, under a section title, between questions), Behind text and
// In front of text (free on the page, moved anywhere). Dragging moves the box itself with the pointer (no re-render per move).

const BN_DIGITS = '০১২৩৪৫৬৭৮৯'
const toBn = (v) => String(v ?? '').replace(/\d/g, d => BN_DIGITS[d])
const LABELS = { bn: ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ'], en: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] }
const FONTS = [
  { value: 'SolaimanLipi', label: 'Solaiman Lipi' }, { value: 'Kalpurush', label: 'Kalpurush' },
  { value: 'Noto Sans Bengali', label: 'Noto Sans Bengali', load: 'noto-sans-bengali' }, { value: 'Hind Siliguri', label: 'Hind Siliguri', load: 'hind-siliguri' },
  { value: 'Baloo Da 2', label: 'Baloo Da 2', load: 'baloo-da-2' }, { value: 'Anek Bangla', label: 'Anek Bangla', load: 'anek-bangla' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
]
const HEADER_LINES = ['institution', 'exam', 'class', 'subject']
const DEFAULTS = {
  language: 'bn', showSections: true, restartNumbers: false, pageBreak: false,
  sizes: { institution: 24, exam: 18, class: 16, subject: 14, setCode: 14, time: 14, marks: 14 }, headerStyle: 'simple',
  show: { question: true, answer: true, explanation: true, source: true },
  font: 'SolaimanLipi', fontSize: 14, fontWeight: 400, lineHeight: 1.4,
  columnLine: true, margin: 18, boxBorder: true, boxBottomLine: false, columns: 2,
}
const STORE = 'qb-paper-preview'
const FREE = ['behind', 'front']                         // wraps placed freely on the page; the rest sit in the flow
const ALIGNS = [['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight], ['justify', AlignJustify]]   // the box text's alignment, as Word
const WRAPS = ['inline', 'square', 'tight', 'topBottom', 'behind', 'front']
const paperStore = (id, set) => `qb-paper-preview:${id}:${set}`
const readJson = (key, fallback) => { try { return JSON.parse(window.localStorage.getItem(key) ?? 'null') ?? fallback } catch { return fallback } }
const writeJson = (key, value) => { try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* full or private: kept until the page closes */ } }
function remembered() {
  try { const v = JSON.parse(window.localStorage.getItem(STORE) ?? 'null'); return v ? { ...DEFAULTS, ...v, sizes: { ...DEFAULTS.sizes, ...v.sizes }, show: { ...DEFAULTS.show, ...v.show } } : DEFAULTS } catch { return DEFAULTS }
}

export default function QbPaperPreview() {
  const { t, i18n } = useTranslation()
  const { id } = useParams()
  const [params] = useSearchParams()
  const set = params.get('set') ?? 'A'
  const base = useLocation().pathname.replace(/\/\d+\/preview$/, '')
  const paper = useQuery({ queryKey: ['qb-paper-preview', id, set], queryFn: () => api.get(`/question-bank/papers/${id}/pdf`, { params: { set, answers: 1, format: 'json' } }).then(r => r.data.data) })
  const [o, setO] = useState(remembered)
  const [header, setHeader] = useState(null)
  const [order, setOrder] = useState(null)
  const saved = useMemo(() => readJson(paperStore(id, set), {}), [id, set])
  const [edits, setEdits] = useState(saved.edits ?? {})      // question id -> { question_text, options: [text], answer_text, explanation_text }
  const [boxes, setBoxes] = useState(saved.boxes ?? [])      // { id, kind: text|image, anchor: question id | 'top', width, height, html, src }
  const [editing, setEditing] = useState(null)
  const [activeBox, setActiveBox] = useState(null)
  const [drop, setDrop] = useState(null)
  const ghostRef = useRef(null)
  const paperRef = useRef(null)
  const drag = useRef(null)
  const imageInput = useRef(null)

  useEffect(() => { try { window.localStorage.setItem(STORE, JSON.stringify(o)) } catch { /* private window: the settings just are not remembered */ } }, [o])
  useEffect(() => { const f = FONTS.find(x => x.value === o.font); if (f?.load) loadFont(f.load) }, [o.font])
  useEffect(() => { writeJson(paperStore(id, set), { edits, boxes }) }, [id, set, edits, boxes])
  useEffect(() => {
    const d = paper.data
    if (!d) return
    setHeader({ institution: d.institution ?? '', exam: d.exam_name || d.title || '', class: '', subject: '', setCode: d.sets_count > 1 ? d.set_code : '',
      time: d.duration_minutes ? t('qbpv.minutes', { n: d.duration_minutes }) : t('qbpv.default_time'), marks: d.total_marks ?? '', instructions: d.instructions ?? '' })
    setOrder(d.sections.map((_, i) => i))
  }, [paper.data, t])

  const en = o.language === 'en'
  const L = (key) => i18n.getFixedT(o.language)(`qbpv.paper.${key}`)
  const num = (v) => (en ? String(v) : toBn(v))
  const setOpt = (patch) => setO(p => ({ ...p, ...patch }))
  const sections = useMemo(() => (order ?? []).map(i => paper.data?.sections[i]).filter(Boolean), [order, paper.data])

  if (paper.isPending || !header) return <Loader type="page" />
  if (paper.isError) return <ErrorState onRetry={paper.refetch} />

  const move = (i, dir) => setOrder(list => { const next = [...list]; const j = i + dir; if (j < 0 || j >= next.length) return list; [next[i], next[j]] = [next[j], next[i]]; return next })
  const print = () => { window.focus(); window.print() }
  const addBox = (extra = {}) => { const box = { id: Date.now(), kind: 'text', wrap: 'topBottom', anchor: 'top', side: 'start', x: 40, y: 40, width: 240, height: 0, html: '', ...extra }; setBoxes(b => [...b, box]); setActiveBox(box.id) }
  const addImage = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file?.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => addBox({ kind: 'image', src: String(reader.result), width: 200 })
    reader.readAsDataURL(file)
  }
  const patchBox = (boxId, patch) => setBoxes(list => list.map(b => (b.id === boxId ? { ...b, ...patch } : b)))
  const format = (cmd) => { if (activeBox) document.execCommand(cmd) }
  // the gap a dragged box would drop into: after the last gap marker (header line, section title, question) whose middle is above
  // the pointer, or before the first header line
  const gapAt = (y) => {
    let anchor = 'h-start'
    paperRef.current?.querySelectorAll('[data-gap]').forEach(el => { const r = el.getBoundingClientRect(); if (r.top + r.height / 2 < y) anchor = el.dataset.gap })
    return anchor
  }
  const boxEl = (boxId) => paperRef.current?.querySelector(`[data-box="${boxId}"]`)
  const startDrag = (b, e) => {
    e.preventDefault()
    const el = boxEl(b.id)
    if (!el || !paperRef.current) return
    const r = el.getBoundingClientRect()
    const d = { id: b.id, free: FREE.includes(b.wrap), el, dx: e.clientX - r.left, dy: e.clientY - r.top, gap: null, side: b.side ?? 'start', x: b.x ?? 0, y: b.y ?? 0 }
    setActiveBox(b.id)
    const ghost = ghostRef.current
    if (!d.free && ghost) {
      Object.assign(ghost.style, { display: 'block', width: `${r.width}px`, height: `${r.height}px`, transform: `translate(${r.left}px, ${r.top}px)` })
      el.style.opacity = '0.35'
    }
    d.move = (ev) => {
      const pr = paperRef.current.getBoundingClientRect()
      if (d.free) {
        d.x = Math.round(ev.clientX - pr.left - d.dx); d.y = Math.round(ev.clientY - pr.top - d.dy)
        el.style.left = `${d.x}px`; el.style.top = `${d.y}px`
        return
      }
      if (ghost) ghost.style.transform = `translate(${ev.clientX - d.dx}px, ${ev.clientY - d.dy}px)`
      d.side = ev.clientX - pr.left < pr.width / 2 ? 'start' : 'end'
      const g = gapAt(ev.clientY)
      if (g !== d.gap) { d.gap = g; setDrop(g) }
    }
    d.up = (ev) => {
      window.removeEventListener('pointermove', d.move)
      window.removeEventListener('pointerup', d.up)
      drag.current = null
      if (d.free) patchBox(d.id, { x: d.x, y: d.y })
      else {
        el.style.opacity = ''
        if (ghost) ghost.style.display = 'none'
        patchBox(d.id, { anchor: gapAt(ev.clientY), side: d.side })
        setDrop(null)
      }
    }
    drag.current = d
    window.addEventListener('pointermove', d.move)
    window.addEventListener('pointerup', d.up)
  }
  // Word's wrap switch keeps the box where it is on the page
  const setWrap = (boxId, wrap) => {
    const b = boxes.find(x => x.id === boxId)
    const el = boxEl(boxId)
    if (!b || !el || !paperRef.current) return patchBox(boxId, { wrap })
    const r = el.getBoundingClientRect()
    const pr = paperRef.current.getBoundingClientRect()
    if (FREE.includes(wrap) && !FREE.includes(b.wrap)) return patchBox(boxId, { wrap, x: Math.round(r.left - pr.left), y: Math.round(r.top - pr.top) })
    if (!FREE.includes(wrap) && FREE.includes(b.wrap)) return patchBox(boxId, { wrap, anchor: gapAt(r.top + r.height / 2) })
    return patchBox(boxId, { wrap })
  }
  const q = (item) => ({ ...item.question, ...edits[item.question.id], options: (item.question.options ?? []).map((op, k) => ({ ...op, content_text: edits[item.question.id]?.options?.[k] ?? op.content_text })) })
  const box = (b) => <PaperBox key={b.id} box={b} t={t} active={activeBox === b.id} onFocus={() => setActiveBox(b.id)} onChange={patch => patchBox(b.id, patch)}
    onDelete={() => setBoxes(list => list.filter(x => x.id !== b.id))} onGrab={e => startDrag(b, e)} />
  const renderBoxes = (anchor) => [
    drop === anchor && <div key="drop" className="qb-no-print my-1 h-8 w-full rounded-token [border:2px_dashed_var(--color-primary)]" data-testid="qb-drop-gap" />,
    ...boxes.filter(b => !FREE.includes(b.wrap) && String(b.anchor) === String(anchor)).map(box),
  ]
  const activeWrap = boxes.find(b => b.id === activeBox)?.wrap ?? 'topBottom'

  const paperStyle = { fontFamily: `${o.font}, 'Noto Sans Bengali', sans-serif`, fontSize: `${o.fontSize}px`, fontWeight: o.fontWeight, lineHeight: o.lineHeight, padding: `${o.margin}mm` }
  let running = 0
  return (
    <div className="qb-print-root flex flex-col gap-4 lg:flex-row lg:items-start" data-testid="qb-paper-preview">
      <style>{`
        .qb-paper .qb-cols{column-count:${o.columns};column-gap:2rem;column-rule:${o.columnLine && o.columns > 1 ? '1px solid var(--line)' : 'none'}}
        .qb-paper .qb-q{break-inside:avoid}
        .qb-paper .qb-cols,.qb-paper header{display:flow-root}
        .qb-paper>:not(.qb-free):not(.qb-ghost){position:relative;z-index:1}
        .qb-paper .qb-free.qb-behind{z-index:0}
        .qb-paper .qb-free.qb-front{z-index:2}
        .qb-paper .qb-free.qb-behind.qb-active{z-index:3}
        .qb-paper .qb-box{border:${o.boxBorder ? '1px solid currentColor' : '0'};border-bottom:${o.boxBottomLine ? '1px solid currentColor' : o.boxBorder ? '1px solid currentColor' : '0'}}
        @media print{
          @page{size:A4;margin:0}
          html,body{background:white!important}
          body *{visibility:hidden}
          .qb-paper,.qb-paper *{visibility:visible}
          .qb-paper{position:absolute;inset-inline-start:0;top:0;width:100%;box-shadow:none;border:0;border-radius:0}
          .qb-no-print{display:none!important}
          .qb-paper .qb-box{resize:none;box-shadow:none!important}
        }`}</style>

      <div className="flex min-w-0 flex-1 justify-center">
        <article ref={paperRef} lang={o.language} className="qb-paper relative w-full max-w-[210mm] rounded-token bg-surface text-content shadow-card [border:1px_solid_var(--line)]"
          style={paperStyle} data-testid="qb-paper">
          {renderBoxes('h-start')}
          <header className={`pb-2 text-center ${o.headerStyle === 'bordered' ? 'rounded-token p-3 [border:2px_solid_currentColor]' : ''} ${o.headerStyle === 'image' ? 'rounded-token bg-surface-muted p-3' : ''}`} data-testid="qb-paper-header">
            {HEADER_LINES.map(k => header[k] && [<div key={k} style={{ fontSize: `${o.sizes[k]}px` }} className={`mb-1 ${k === 'institution' ? 'font-semibold' : ''}`} dir="auto" data-line={k} data-gap={`h-${k}`}>{header[k]}</div>, ...renderBoxes(`h-${k}`)])}
            <div className="mt-1 flex w-full items-end justify-between gap-2 border-y border-line py-1" data-gap="h-meta">
              <span style={{ fontSize: `${o.sizes.time}px` }}>{L('time')} : {num(header.time)}</span>
              <span className="flex gap-3">
                {header.setCode && <span style={{ fontSize: `${o.sizes.setCode}px` }} data-testid="qb-paper-set">{L('set')} {header.setCode}</span>}
                <span style={{ fontSize: `${o.sizes.marks}px` }}>{L('full_marks')} : {num(header.marks)}</span>
              </span>
            </div>
            {renderBoxes('h-meta')}
          </header>
          <div data-gap="top">{header.instructions.trim() && <p className="whitespace-pre-line pb-2 text-center text-sm" dir="auto" data-testid="qb-paper-instructions">{header.instructions}</p>}</div>
          {renderBoxes('top')}

          {sections.map((s, si) => (
            <section key={si} className="pt-3" style={{ breakBefore: o.pageBreak && si > 0 ? 'page' : 'auto' }} data-testid="qb-paper-section">
              {o.showSections && s.title && <h2 className="mb-2 border-b border-line pb-1 text-center font-semibold" dir="auto" data-gap={`s-${si}`}>{s.title}</h2>}
              {renderBoxes(`s-${si}`)}
              {o.showSections && s.instruction && <p className="mb-2 text-center text-sm" dir="auto">{s.instruction}</p>}
              <div className="qb-cols">
                {s.items.map((it, ii) => {
                  running += 1
                  const no = o.restartNumbers ? ii + 1 : it.no
                  const qn = q(it)
                  const opts = qn.options ?? []
                  const qid = String(it.question.id ?? `${si}-${ii}`)
                  if (editing === qid) return <QuestionEditor key={qid} t={t} question={it.question} value={edits[it.question.id]} onCancel={() => setEditing(null)}
                    onSave={v => { setEdits(e => ({ ...e, [it.question.id]: v })); setEditing(null) }} onReset={() => { setEdits(({ [it.question.id]: _drop, ...rest }) => rest); setEditing(null) }} />
                  return [
                    <div key={`${si}-${ii}`} className="qb-q group relative mb-4" data-testid="qb-paper-question" data-qid={qid} data-gap={qid} data-edited={edits[it.question.id] ? 'yes' : undefined}>
                      <button type="button" onClick={() => setEditing(qid)} className="qb-no-print absolute -top-1 end-0 rounded-token bg-surface p-1 text-content-muted opacity-60 hover:opacity-100 group-hover:opacity-100 [border:1px_solid_var(--line)]" aria-label={t('qbpv.edit_question', { n: no })} data-action="edit-question"><Pencil aria-hidden="true" className="h-3.5 w-3.5" /></button>
                      {edits[it.question.id] && <span className="qb-no-print absolute -top-1 end-8 rounded-token bg-primary-soft px-1 text-xs text-primary-fg">{t('qbpv.edited')}</span>}
                      {it.subject && <p className="mb-1 font-semibold" dir="auto">{it.subject}</p>}
                      {o.show.question && <div className="flex gap-2 font-semibold"><span>{num(no)}.</span><div className="min-w-0 flex-1" dir="auto"><MathText text={qn.question_text} media={qn.media ?? []} /></div></div>}
                      {o.show.question && (qn.creative_parts ?? []).length > 0 && <ol className="mt-1 flex flex-col gap-1 ps-6">{qn.creative_parts.map(p => <li key={p.part_label} dir="auto"><span>{p.part_label}.</span> <MathText text={p.question_text} /></li>)}</ol>}
                      {o.show.answer && qn.answer_text && <div className="mt-1" data-testid="qb-paper-answer"><p>{L('answer')}</p><div dir="auto"><MathText text={qn.answer_text} /></div></div>}
                      {o.show.question && opts.length > 0 && (
                        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
                          {opts.map((op, k) => (
                            <div key={k} className="flex min-w-0 items-start gap-2">
                              <span className="font-semibold">{(LABELS[o.language][k] ?? op.label)})</span>
                              {o.show.answer && op.is_correct && <span aria-label={L('correct')} className="mt-2 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-[currentColor]" data-testid="qb-paper-correct" />}
                              <span className="min-w-0" dir="auto"><MathText text={op.content_text} /></span>
                            </div>
                          ))}
                        </div>
                      )}
                      {o.show.explanation && qn.explanation_text && <div className="mt-1" data-testid="qb-paper-explanation"><p>{L('explanation')}</p><div dir="auto"><MathText text={qn.explanation_text} /></div></div>}
                    </div>,
                    ...renderBoxes(qid),
                  ]
                })}
              </div>
            </section>
          ))}
          {running === 0 && <p className="py-8 text-center text-content-muted">{t('qbpv.empty')}</p>}
          {boxes.filter(b => FREE.includes(b.wrap)).map(box)}
          <div ref={ghostRef} aria-hidden="true" className="qb-ghost qb-no-print pointer-events-none fixed top-0 z-50 hidden rounded-token bg-primary-soft opacity-70 [border:2px_dashed_var(--color-primary)]" style={{ left: 0 }} data-testid="qb-drag-ghost" />

        </article>
      </div>

      <aside className="qb-no-print flex w-full flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-6rem)] lg:w-80 lg:overflow-y-auto" data-testid="paper-controller">
        <div className="rounded-token bg-surface p-3 shadow-card [border:1px_solid_var(--line)]">
          <h2 className="mb-3 text-lg font-semibold">⚙️ {t('qbpv.controller')}</h2>
          <div className="grid grid-cols-3 gap-2">
            <button type="button" onClick={print} className="flex items-center justify-center gap-1 rounded-token bg-primary px-2 py-2 text-sm font-medium text-on-primary" data-action="print"><Printer aria-hidden="true" className="h-4 w-4" />{t('qbpv.print')}</button>
            <button type="button" onClick={print} title={t('qbpv.pdf_hint')} className="flex items-center justify-center gap-1 rounded-token bg-primary px-2 py-2 text-sm font-medium text-on-primary" data-action="pdf"><FileText aria-hidden="true" className="h-4 w-4" />PDF</button>
            <button type="button" disabled title={t('qbpv.image_off')} className="flex items-center justify-center gap-1 rounded-token bg-primary px-2 py-2 text-sm font-medium text-on-primary opacity-50" data-action="image"><ImageIcon aria-hidden="true" className="h-4 w-4" />{t('qbpv.image')}</button>
          </div>
        </div>

        <Panel title={t('qbpv.language')}>
          <div className="flex items-center justify-between gap-2 text-sm"><span>English</span>
            <Toggle checked={!en} onChange={v => setOpt({ language: v ? 'bn' : 'en' })} label={t('qbpv.language')} name="language" /><span>বাংলা</span></div>
        </Panel>

        <Panel title={t('qbpv.section_controls')}>
          <ToggleRow label={t('qbpv.sections')} checked={o.showSections} onChange={v => setOpt({ showSections: v })} name="show_sections" />
          <ToggleRow label={t('qbpv.restart')} checked={o.restartNumbers} onChange={v => setOpt({ restartNumbers: v })} name="restart_numbers" />
          <ToggleRow label={t('qbpv.page_break')} checked={o.pageBreak} onChange={v => setOpt({ pageBreak: v })} name="page_break" />
          <p className="mt-2 text-sm font-semibold text-primary-fg">{t('qbpv.section_order')}</p>
          <ul className="flex flex-col gap-1" data-testid="section-order">
            {sections.map((s, i) => (
              <li key={i} className="flex items-center gap-2 rounded-token bg-surface-muted px-2 py-1 text-sm">
                <span className="min-w-0 flex-1 truncate" dir="auto">{s.title || t('qbpv.section_n', { n: i + 1 })}</span>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t('qbpv.move_up')} className="disabled:opacity-40"><ArrowUp aria-hidden="true" className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === sections.length - 1} aria-label={t('qbpv.move_down')} className="disabled:opacity-40"><ArrowDown aria-hidden="true" className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={t('qbpv.header_settings')}>
          <div className="grid grid-cols-2 gap-3">
            {['institution', 'exam', 'class', 'subject', 'setCode', 'time', 'marks'].map(k => (
              <label key={k} className="flex min-w-0 flex-col gap-1 text-sm">
                <span className="font-semibold">{t(`qbpv.h.${k}`)}</span>
                <input className="min-w-0 rounded-token border px-2 py-1" value={header[k]} name={`header_${k}`} dir="auto" placeholder={k === 'setCode' ? 'A / B / C' : ''} onChange={e => setHeader(h => ({ ...h, [k]: e.target.value }))} />
                <span className="flex items-center gap-2"><input type="range" min="10" max="32" value={o.sizes[k]} className="min-w-0 flex-1" aria-label={t('qbpv.size_of', { x: t(`qbpv.h.${k}`) })}
                  onChange={e => setO(p => ({ ...p, sizes: { ...p.sizes, [k]: Number(e.target.value) } }))} /><span className="text-xs text-content-muted" dir="ltr">{o.sizes[k]}px</span></span>
              </label>
            ))}
            <label className="flex min-w-0 flex-col gap-1 text-sm"><span className="font-semibold">{t('qbpv.header_style')}</span>
              <select className="rounded-token border px-2 py-1" value={o.headerStyle} name="header_style" onChange={e => setOpt({ headerStyle: e.target.value })}>
                {['simple', 'bordered', 'image'].map(s => <option key={s} value={s}>{t(`qbpv.styles.${s}`)}</option>)}
              </select></label>
            <label className="col-span-2 flex flex-col gap-1 text-sm"><span className="font-semibold">{t('qbpv.instructions')}</span>
              <textarea rows={2} className="rounded-token border px-2 py-1" name="instructions" dir="auto" placeholder={t('qbpv.instructions_ph')} value={header.instructions} onChange={e => setHeader(h => ({ ...h, instructions: e.target.value }))} /></label>
          </div>
        </Panel>

        <Panel title={t('qbpv.visibility')}>
          {['question', 'answer', 'explanation', 'source'].map(k => <ToggleRow key={k} label={t(`qbpv.show.${k}`)} checked={o.show[k]} name={`show_${k}`} onChange={v => setO(p => ({ ...p, show: { ...p.show, [k]: v } }))} />)}
        </Panel>

        <Panel title={t('qbpv.typography')}>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="flex min-w-0 flex-col gap-1"><span className="font-semibold">{t('qbpv.font')}</span>
              <select className="min-w-0 rounded-token border px-2 py-1" value={o.font} name="font" onChange={e => setOpt({ font: e.target.value })}>{FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}</select></label>
            <Range label={t('qbpv.font_size')} min={12} max={24} step={1} value={o.fontSize} shown={`${o.fontSize}px`} onChange={v => setOpt({ fontSize: v })} />
            <Range label={t('qbpv.font_weight')} min={400} max={700} step={100} value={o.fontWeight} shown={o.fontWeight} onChange={v => setOpt({ fontWeight: v })} />
            <Range label={t('qbpv.line_height')} min={1.2} max={2.2} step={0.1} value={o.lineHeight} shown={o.lineHeight.toFixed(1)} onChange={v => setOpt({ lineHeight: v })} />
          </div>
        </Panel>

        <Panel title={t('qbpv.layout')}>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={o.columnLine} name="column_line" onChange={e => setOpt({ columnLine: e.target.checked })} />{t('qbpv.column_line')}</label>
            <Range label={t('qbpv.margin')} min={12} max={30} step={1} value={o.margin} shown={`${o.margin}mm`} onChange={v => setOpt({ margin: v })} />
            <label className="flex items-center gap-2"><input type="checkbox" checked={o.boxBorder} name="box_border" onChange={e => setOpt({ boxBorder: e.target.checked })} />{t('qbpv.box_border')}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={o.boxBottomLine} name="box_bottom" onChange={e => setOpt({ boxBottomLine: e.target.checked })} />{t('qbpv.box_bottom')}</label>
            <button type="button" onClick={() => addBox()} className="rounded-token bg-primary px-3 py-2 font-medium text-on-primary" data-action="add-text-box">📝 {t('qbpv.add_box')}</button>
            <button type="button" onClick={() => imageInput.current?.click()} className="flex items-center justify-center gap-1 rounded-token bg-primary px-3 py-2 font-medium text-on-primary" data-action="add-image"><ImagePlus aria-hidden="true" className="h-4 w-4" />{t('qbpv.add_image')}</button>
            <input ref={imageInput} type="file" accept="image/*" className="hidden" onChange={addImage} data-testid="qb-image-input" />
            <p className="col-span-2 text-xs text-content-muted">{t('qbpv.drag_hint')}</p>
            <div className="col-span-2 flex flex-col gap-1"><span className="font-semibold">{t('qbpv.box_format')}</span>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={!activeBox} onMouseDown={e => e.preventDefault()} onClick={() => format('bold')} className="rounded-token px-2 py-1 font-bold [border:1px_solid_var(--line)] disabled:opacity-50">B {t('qbpv.bold')}</button>
                <button type="button" disabled={!activeBox} onMouseDown={e => e.preventDefault()} onClick={() => format('underline')} className="rounded-token px-2 py-1 underline [border:1px_solid_var(--line)] disabled:opacity-50">U {t('qbpv.underline')}</button>
              </div>
              <div className="grid grid-cols-4 gap-2" role="group" aria-label={t('qbpv.align')} data-testid="qb-box-align">
                {ALIGNS.map(([a, Icon]) => {
                  const on = (boxes.find(b => b.id === activeBox)?.align ?? 'left') === a
                  return <button key={a} type="button" disabled={!activeBox} aria-pressed={on} aria-label={t(`qbpv.aligns.${a}`)} title={t(`qbpv.aligns.${a}`)} onMouseDown={e => e.preventDefault()}
                    onClick={() => patchBox(activeBox, { align: a })} className={`flex items-center justify-center rounded-token px-2 py-1 [border:1px_solid_var(--line)] disabled:opacity-50 ${on ? 'bg-primary-soft text-primary-fg' : ''}`}><Icon aria-hidden="true" className="h-4 w-4" /></button>
                })}
              </div></div>
            <label className="col-span-2 flex flex-col gap-1"><span className="font-semibold">{t('qbpv.wrap')}</span>
              <select className="rounded-token border px-2 py-1 disabled:opacity-50" name="wrap" disabled={!activeBox} value={activeWrap} onChange={e => setWrap(activeBox, e.target.value)}>
                {WRAPS.map(w => <option key={w} value={w}>{t(`qbpv.wraps.${w}`)}</option>)}
              </select></label>
            {boxes.length > 0 && <div className="col-span-2 flex flex-col gap-1"><span className="font-semibold">{t('qbpv.box_list')}</span>
              <ul className="flex flex-col gap-1" data-testid="qb-box-list">{boxes.map((b, i) => (
                <li key={b.id}><button type="button" onClick={() => setActiveBox(b.id)} className={`w-full truncate rounded-token px-2 py-1 text-start text-xs ${activeBox === b.id ? 'bg-primary-soft text-primary-fg' : 'bg-surface-muted'}`}>
                  {b.kind === 'image' ? t('qbpv.image') : t('qbpv.text_box')} {i + 1} · {t(`qbpv.wraps.${b.wrap ?? 'topBottom'}`)}</button></li>))}</ul></div>}
            <label className="col-span-2 flex flex-col gap-1"><span className="font-semibold">{t('qbpv.columns')}</span>
              <select className="rounded-token border px-2 py-1" value={o.columns} name="columns" onChange={e => setOpt({ columns: Number(e.target.value) })}>
                {[1, 2, 3].map(c => <option key={c} value={c}>{t(`qbpv.cols.${c}`)}</option>)}
              </select></label>
          </div>
        </Panel>
        <a href={`${base}/${id}`} className="text-sm text-primary-fg underline">{t('qbpv.back')}</a>
      </aside>
    </div>
  )
}

function Panel({ title, children }) {
  return <section className="flex flex-col gap-2 rounded-token bg-surface p-3 shadow-card [border:1px_solid_var(--line)]"><h3 className="text-sm font-semibold text-primary-fg">{title}</h3>{children}</section>
}

function Toggle({ checked, onChange, label, name }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} name={name} onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${checked ? 'bg-primary' : 'bg-surface-muted [border:1px_solid_var(--line)]'}`}>
      <span className={`inline-block h-5 w-5 rounded-full bg-surface shadow transition ${checked ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0.5 rtl:-translate-x-0.5'}`} />
    </button>
  )
}

function ToggleRow({ label, checked, onChange, name }) {
  return <div className="flex items-center justify-between gap-2 border-b border-line py-1.5 text-sm last:border-b-0"><span>{label}</span><Toggle checked={checked} onChange={onChange} label={label} name={name} /></div>
}

function Range({ label, min, max, step, value, shown, onChange }) {
  return (
    <label className="flex min-w-0 flex-col gap-1"><span className="font-semibold">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
      <span className="text-xs text-content-muted" dir="ltr">{shown}</span></label>
  )
}

// a text box or picture in the paper's flow: the grip drags it to another gap, the native corner handle resizes it
function PaperBox({ box, t, active, onFocus, onChange, onDelete, onGrab }) {
  const wrap = box.wrap ?? 'topBottom'
  const free = FREE.includes(wrap)
  const place = free ? { position: 'absolute', left: box.x ?? 0, top: box.y ?? 0, margin: 0 }
    : wrap === 'square' || wrap === 'tight' ? { float: box.side === 'end' ? 'inline-end' : 'inline-start', margin: wrap === 'tight' ? '0.15rem 0.5rem' : '0.5rem 1rem' }
    : wrap === 'inline' ? { display: 'inline-block', verticalAlign: 'middle' } : {}
  const ref = useRef(null)
  const body = useRef(null)
  useEffect(() => { if (body.current && box.kind === 'text') body.current.innerHTML = box.html ?? '' }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  const keepSize = () => { const el = ref.current; if (el) onChange({ width: el.offsetWidth, height: el.offsetHeight }) }
  return (
    <div ref={ref} className={`qb-box my-2 max-w-full overflow-hidden px-2 py-1 text-start [break-inside:avoid] [resize:both] ${free ? `qb-free qb-${wrap}` : 'relative'} ${wrap === 'behind' ? '' : 'bg-surface'} ${active ? 'ring-2 ring-primary-fg qb-active' : ''}`}
      style={{ width: box.width || undefined, height: box.height || undefined, ...place }} onMouseUp={keepSize} onPointerDown={onFocus} data-box={box.id} data-wrap={wrap}
      data-testid={box.kind === 'image' ? 'qb-image-box' : 'qb-text-box'} data-anchor={free ? 'free' : box.anchor}>
      <div className="qb-no-print mb-1 flex select-none items-center justify-between gap-2 text-xs text-content-muted">
        <span className="cursor-move touch-none px-1" onPointerDown={onGrab} aria-label={t('qbpv.drag')} data-action="drag-box">⋮⋮</span>
        <button type="button" onClick={onDelete} aria-label={t('common.delete')}><Trash2 aria-hidden="true" className="h-3 w-3" /></button>
      </div>
      {box.kind === 'image'
        ? <img src={box.src} alt={t('qbpv.image')} className="pointer-events-none h-full max-h-full w-full object-contain" />
        : <div ref={body} contentEditable suppressContentEditableWarning className="min-h-6 outline-none" dir="auto" style={{ textAlign: box.align ?? 'left' }} onFocus={onFocus} onInput={e => onChange({ html: e.currentTarget.innerHTML })} aria-label={t('qbpv.text_box')} />}
    </div>
  )
}

// this paper's own wording of a question: question, option texts, answer, explanation (which option is right stays as it is)
function QuestionEditor({ t, question, value, onSave, onCancel, onReset }) {
  const [v, setV] = useState(() => ({ question_text: value?.question_text ?? question.question_text ?? '', answer_text: value?.answer_text ?? question.answer_text ?? '',
    explanation_text: value?.explanation_text ?? question.explanation_text ?? '', options: (question.options ?? []).map((op, k) => value?.options?.[k] ?? op.content_text ?? '') }))
  const field = 'w-full rounded-token border px-2 py-1 text-sm'
  return (
    <div className="qb-no-print mb-4 flex flex-col gap-2 rounded-token bg-surface-muted p-2 [break-inside:avoid]" data-testid="qb-question-editor">
      <p className="text-xs text-content-muted">{t('qbpv.edit_note')}</p>
      <label className="flex flex-col gap-1 text-sm">{t('qbpv.f.question')}<textarea rows={3} className={field} dir="auto" name="question_text" value={v.question_text} onChange={e => setV({ ...v, question_text: e.target.value })} /></label>
      {v.options.map((text, k) => (
        <label key={k} className="flex flex-col gap-1 text-sm">{t('qbpv.f.option', { label: question.options[k]?.label ?? k + 1 })}
          <input className={field} dir="auto" name={`option_${k}`} value={text} onChange={e => setV({ ...v, options: v.options.map((x, j) => (j === k ? e.target.value : x)) })} /></label>
      ))}
      {question.answer_text != null && <label className="flex flex-col gap-1 text-sm">{t('qbpv.f.answer')}<textarea rows={2} className={field} dir="auto" name="answer_text" value={v.answer_text} onChange={e => setV({ ...v, answer_text: e.target.value })} /></label>}
      {question.explanation_text != null && <label className="flex flex-col gap-1 text-sm">{t('qbpv.f.explanation')}<textarea rows={2} className={field} dir="auto" name="explanation_text" value={v.explanation_text} onChange={e => setV({ ...v, explanation_text: e.target.value })} /></label>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onSave(v)} className="rounded-token bg-primary px-3 py-1 text-sm font-medium text-on-primary" data-action="save-edit">{t('qbpv.save_edit')}</button>
        <button type="button" onClick={onCancel} className="rounded-token px-3 py-1 text-sm [border:1px_solid_var(--line)]">{t('qbpv.cancel')}</button>
        {value && <button type="button" onClick={onReset} className="flex items-center gap-1 rounded-token px-3 py-1 text-sm [border:1px_solid_var(--line)]" data-action="reset-edit"><RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />{t('qbpv.reset_edit')}</button>}
      </div>
    </div>
  )
}
