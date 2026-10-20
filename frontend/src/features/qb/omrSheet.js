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

/**
 * Make a phone photo or a weak scan easier to read without changing qbank's marking rules: uneven light and shadows are
 * flattened (each pixel divided by the local paper brightness), the contrast is stretched, and a soft photo is sharpened.
 * A small photo is enlarged first so a bubble keeps enough pixels. Returns a new image; the original is never changed.
 */
export function enhance(imageData, { minSide = 1400 } = {}) {
  let { width, height, data } = imageData
  const scale = Math.max(1, minSide / Math.min(width, height))
  let gray = new Float32Array(width * height)
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) gray[i] = (data[p] * 0.2126) + (data[p + 1] * 0.7152) + (data[p + 2] * 0.0722)
  if (scale > 1) {                                                 // bilinear enlargement of a low-resolution photo
    const w2 = Math.round(width * scale)
    const h2 = Math.round(height * scale)
    const out = new Float32Array(w2 * h2)
    for (let y = 0; y < h2; y++) {
      const sy = Math.min(height - 1, y / scale)
      const y0 = Math.floor(sy)
      const y1 = Math.min(height - 1, y0 + 1)
      const fy = sy - y0
      for (let x = 0; x < w2; x++) {
        const sx = Math.min(width - 1, x / scale)
        const x0 = Math.floor(sx)
        const x1 = Math.min(width - 1, x0 + 1)
        const fx = sx - x0
        out[y * w2 + x] = (gray[y0 * width + x0] * (1 - fx) + gray[y0 * width + x1] * fx) * (1 - fy) + (gray[y1 * width + x0] * (1 - fx) + gray[y1 * width + x1] * fx) * fy
      }
    }
    gray = out
    width = w2
    height = h2
  }
  // the paper's brightness around each pixel: the brightest value in coarse tiles, smoothed (ink and bubbles are darker than paper)
  const tile = Math.max(8, Math.round(Math.min(width, height) / 40))
  const tw = Math.ceil(width / tile)
  const th = Math.ceil(height / tile)
  const bg = new Float32Array(tw * th)
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    const vals = []
    for (let y = ty * tile; y < Math.min(height, (ty + 1) * tile); y += 2) for (let x = tx * tile; x < Math.min(width, (tx + 1) * tile); x += 2) vals.push(gray[y * width + x])
    vals.sort((a, b) => a - b)
    bg[ty * tw + tx] = Math.max(1, vals[Math.floor(vals.length * 0.9)] ?? 255)
  }
  const smooth = new Float32Array(bg.length)
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    let sum = 0
    let n = 0
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const yy = ty + dy
      const xx = tx + dx
      if (yy < 0 || xx < 0 || yy >= th || xx >= tw) continue
      sum += bg[yy * tw + xx]
      n++
    }
    smooth[ty * tw + tx] = sum / n
  }
  const flat = new Float32Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const b = smooth[Math.min(th - 1, Math.floor(y / tile)) * tw + Math.min(tw - 1, Math.floor(x / tile))]
    flat[y * width + x] = Math.min(255, (gray[y * width + x] / b) * 245)
  }
  // contrast stretch between the 1st and 99th percentiles
  const sample = []
  for (let i = 0; i < flat.length; i += 7) sample.push(flat[i])
  sample.sort((a, b) => a - b)
  let lo = sample[Math.floor(sample.length * 0.01)] ?? 0
  let hi = sample[Math.floor(sample.length * 0.99)] ?? 255
  if (hi - lo < 60) { lo = 0; hi = 255 }                           // a nearly uniform page: no stretch (it would invent marks)
  // light unsharp mask (3x3 mean) so a soft or slightly out-of-focus photo keeps crisp bubble edges
  const out = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let sum = 0
    let n = 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = y + dy
      const xx = x + dx
      if (yy < 0 || xx < 0 || yy >= height || xx >= width) continue
      sum += flat[yy * width + xx]
      n++
    }
    const v = flat[y * width + x]
    const sharp = v + (v - sum / n) * 0.6
    const g = Math.round(((sharp - lo) / (hi - lo)) * 255)
    const p = (y * width + x) * 4
    out[p] = out[p + 1] = out[p + 2] = g
    out[p + 3] = 255
  }
  return { width, height, data: out }
}

/** how readable a photo looks: mean brightness and sharpness (variance of the Laplacian on a sample grid) */
export function quality(imageData) {
  const { width, height, data } = imageData
  const lum = (x, y) => { const p = (y * width + x) * 4; return data[p] * 0.2126 + data[p + 1] * 0.7152 + data[p + 2] * 0.0722 }
  const step = Math.max(1, Math.round(Math.min(width, height) / 300))
  let sum = 0
  let sum2 = 0
  let bright = 0
  let n = 0
  for (let y = step; y < height - step; y += step) for (let x = step; x < width - step; x += step) {
    const l = 4 * lum(x, y) - lum(x - step, y) - lum(x + step, y) - lum(x, y - step) - lum(x, y + step)
    sum += l
    sum2 += l * l
    bright += lum(x, y)
    n++
  }
  const sharpness = n ? (sum2 / n) - (sum / n) ** 2 : 0
  const brightness = n ? bright / n : 0
  return { sharpness, brightness, dark: brightness < 90, blurry: sharpness < 60 }
}

/** a quarter turn, for a portrait sheet photographed sideways */
export function rotate90(imageData, clockwise = true) {
  const { width, height, data } = imageData
  const out = new Uint8ClampedArray(data.length)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const nx = clockwise ? height - 1 - y : y
    const ny = clockwise ? x : width - 1 - x
    const s = (y * width + x) * 4
    const d = (ny * height + nx) * 4
    out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = data[s + 3]
  }
  return { width: height, height: width, data: out }
}

/** centre a found corner mark on the centroid of its dark pixels (the coarse search moves in 1% steps; a tilted photo needs better) */
function refineMarkers(imageData, markers) {
  const points = {}
  const half = Math.max(6, Math.round(Math.min(imageData.width, imageData.height) * 0.03))
  for (const [corner, [xr, yr]] of Object.entries(markers.points)) {
    const cx = Math.round(xr * imageData.width)
    const cy = Math.round(yr * imageData.height)
    let sx = 0
    let sy = 0
    let n = 0
    for (let y = Math.max(0, cy - half); y <= Math.min(imageData.height - 1, cy + half); y++) {
      for (let x = Math.max(0, cx - half); x <= Math.min(imageData.width - 1, cx + half); x++) {
        const p = (y * imageData.width + x) * 4
        if ((imageData.data[p] * 0.2126) + (imageData.data[p + 1] * 0.7152) + (imageData.data[p + 2] * 0.0722) < 110) { sx += x; sy += y; n++ }
      }
    }
    // only trust the centroid when the dark blob is mark-sized and near the coarse point
    const ok = n > 20 && Math.abs(sx / n - cx) < half * 0.6 && Math.abs(sy / n - cy) < half * 0.6
    points[corner] = ok ? [(sx / n) / imageData.width, (sy / n) / imageData.height] : [xr, yr]
  }
  return { ...markers, points }
}

const rotate180 = (img) => rotate90(rotate90(img, true), true)

/** every way the page may lie whose four corner marks are found: as it is, enhanced, upside down, a quarter turn either way */
function candidates(imageData) {
  const base = enhance(imageData)
  const ways = [() => imageData, () => base, () => rotate180(base)]
  if (imageData.width > imageData.height) ways.push(() => enhance(rotate90(imageData, true)), () => enhance(rotate90(imageData, false)))
  const found = []
  for (const make of ways) {
    const img = make()
    const markers = findRegistrationMarkers(img)
    if (markers.valid) found.push({ img: img === imageData ? base : img, markers: refineMarkers(img === imageData ? base : img, markers) })
  }
  return found
}

function readWith(img, markers, settings, setSymbols) {
  const g = settings.geometry
  const h = homographyFromMarkers(markers, img.width, img.height)
  const rollDigits = readDigits(img, h, g.roll)
  const setDigits = settings.info_boxes?.set?.visible === false ? [] : readDigits(img, h, g.set)
  const answers = readBubbleRows(img, h, answerRows(g).map(r => r.options)).map(a => ({ status: a.status, selected: a.selected }))
  // which way up: the printed form code matches (when the geometry has it), else the reading with the most clean single marks
  let fit = [...rollDigits, ...setDigits].filter(d => d !== null).length + answers.filter(a => a.status === 'marked').length
  if (g.code?.bits?.length) {
    const bits = readBubbleRows(img, h, g.code.bits.map(b => [b]))
    fit += 100 * bits.filter((b, i) => (b.status === 'marked') === (g.code.value[i] === '1')).length
  }
  return {
    fit,
    sheet: {
      ok: true,
      roll: rollDigits.map(d => (d === null ? '?' : String(d))).join(''),
      set_code: setDigits.length === 0 || setDigits.includes(null) ? null : setDigits.map(d => setSymbols[d] ?? String(d)).join(''),
      answers,
    },
  }
}

/**
 * D127 (3): one page read with the form's geometry. Photos are enhanced first (uneven light, dim, soft or small: see enhance),
 * a turned or perspective photo is straightened by the four corner marks, and a sideways or upside-down page is tried each way.
 * The bubbles are judged by qbank's thresholds unchanged; `quality` tells the scanner when a retake would help.
 */
export function readSheet(imageData, settings, setSymbols = []) {
  const quality_ = quality(imageData)
  const found = candidates(imageData)
  if (found.length === 0) return { ok: false, error: 'markers', quality: quality_ }
  const best = found.map(f => readWith(f.img, f.markers, settings, setSymbols)).sort((x, y) => y.fit - x.fit)[0]
  return { ...best.sheet, quality: quality_ }
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

let heic = null
export const isHeic = (file) => /\.hei[cf]$/i.test(file.name) || /hei[cf]/i.test(file.type)

/** D130: a HEIC/HEIF phone photo -> JPEG in this browser, with the local heic2any 0.0.4 copy (never an outside service) */
export async function heicToJpeg(file) {
  if (!heic) {
    await loadScript('/vendor/heic2any/heic2any.min.js')
    heic = window.heic2any
  }
  const out = await heic({ blob: file, toType: 'image/jpeg', quality: 0.92 })
  return Array.isArray(out) ? out[0] : out
}

export const canvasToBlob = (canvas) => new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
