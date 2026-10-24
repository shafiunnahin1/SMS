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

/** saves the paper as `filename` (JPEG) */
export async function downloadPaperJpg(paper, filename = 'question-paper.jpg') {
  const canvas = await paperCanvas(paper)
  const blob = await new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('jpg'))), 'image/jpeg', 0.92))
  const href = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href, download: filename })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 10000)
}
