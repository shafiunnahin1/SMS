import { findRegistrationMarkers, homographyFromMarkers, readBubbleRows } from './omrReader'

// D127 (3): one scanned page read with the form's own persisted geometry (the same numbers the printed sheet was drawn from).
// Nothing is decided here: an unreadable digit becomes "?", blanks and multiple marks keep their status, and the server keeps
// every sheet in review until a person approves it.

/** a numeric grid (roll, set): each column's ten bubbles give one digit; anything but exactly one mark is unreadable */
export function readDigits(imageData, homography, grid) {
  const columns = Array.from({ length: grid.digit_count }, (_, c) => grid.rows.map(row => row[c]))
  return columns.map(cells => {
    const [read] = readBubbleRows(imageData, homography, [cells])
    return read.status === 'marked' ? read.selected[0] : null
  })
}

/** the answer rows in question order (row n = the n-th MCQ, D127/D129) */
export function answerRows(geometry) {
  return geometry.answers.columns.flatMap(c => c.rows).sort((a, b) => a.question_index - b.question_index)
}

export function readSheet(imageData, settings, setSymbols = []) {
  const markers = findRegistrationMarkers(imageData)
  if (!markers.valid) return { ok: false, error: 'markers' }
  const g = settings.geometry
  const h = homographyFromMarkers(markers, imageData.width, imageData.height)
  const rollDigits = readDigits(imageData, h, g.roll)
  const setDigits = settings.info_boxes?.set?.visible === false ? [] : readDigits(imageData, h, g.set)
  const answers = readBubbleRows(imageData, h, answerRows(g).map(r => r.options))
    .map(a => ({ status: a.status, selected: a.selected }))
  return {
    ok: true,
    roll: rollDigits.map(d => (d === null ? '?' : String(d))).join(''),
    set_code: setDigits.length === 0 || setDigits.includes(null) ? null : setDigits.map(d => setSymbols[d] ?? String(d)).join(''),
    answers,
  }
}

export const MAX_BYTES = 10 * 1024 * 1024
export const MAX_SHEETS = 200

/** an image file -> ImageData (scaled so the long side is at most `max` px) */
export async function fileToImageData(file, max = 2000) {
  const bitmap = await createImageBitmap(file)
  return bitmapToImageData(bitmap, max)
}

export function bitmapToImageData(source, max = 2000) {
  const scale = Math.min(1, max / Math.max(source.width, source.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(source.width * scale)
  canvas.height = Math.round(source.height * scale)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return { imageData: ctx.getImageData(0, 0, canvas.width, canvas.height), canvas }
}

let pdfjs = null
const loadScript = (src) => new Promise((resolve, reject) => {
  const s = document.createElement('script')
  s.src = src
  s.onload = resolve
  s.onerror = reject
  document.head.appendChild(s)
})

/** D127: a PDF of scanned sheets, page by page, with the local pdf.js 3.11.174 copy (never an outside service) */
export async function pdfPages(file, onPage) {
  if (!pdfjs) {
    await loadScript('/vendor/pdfjs/pdf.min.js')
    pdfjs = window.pdfjsLib
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js'
  }
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
    await onPage(canvas, n)
  }
}

export const canvasToBlob = (canvas) => new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
