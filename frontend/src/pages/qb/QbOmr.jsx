import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Camera, Check, Download, Upload, X } from 'lucide-react'
import api from '../../api/axios'
import { useUiStore } from '../../store/uiStore'
import { usePrint } from '../../hooks/usePrint'
import PageHeader from '../../components/PageHeader'
import Card from '../../components/Card'
import Button from '../../components/Button'
import Loader from '../../components/Loader'
import Ltr from '../../components/bidi/Ltr'
import { EmptyState, ErrorState } from '../../components/StateViews'
import { Input, Select } from '../../components/FormField'
import Tabs from '../../ui/variants/Tabs'
import { multipart } from '../../features/students/formData'
import OmrDesigner from '../../features/qb/OmrDesigner'
import { MAX_BYTES, MAX_SHEETS, bitmapToImageData, canvasToBlob, heicToJpeg, isHeic, pdfPages, readSheet } from '../../features/qb/omrSheet'

// R2.1.6 (D127/D128/D129) /admin|teacher/question-bank/papers/:id/omr: qbank's OMR screens in its order - form settings, sheet
// print, scan, batch review, results. Sheets are read in this browser with the form's own geometry; photos and PDFs never go to
// another service; every sheet waits for a person's review before it counts; marks never reach exam results here (R2.1.7).
const LATIN = 'ABCDEFGHIJ'.split('')
const BANGLA = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ', 'ঝ', 'ঞ']

export default function QbOmr() {
  const { t } = useTranslation()
  const { id } = useParams()
  const [tab, setTab] = useState('form')
  const form = useQuery({ queryKey: ['qb-omr', id], retry: false,
    queryFn: () => api.get(`/question-bank/papers/${id}/omr-form`).then(r => r.data.data).catch(e => { if (e.response?.status === 404) return null; throw e }) })
  if (form.isPending) return <Loader type="page" />
  if (form.isError) return <ErrorState onRetry={form.refetch} message={form.error.response?.data?.message} />
  const ready = !!form.data?.locked_at
  return (
    <div className="flex flex-col gap-4" data-testid="qb-omr">
      <PageHeader title={t('qbomr.title')} />
      <Tabs items={['form', 'scan', 'review', 'results'].map(k => ({ key: k, label: t(`qbomr.tabs.${k}`) }))} value={tab} onChange={setTab} label={t('qbomr.title')} />
      {tab === 'form' && <OmrDesigner id={id} form={form.data} onSaved={form.refetch} />}
      {tab !== 'form' && !ready && <EmptyState title={t('qbomr.generate_first')} />}
      {tab === 'scan' && ready && <ScanTab id={id} form={form.data} />}
      {tab === 'review' && ready && <ReviewTab id={id} form={form.data} />}
      {tab === 'results' && ready && <ResultsTab id={id} />}
    </div>
  )
}

function ScanTab({ id, form }) {
  const { t } = useTranslation()
  const [sheets, setSheets] = useState([])
  const [busy, setBusy] = useState(false)
  const s = form.settings
  const symbols = /^[A-Z]/.test(form.set_codes?.[0] ?? 'A') ? LATIN : BANGLA
  const blank = () => Array.from({ length: s.question_count }, () => ({ status: 'blank', selected: [] }))
  const toast = (m, k) => useUiStore.getState().addToast(m, k)
  const push = (sheet) => setSheets(x => (x.length >= MAX_SHEETS ? x : [...x, sheet]))
  const read = (imageData, name, blob, source) => {
    const r = readSheet(imageData, s, symbols)
    // an unreadable page is kept with every answer blank, so a person reads it from the image (never silently dropped)
    push({ key: `${Date.now()}-${Math.random()}`, name, blob, source, quality: r.quality, error: r.ok ? null : r.error, roll: r.ok ? r.roll : null, set_code: r.ok ? r.set_code : null, roll_uncertain: !!r.roll_uncertain, set_uncertain: !!r.set_uncertain, student_omr_id: r.ok ? (r.student_omr_id ?? null) : null, student_omr_id_uncertain: !!r.student_omr_id_uncertain, answers: r.ok ? r.answers : blank(), result: null })
  }
  const add = async (files, source) => {
    setBusy(true)
    try {
      for (const file of files) {
        if (sheets.length >= MAX_SHEETS) { toast(t('qbomr.too_many', { n: MAX_SHEETS }), 'error'); break }
        if (isHeic(file)) {                                         // D130: converted here, then read like any photo
          if (file.size > MAX_BYTES) { toast(t('qbomr.too_big', { name: file.name }), 'error'); continue }
          let jpeg
          try { jpeg = await heicToJpeg(file) } catch { toast(t('qbomr.heic'), 'error'); continue }
          read(bitmapToImageData(await createImageBitmap(jpeg)).imageData, file.name, new File([jpeg], file.name.replace(/\.hei[cf]$/i, '.jpg'), { type: 'image/jpeg' }), source)
          continue
        }
        if (file.type === 'application/pdf') {
          await pdfPages(file, async (canvas, n) => { const blob = await canvasToBlob(canvas); read(bitmapToImageData(canvas).imageData, `${file.name} #${n}`, blob, source) })
          continue
        }
        if (file.size > MAX_BYTES) { toast(t('qbomr.too_big', { name: file.name }), 'error'); continue }
        const bitmap = await createImageBitmap(file)
        read(bitmapToImageData(bitmap).imageData, file.name, file, source)
      }
    } catch { toast(t('qbomr.unreadable_file'), 'error') } finally { setBusy(false) }
  }
  const send = async () => {
    setBusy(true)
    const pending = sheets.filter(x => x.result?.status !== 'saved')
    for (let k = 0; k < pending.length; k += 20) {                 // per-sheet results: a failed sheet never discards the others
      const part = pending.slice(k, k + 20)
      const fd = new FormData()
      part.forEach((x, i) => {
        fd.append(`scans[${i}][client_id]`, x.key)
        fd.append(`scans[${i}][source]`, x.source)
        if (x.roll) fd.append(`scans[${i}][roll]`, x.roll)
        if (x.set_code) fd.append(`scans[${i}][set_code]`, x.set_code)
        if (x.roll_uncertain) fd.append(`scans[${i}][roll_uncertain]`, '1')   // D131: offered, a person confirms
        if (x.set_uncertain) fd.append(`scans[${i}][set_uncertain]`, '1')
        if (x.student_omr_id) fd.append(`scans[${i}][student_omr_id]`, x.student_omr_id)   // D159 (4): matched by ID first on the server
        if (x.student_omr_id_uncertain) fd.append(`scans[${i}][student_omr_id_uncertain]`, '1')
        x.answers.forEach((a, q) => {
          if (a.selected.length === 0) fd.append(`scans[${i}][answers][${q}][selected]`, '')
          a.selected.forEach((o, j) => fd.append(`scans[${i}][answers][${q}][selected][${j}]`, String(o)))
          if (a.status === 'uncertain') fd.append(`scans[${i}][answers][${q}][uncertain]`, '1')   // D131: the two rules disagreed
        })
        fd.append(`scans[${i}][image]`, x.blob, x.blob.name ?? `${x.key}.jpg`)
      })
      try {
        const { data } = await api.post(`/question-bank/papers/${id}/omr-form/scans`, fd, multipart)   // the client's default is JSON
        const byKey = Object.fromEntries(data.data.results.map(r => [r.client_id, r]))
        setSheets(all => all.map(x => (byKey[x.key] ? { ...x, result: byKey[x.key] } : x)))
      } catch (e) {
        const msg = e.response?.data?.message ?? t('common.error')
        setSheets(all => all.map(x => (part.some(p => p.key === x.key) ? { ...x, result: { status: 'failed', errors: { batch: [msg] } } } : x)))
      }
    }
    setBusy(false)
  }
  const saved = sheets.filter(x => x.result?.status === 'saved').length
  return (
    <Card className="flex flex-col gap-3" data-testid="omr-scan">
      <p className="text-sm text-content-muted">{t('qbomr.scan_hint', { n: MAX_SHEETS })}</p>
      <p className="text-sm text-content-muted">{t('qbomr.photo_tips')}</p>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-token border px-3 py-2 text-sm"><Upload aria-hidden="true" className="h-4 w-4" />{t('qbomr.upload')}
          <input type="file" className="sr-only" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf" name="sheets" onChange={e => { add([...e.target.files], 'upload'); e.target.value = '' }} /></label>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-token border px-3 py-2 text-sm"><Camera aria-hidden="true" className="h-4 w-4" />{t('qbomr.camera')}
          <input type="file" className="sr-only" accept="image/*" capture="environment" name="camera" onChange={e => { add([...e.target.files], 'camera'); e.target.value = '' }} /></label>
        <Button onClick={send} loading={busy} disabled={sheets.length === 0 || saved === sheets.length} data-action="send">{t('qbomr.send', { n: sheets.length - saved })}</Button>
      </div>
      {busy && <Loader />}
      {sheets.length === 0 ? <EmptyState title={t('qbomr.no_sheets')} /> : (
        <ul className="flex flex-col divide-y text-sm">
          {sheets.map(x => (
            <li key={x.key} className="flex flex-wrap items-center gap-3 py-2" data-sheet-status={x.result?.status ?? 'local'}>
              <span className="flex-1 min-w-40" dir="auto">{x.name}</span>
              <span>{t('qbomr.roll')}: <Ltr>{x.roll ?? '—'}</Ltr></span>
              <span>{t('qbomr.set')}: {x.set_code ?? '—'}</span>
              <span>{t('qbomr.flagged', { n: x.answers.filter(a => a.status !== 'marked').length })}</span>
              {x.error && <span className="text-red-600">{t('qbomr.markers')}</span>}
              {(x.quality?.dark || x.quality?.blurry) && <span className="text-red-600" data-quality="low">{t(x.quality.dark ? 'qbomr.retake_dark' : 'qbomr.retake_blurry')}</span>}
              {x.result?.status === 'saved' && <span className="text-green-700">{t('qbomr.saved')}</span>}
              {x.result?.status === 'failed' && <span className="text-red-600">{Object.values(x.result.errors ?? {}).flat()[0]}</span>}
              {x.result?.status !== 'saved' && <Button variant="ghost" aria-label={t('common.delete')} onClick={() => setSheets(all => all.filter(y => y.key !== x.key))}><X aria-hidden="true" className="h-4 w-4" /></Button>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function ReviewTab({ id, form }) {
  const { t } = useTranslation()
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState(null)
  const list = useQuery({ queryKey: ['qb-omr-scans', id, page], queryFn: () => api.get(`/question-bank/papers/${id}/omr-form/scans`, { params: { page } }).then(r => r.data) })
  if (list.isPending) return <Loader />
  if (list.isError) return <ErrorState onRetry={list.refetch} />
  const rows = list.data.data
  const last = list.data.meta?.last_page ?? 1
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="omr-review">
      <Card className="flex flex-col gap-2">
        {rows.length === 0 ? <EmptyState title={t('qbomr.no_scans')} /> : (
          <ul className="flex flex-col divide-y text-sm">
            {rows.map(r => (
              <li key={r.id}>
                <button type="button" className={`flex w-full flex-wrap items-center gap-2 px-2 py-2 text-start ${open === r.id ? 'bg-primary-soft' : ''}`} onClick={() => setOpen(r.id)} data-scan={r.id} data-status={r.status}>
                  <Ltr>#{r.id}</Ltr><span>{t('qbomr.roll')}: <Ltr>{r.roll ?? '—'}</Ltr></span><span dir="auto">{r.student_name ?? '—'}</span>
                  <span className="ms-auto">{t(`qbomr.status.${r.status}`)}</span>
                  {(r.comparison?.reason_codes ?? []).map(c => <span key={c} className="rounded-token bg-surface-muted px-1 text-xs">{t(`qbomr.reason.${c}`)}</span>)}
                </button>
              </li>
            ))}
          </ul>
        )}
        {last > 1 && (
          <div className="flex items-center gap-2 text-sm">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('common.previous')}</Button>
            <Ltr>{page} / {last}</Ltr>
            <Button variant="secondary" disabled={page >= last} onClick={() => setPage(p => p + 1)}>{t('common.next')}</Button>
          </div>
        )}
      </Card>
      {open && <ScanDetail key={open} scan={rows.find(r => r.id === open)} form={form} onDone={() => list.refetch()} />}
    </div>
  )
}

function ScanDetail({ scan, form, onDone }) {
  const { t } = useTranslation()
  const [img, setImg] = useState(null)
  const [v, setV] = useState({ roll: scan.roll ?? '', set_code: scan.set_code ?? '', student_id: scan.matched_student_id ? String(scan.matched_student_id) : '', answers: scan.answers, duplicate_decision: scan.comparison?.duplicate_decision ?? '' })
  const labels = form.settings.option_labels ?? []
  const open = scan.status === 'needs_review'
  useEffect(() => {
    let href = null
    if (scan.image_available) api.get(`/question-bank/omr-scans/${scan.id}/image`, { responseType: 'blob' }).then(r => { href = URL.createObjectURL(r.data); setImg(href) }).catch(() => {})
    return () => { if (href) URL.revokeObjectURL(href) }
  }, [scan.id, scan.image_available])
  const toast = (m, k) => useUiStore.getState().addToast(m, k)
  const fail = (e) => toast(e.response?.data?.message ?? t('common.error'), 'error')
  const toggle = (q, o) => setV(x => ({ ...x, answers: x.answers.map((a, k) => (k !== q ? a : { ...a, selected: a.selected.includes(o) ? a.selected.filter(y => y !== o) : [...a.selected, o].sort(), confirmed: true, changed: true })) }))
  const confirm = (q, c) => setV(x => ({ ...x, answers: x.answers.map((a, k) => (k === q ? { ...a, confirmed: c, changed: true } : a)) }))
  const save = () => {
    const body = { roll: v.roll || null, student_id: v.student_id ? Number(v.student_id) : null,
      answers: Object.fromEntries(v.answers.map((a, k) => [k + 1, a]).filter(([, a]) => a.changed).map(([n, a]) => [n, { selected: a.selected, confirmed: !!a.confirmed }])) }
    if (v.set_code === '__main') body.set_resolution = 'main'; else body.set_code = v.set_code || null
    if (v.duplicate_decision) body.duplicate_decision = v.duplicate_decision
    return api.put(`/question-bank/omr-scans/${scan.id}`, body).then(() => { toast(t('common.saved')); onDone() }).catch(fail)
  }
  const act = (what) => api.post(`/question-bank/omr-scans/${scan.id}/${what}`).then(() => { toast(t('common.saved')); onDone() }).catch(fail)
  const reasons = scan.comparison?.reason_codes ?? []
  return (
    <Card className="flex flex-col gap-3" data-testid="omr-scan-detail">
      {img ? <img src={img} alt={t('qbomr.sheet_image')} className="max-h-96 w-full object-contain" /> : <p className="text-sm text-content-muted">{t('qbomr.no_image')}</p>}
      {reasons.length > 0 && <ul className="flex flex-wrap gap-1 text-xs" role="alert">{reasons.map(c => <li key={c} className="rounded-token bg-surface-muted px-1">{t(`qbomr.reason.${c}`)}</li>)}</ul>}
      <fieldset disabled={!open} className="grid gap-2 sm:grid-cols-2">
        <Input label={t('qbomr.roll')} ltr name="roll" value={v.roll} onChange={e => setV({ ...v, roll: e.target.value })} />
        <Select label={t('qbomr.set')} name="set_code" value={v.set_code} placeholder="—" onChange={e => setV({ ...v, set_code: e.target.value })}
          options={[...(form.set_codes ?? []).map(c => ({ value: c, label: c })), { value: '__main', label: t('qbomr.use_main') }]} />
        <Input label={t('qbomr.student_id')} ltr inputMode="numeric" name="student_id" value={v.student_id} hint={scan.student_name ?? ''} onChange={e => setV({ ...v, student_id: e.target.value })} />
        {reasons.includes('duplicate_roll') || v.duplicate_decision ? (
          <Select label={t('qbomr.duplicate')} name="duplicate_decision" value={v.duplicate_decision} placeholder="—" onChange={e => setV({ ...v, duplicate_decision: e.target.value })}
            options={['update', 'keep_both'].map(x => ({ value: x, label: t(`qbomr.dup.${x}`) }))} />
        ) : null}
      </fieldset>
      <ol className="grid gap-1 text-sm sm:grid-cols-2">
        {v.answers.map((a, q) => (
          <li key={q} className="flex flex-wrap items-center gap-1" data-question={q + 1} data-answer-status={a.status}>
            <Ltr className="w-8 font-medium">{q + 1}.</Ltr>
            {labels.map((l, o) => (
              <button key={o} type="button" disabled={!open} aria-pressed={a.selected.includes(o)} onClick={() => toggle(q, o)}
                className={`h-7 w-7 rounded-full border text-xs ${a.selected.includes(o) ? 'bg-primary text-on-primary' : ''}`}>{l}</button>
            ))}
            {a.status !== 'marked' && !a.changed && <span className="text-xs text-red-600">{t(`qbomr.answer.${a.status}`)}</span>}
            {(a.status !== 'marked' || a.changed) && (
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" disabled={!open} checked={!!a.confirmed} onChange={e => confirm(q, e.target.checked)} />{t('qbomr.confirm')}</label>
            )}
          </li>
        ))}
      </ol>
      {scan.status === 'graded' && <p className="text-sm">{t('qbomr.graded', { correct: scan.correct_count, marks: scan.obtained_marks })}</p>}
      {open && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={save} data-action="save-scan">{t('common.save')}</Button>
          <Button onClick={() => act('approve')} disabled={reasons.length > 0} data-action="approve"><Check aria-hidden="true" className="h-4 w-4" />{t('qbomr.approve')}</Button>
          <Button variant="secondary" onClick={() => act('cancel')} data-action="cancel-scan"><X aria-hidden="true" className="h-4 w-4" />{t('qbomr.cancel')}</Button>
        </div>
      )}
    </Card>
  )
}

function ResultsTab({ id }) {
  const { t } = useTranslation()
  const { download, loading } = usePrint()
  const [page, setPage] = useState(1)
  // every graded sheet, 50 a page (a national quiz may have thousands); the CSV always holds all of them
  const list = useQuery({ queryKey: ['qb-omr-results', id, page], queryFn: () => api.get(`/question-bank/papers/${id}/omr-form/scans`, { params: { status: 'graded', page } }).then(r => r.data) })
  if (list.isPending) return <Loader />
  if (list.isError) return <ErrorState onRetry={list.refetch} />
  const graded = list.data.data
  const last = list.data.meta?.last_page ?? 1
  return (
    <Card className="flex flex-col gap-3" data-testid="omr-results">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" loading={loading} onClick={() => download(`/question-bank/papers/${id}/omr-form/results.csv`, `omr-results-${id}.csv`)} data-action="csv"><Download aria-hidden="true" className="h-4 w-4" />{t('qbomr.csv')}</Button>
        <span className="text-sm text-content-muted" data-total={list.data.meta?.total ?? graded.length}>{t('qbomr.total_graded', { n: list.data.meta?.total ?? graded.length })}</span>
      </div>
      {graded.length === 0 ? <EmptyState title={t('qbomr.no_results')} /> : (
        <table className="w-full text-sm">
          <thead><tr><th className="text-start">{t('qbomr.roll')}</th><th className="text-start">{t('qbomr.student')}</th><th className="text-start">{t('qbomr.set')}</th><th className="text-start">{t('qbomr.correct')}</th><th className="text-start">{t('qbomr.marks')}</th></tr></thead>
          <tbody>{graded.map(r => <tr key={r.id}><td><Ltr>{r.roll}</Ltr></td><td dir="auto">{r.student_name ?? '—'}</td><td>{r.comparison?.graded_set ?? r.set_code}</td><td><Ltr>{r.correct_count}</Ltr></td><td><Ltr>{r.obtained_marks}</Ltr></td></tr>)}</tbody>
        </table>
      )}
      {last > 1 && (
        <div className="flex items-center gap-2 text-sm">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t('common.previous')}</Button>
          <Ltr>{page} / {last}</Ltr>
          <Button variant="secondary" disabled={page >= last} onClick={() => setPage(p => p + 1)}>{t('common.next')}</Button>
        </div>
      )}
    </Card>
  )
}
