// Owner request 2026-10-24: the print preview's "image" button saves the paper as a JPG without a new dependency (G7 - qbank's
// html2canvas is not an SMS package). The paper is copied with every element's computed style written inline, its pictures turned
// into data URLs, the screen-only controls (.qb-no-print) dropped; the copy goes into an SVG <foreignObject>, the browser draws that
// SVG on a canvas on white, and the canvas is saved as JPEG. Web fonts are not carried into the SVG, so text falls back to the
// computer's own font of the same family when it is installed.

const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META'])

function inlineStyles(source, copy) {
  if (source.nodeType !== 1) return
  if (source.classList.contains('qb-no-print') || SKIP.has(source.tagName)) { copy.setAttribute('data-drop', ''); return }
  const computed = window.getComputedStyle(source)
  let css = ''
  for (let i = 0; i < computed.length; i += 1) {
    const prop = computed[i]
    css += `${prop}:${computed.getPropertyValue(prop)};`
  }
  if (source.classList.contains('qb-box')) css += 'box-shadow:none;resize:none;outline:none;'   // no selection ring or resize corner on the picture
  copy.setAttribute('style', css)
  copy.removeAttribute('class')
  copy.removeAttribute('contenteditable')
  const from = [...source.childNodes]
  const to = [...copy.childNodes]
  from.forEach((child, i) => inlineStyles(child, to[i]))
}

const asDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result))
  reader.onerror = reject
  reader.readAsDataURL(blob)
})

async function inlineImages(copy) {
  await Promise.all([...copy.querySelectorAll('img')].map(async (img) => {
    const src = img.getAttribute('src') ?? ''
    if (!src || src.startsWith('data:')) return
    try { img.setAttribute('src', await asDataUrl(await (await fetch(src, { credentials: 'include' })).blob())) } catch { img.remove() }
  }))
}

/** draws the paper element on a canvas (white background, `scale` x its size) */
export async function paperCanvas(paper, scale = 2) {
  const rect = paper.getBoundingClientRect()
  const width = Math.ceil(rect.width)
  const height = Math.ceil(paper.scrollHeight)
  const copy = paper.cloneNode(true)
  inlineStyles(paper, copy)
  copy.querySelectorAll('[data-drop]').forEach(el => el.remove())   // the screen-only controls (grips, edit buttons, the drag ghost)
  copy.style.margin = '0'
  copy.style.boxShadow = 'none'
  copy.style.border = '0'
  copy.style.borderRadius = '0'
  copy.style.width = `${width}px`
  copy.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml')
  await inlineImages(copy)
  const xhtml = new XMLSerializer().serializeToString(copy)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="100%" height="100%">${xhtml}</foreignObject></svg>`
  const image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.scale(scale, scale)
  ctx.drawImage(image, 0, 0)
  return canvas
}

const jpegBlob = (canvas) => new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('jpg'))), 'image/jpeg', 0.92))

function save(blob, filename) {
  const href = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 10000)
}

/** saves the paper as `filename` (JPEG) */
export async function downloadPaperJpg(paper, filename = 'question-paper.jpg') {
  save(await jpegBlob(await paperCanvas(paper)), filename)
}

// Owner request 2026-10-24: the PDF button downloads a PDF file (the print dialog is only the print button's). The paper's canvas is
// cut into A4 pages - each cut moves up to the nearest all-white pixel row so no line of text is split - and every page is one JPEG
// in a small hand-written PDF (DCTDecode image per page); no PDF library is needed (G7).

/** the row to cut at: the lowest all-white row between `from` and `to` (both exclusive of the page start), else `to` */
export function whiteRow(ctx, width, from, to) {
  for (let y = to; y > from; y -= 1) {
    const row = ctx.getImageData(0, y, width, 1).data
    let white = true
    for (let i = 0; i < row.length; i += 4) if (row[i] < 245 || row[i + 1] < 245 || row[i + 2] < 245) { white = false; break }
    if (white) return y
  }
  return to
}

/** A4 page slices of a canvas: [{ top, height }] in canvas pixels */
export function pageSlices(canvas, cut = (from, to) => to) {
  const pageHeight = Math.floor(canvas.width * 297 / 210)
  const slices = []
  let top = 0
  while (top < canvas.height) {
    let end = Math.min(canvas.height, top + pageHeight)
    if (end < canvas.height) end = cut(top + Math.floor(pageHeight * 0.75), end)
    slices.push({ top, height: end - top })
    top = end
  }
  return slices
}

/** a PDF (A4 pages, each one full-width JPEG placed at the top) from JPEG pages [{ bytes: Uint8Array, width, height }] */
export function buildPdf(pages) {
  const W = 595.28
  const H = 841.89
  const enc = new TextEncoder()
  const parts = []
  const offsets = []
  let length = 0
  const push = (chunk) => { const b = typeof chunk === 'string' ? enc.encode(chunk) : chunk; parts.push(b); length += b.length }
  const object = (n, body, stream) => {
    offsets[n] = length
    push(`${n} 0 obj\n${body}\n`)
    if (stream) { push('stream\n'); push(stream); push('\nendstream\n') }
    push('endobj\n')
  }
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`)
  pages.forEach((page, i) => {
    const n = 3 + i * 3
    const drawn = (page.height / page.width) * W
    const content = enc.encode(`q ${W.toFixed(2)} 0 0 ${drawn.toFixed(2)} 0 ${(H - drawn).toFixed(2)} cm /Im0 Do Q`)
    object(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`)
    object(n + 1, `<< /Length ${content.length} >>`, content)
    object(n + 2, `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>`, page.bytes)
  })
  const count = 3 + pages.length * 3
  const xref = length
  push(`xref\n0 ${count}\n0000000000 65535 f \n`)
  for (let n = 1; n < count; n += 1) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`)
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  const out = new Uint8Array(length)
  let at = 0
  parts.forEach(b => { out.set(b, at); at += b.length })
  return out
}

/** saves the paper as `filename` (PDF, A4 pages) */
export async function downloadPaperPdf(paper, filename = 'question-paper.pdf') {
  const canvas = await paperCanvas(paper)
  const ctx = canvas.getContext('2d')
  const pages = []
  for (const slice of pageSlices(canvas, (from, to) => whiteRow(ctx, canvas.width, from, to))) {
    const page = document.createElement('canvas')
    page.width = canvas.width
    page.height = slice.height
    const pctx = page.getContext('2d')
    pctx.fillStyle = 'white'
    pctx.fillRect(0, 0, page.width, page.height)
    pctx.drawImage(canvas, 0, slice.top, canvas.width, slice.height, 0, 0, canvas.width, slice.height)
    pages.push({ bytes: new Uint8Array(await (await jpegBlob(page)).arrayBuffer()), width: page.width, height: page.height })
  }
  save(new Blob([buildPdf(pages)], { type: 'application/pdf' }), filename)
}
