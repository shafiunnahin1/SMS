import { classifyBubbleScores, findRegistrationMarkers, homographyFromMarkers, markerTargets, scoreBubble } from './omrReader'

// D127 (3): one scanned page read with the form's own persisted geometry (the same numbers the printed sheet was drawn from).
// Nothing is decided here: an unreadable digit becomes "?", blanks and multiple marks keep their status, and the server keeps
// every sheet in review until a person approves it.

// D132 (amends D131's fixed numbers): one mark threshold per photo - Otsu over all of that sheet's bubbles (roll, set, answers),
// clamped to 0.15-0.85 - because a light pen mark on a clean photo (0.45-0.65) and an empty bubble on a screen photo (0.4-0.6)
// overlap no fixed number. A row with a score within UNSURE of the threshold, or where qbank's rule reads it differently, is
// "uncertain": it goes to a person and is never scored silently.
export const UNSURE = 0.06

export function pageThreshold(scores) {
  const vals = scores.map(Number).filter(Number.isFinite)
  let best = -1
  let t = 0.5
  for (let c = 0.05; c < 0.951; c += 0.01) {
    let na = 0, sa = 0, nb = 0, sb = 0
    for (const v of vals) { if (v < c) { na++; sa += v } else { nb++; sb += v } }
    if (!na || !nb) continue
    const between = na * nb * ((sa / na) - (sb / nb)) ** 2
    if (between > best) { best = between; t = c }
  }
  return Math.min(0.85, Math.max(0.15, t))
}

/** one row of bubbles against the page threshold, cross-checked with qbank's own rule */
export function judgeRow(scores, threshold) {
  const selected = scores.map((v, i) => [v, i]).filter(([v]) => v >= threshold).map(([, i]) => i)
  const qbank = classifyBubbleScores(scores).selected
  const agree = selected.length === qbank.length && selected.every((v, i) => v === qbank[i])
  const near = scores.some(v => Math.abs(v - threshold) < UNSURE)
  const status = !agree || near ? 'uncertain' : selected.length === 0 ? 'blank' : selected.length === 1 ? 'marked' : 'ambiguous'
  return { status, selected, qbank }
}

const rowScores = (imageData, homography, cells) => cells.map(cell => scoreBubble(imageData, homography, cell.bubble ?? cell))

/**
 * a numeric grid (roll, set) from its columns' scores: one digit per column (null unless exactly one mark). `uncertain` is true when
 * any column is uncertain - the digits are still offered, but a person must confirm them (D131).
 */
export function digitsFrom(columns, threshold) {
  let uncertain = false
  const digits = columns.map(scores => {
    const read = judgeRow(scores, threshold)
    if (read.status === 'uncertain') uncertain = true
    return read.selected.length === 1 ? read.selected[0] : null
  })
  return Object.assign(digits, { uncertain })
}

/** the code bits' correlation with the printed form code: the way up of the page (D132) */
export function codeMatch(bitScores, value) {
  const exp = value.split('').map(Number)
  const mb = bitScores.reduce((a, b) => a + b, 0) / bitScores.length
  const me = exp.reduce((a, b) => a + b, 0) / exp.length
  let num = 0, da = 0, db = 0
  bitScores.forEach((v, i) => { num += (v - mb) * (exp[i] - me); da += (v - mb) ** 2; db += (exp[i] - me) ** 2 })
  return da && db ? num / Math.sqrt(da * db) : 0
}

/** a whole sheet from its bubble scores (separated from the image so real photos' measurements can be kept as tests) */
export function judgeSheet({ roll, set, answers, studentId = [] }, setSymbols = []) {
  const threshold = pageThreshold([...roll.flat(), ...set.flat(), ...studentId.flat(), ...answers.flat()])
  const rollDigits = digitsFrom(roll, threshold)
  const setDigits = digitsFrom(set, threshold)
  const idDigits = digitsFrom(studentId, threshold)          // D159 (4): the 10-digit student ID box ('?' = unreadable digit)
  return {
    ...(studentId.length ? { student_omr_id: idDigits.map(d => (d === null ? '?' : String(d))).join(''), student_omr_id_uncertain: idDigits.uncertain } : {}),
    threshold,
    roll: rollDigits.map(d => (d === null ? '?' : String(d))).join(''),
    set_code: setDigits.length === 0 || setDigits.includes(null) ? null : setDigits.map(d => setSymbols[d] ?? String(d)).join(''),
    roll_uncertain: rollDigits.uncertain,
    set_uncertain: setDigits.uncertain,
    answers: answers.map(r => judgeRow(r, threshold)).map(a => ({ status: a.status, selected: a.selected })),
  }
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
export function refineMarkers(imageData, markers) {
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

/**
 * The sheet often fills only part of a photo (a desk, a screen, a hand around it). Find the bright paper - the longest run of rows
 * and of columns that are mostly brighter than Otsu's threshold - and cut the photo to it with a small margin, so the corner marks
 * are looked for on the page and not on dark things beside it. Returns null when the paper already fills the photo.
 */
export function cropToPaper(imageData) {
  const { width, height, data } = imageData
  const lum = (x, y) => { const p = (y * width + x) * 4; return data[p] * 0.2126 + data[p + 1] * 0.7152 + data[p + 2] * 0.0722 }
  const hist = new Array(256).fill(0)
  const step = Math.max(1, Math.round(Math.min(width, height) / 400))
  for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) hist[Math.min(255, Math.round(lum(x, y)))]++
  const total = hist.reduce((a, b) => a + b, 0)
  let sumAll = 0
  hist.forEach((n, v) => { sumAll += n * v })
  let wB = 0
  let sumB = 0
  let best = 0
  let threshold = 128
  for (let v = 0; v < 256; v++) {                                  // Otsu
    wB += hist[v]
    if (!wB || wB === total) continue
    sumB += v * hist[v]
    const mB = sumB / wB
    const mF = (sumAll - sumB) / (total - wB)
    const between = wB * (total - wB) * (mB - mF) ** 2
    if (between > best) { best = between; threshold = v }
  }
  const longestRun = (flags) => {
    let start = -1
    let run = [0, -1]
    flags.forEach((on, i) => {
      if (on && start < 0) start = i
      if ((!on || i === flags.length - 1) && start >= 0) {
        const end = on ? i : i - 1
        if (end - start > run[1] - run[0]) run = [start, end]
        start = -1
      }
    })
    return run
  }
  const rowFlags = []
  for (let y = 0; y < height; y += step) {
    let bright = 0
    let n = 0
    for (let x = 0; x < width; x += step) { if (lum(x, y) > threshold) bright++; n++ }
    rowFlags.push(bright / n > 0.35)
  }
  const [r0, r1] = longestRun(rowFlags).map(i => i * step)
  const colFlags = []
  for (let x = 0; x < width; x += step) {
    let bright = 0
    let n = 0
    for (let y = r0; y <= r1; y += step) { if (lum(x, y) > threshold) bright++; n++ }
    colFlags.push(n > 0 && bright / n > 0.5)
  }
  const [c0, c1] = longestRun(colFlags).map(i => i * step)
  const w = c1 - c0
  const h = r1 - r0
  if (w < width * 0.2 || h < height * 0.2 || (w > width * 0.92 && h > height * 0.92)) return null
  const mx = Math.round(w * 0.01)
  const my = Math.round(h * 0.01)
  const left = Math.max(0, c0 - mx)
  const top = Math.max(0, r0 - my)
  const cw = Math.min(width, c1 + mx + 1) - left
  const ch = Math.min(height, r1 + my + 1) - top
  const out = new Uint8ClampedArray(cw * ch * 4)
  for (let y = 0; y < ch; y++) out.set(data.subarray(((top + y) * width + left) * 4, ((top + y) * width + left + cw) * 4), y * cw * 4)
  return { width: cw, height: ch, data: out }
}

/** every way the page may lie whose four corner marks are found: as it is, enhanced, upside down, a quarter turn either way */
export function candidates(imageData) {
  const found = []
  const paper = cropToPaper(imageData)
  for (const source of paper ? [paper, imageData] : [imageData]) {   // the paper alone first, then the whole photo
    const base = enhance(source)
    const ways = [() => source, () => base, () => rotate180(base)]
    if (source.width > source.height) ways.push(() => enhance(rotate90(source, true)), () => enhance(rotate90(source, false)))
    for (const make of ways) {
      const img = make()
      const markers = findRegistrationMarkers(img)
      const on = img === source ? base : img
      if (markers.valid) found.push({ img: on, markers: refineMarkers(on, markers) })
    }
  }
  return found
}

export function scoresWith(img, markers, settings) {
  const g = settings.geometry
  const h = homographyFromMarkers(markers, img.width, img.height, markerTargets(g.markers))
  const grid = (gr) => Array.from({ length: gr.digit_count }, (_, c) => rowScores(img, h, gr.rows.map(row => row[c])))
  const scores = {
    roll: grid(g.roll),
    set: settings.info_boxes?.set?.visible === false ? [] : grid(g.set),
    studentId: g.student_id && settings.info_boxes?.student_id?.visible !== false ? grid(g.student_id) : [],
    answers: answerRows(g).map(r => rowScores(img, h, r.options)),
  }
  const code = g.code?.bits?.length ? codeMatch(rowScores(img, h, g.code.bits), g.code.value) : null
  return { scores, code }
}

/**
 * D127 (3): one page read with the form's geometry. Photos are enhanced first (uneven light, dim, soft or small: see enhance), the
 * paper is cut out of a larger photo, a turned or perspective photo is straightened by the four corner marks, and a sideways or
 * upside-down page is tried each way; the printed form code decides the way up (D132), and a page whose code does not match is
 * unreadable (sent with blank answers for a person). `quality` tells the scanner when a retake would help.
 */
export function readSheet(imageData, settings, setSymbols = []) {
  const quality_ = quality(imageData)
  const found = candidates(imageData).map(f => ({ ...scoresWith(f.img, f.markers, settings) }))
  if (found.length === 0) return { ok: false, error: 'markers', quality: quality_ }
  const withCode = found.filter(f => f.code !== null)
  let best
  if (withCode.length) {
    best = withCode.sort((x, y) => y.code - x.code)[0]
    if (best.code < 0.5) return { ok: false, error: 'markers', quality: quality_ }
  } else {                                           // a geometry without a printed code: the reading with the most clean marks
    best = found.map(f => ({ f, n: judgeSheet(f.scores, setSymbols).answers.filter(a => a.status === 'marked').length })).sort((x, y) => y.n - x.n)[0].f
  }
  const { threshold, ...sheet } = judgeSheet(best.scores, setSymbols)
  return { ok: true, ...sheet, threshold, quality: quality_ }
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
