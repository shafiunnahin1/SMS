// D121: qbank's photo step - read a question photo's text in the browser with SMS's own tesseract.js copy
// (public/vendor/tesseract); the engine, the ben + eng data and the photo never leave this site.
const BASE = '/vendor/tesseract'
export const MAX_PHOTO_BYTES = 12 * 1024 * 1024   // qbank's limit

let libLoading = null
let workerPromise = null
let report = () => {}

function loadLib() {
  if (window.Tesseract) return Promise.resolve()
  if (!libLoading) libLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${BASE}/tesseract.min.js`
    script.onload = () => resolve()
    script.onerror = () => { libLoading = null; reject(new Error('tesseract.js did not load')) }
    document.head.appendChild(script)
  })
  return libLoading
}

function worker() {
  if (!workerPromise) workerPromise = loadLib().then(() => window.Tesseract.createWorker(['ben', 'eng'], 1, {
    workerPath: `${BASE}/worker.min.js`, corePath: `${BASE}/core`, langPath: `${BASE}/lang`, gzip: false, workerBlobURL: false,
    logger: (m) => { if (typeof m.progress === 'number') report(m.status, m.progress) },
  })).catch((e) => { workerPromise = null; throw e })
  return workerPromise
}

/** the text of an image file; onProgress(status, 0..1) with tesseract's status names */
export async function readPhoto(file, onProgress = () => {}) {
  report = onProgress
  const w = await worker()
  const { data } = await w.recognize(file)
  return (data.text ?? '').trim()
}
