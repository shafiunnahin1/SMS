// D118 (R2.1.2): qbank's own graph and diagram tools, copied unchanged into public/vendor/qbank (qbank revision 40f769c). They load
// once, on first use, from this site (nothing from the internet). The editor only asks a tool for its result - qbank's text token
// for a graph - and inserts it with its own run(insertAt, ...), so React keeps owning the field's value.
const BASE = '/vendor/qbank/js'
export const DIAGRAM_TOKEN = /\[\[qmx-diagram:[A-Za-z0-9_-]{10,200000}\]\]/g
export const GRAPH_TOKEN = /\[\[qmx-graph:[A-Za-z0-9_-]{10,60000}\]\]/g

let mathLoading = null
let graphCore = null

/** the graph tool's dataset client reads this before it starts (qbank's QmxGraphDatasetConfig) */
function configureDatasets() {
  window.QmxGraphDatasetConfig = { ...(window.QmxGraphDatasetConfig ?? {}), baseUrl: '/api/v1/writer/graph-datasets' }
}

let swalLoading = null
/** D120: qbank's own SweetAlert2 copy (its dialogs are built on window.Swal), from this site, before the tools */
function loadSwal() {
  if (window.Swal) return Promise.resolve()
  if (!swalLoading) swalLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = '/vendor/qbank/vendor/sweetalert2/sweetalert2.all.min.js'
    script.onload = () => resolve()
    script.onerror = () => { swalLoading = null; reject(new Error('SweetAlert2 did not load')) }
    document.head.appendChild(script)
  })
  return swalLoading
}

export function loadQbankMath() {
  if (window.MathEditor?.getTool?.('graph')) return Promise.resolve(window.MathEditor)
  if (mathLoading) return mathLoading
  configureDatasets()
  mathLoading = loadSwal().then(() => new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.type = 'module'
    script.src = `${BASE}/math/core/index.js`
    script.onerror = () => { mathLoading = null; reject(new Error('qbank math tools did not load')) }
    document.head.appendChild(script)
    const started = Date.now()
    const wait = () => {
      if (window.MathEditor?.getTool?.('graph')) resolve(window.MathEditor)
      else if (Date.now() - started > 20000) { mathLoading = null; reject(new Error('qbank math tools did not start')) }
      else setTimeout(wait, 50)
    }
    wait()
  }))
  mathLoading.catch(() => { mathLoading = null })
  return mathLoading
}

/** opens qbank's graph dialog for this field; resolves with the token to insert, or null when the writer cancels */
export async function pickGraph(field) {
  const editor = await loadQbankMath()
  const tool = editor.getTool('graph')
  const context = editor.contextManager.getOrCreate(field, field.name || 'default')
  const payload = await tool.dialog({ textarea: field, editor, context, options: {} })
  return payload ? tool.generateLatex(payload) || null : null
}

/** qbank's graph renderer (graph-core.js), for showing a saved token */
export async function loadGraphCore() {
  if (!graphCore) graphCore = import(/* @vite-ignore */ `${BASE}/math/tools/graph/graph-core.js`)
  return graphCore
}

/** a token's SVG as an image source - inside an <img> an SVG cannot run script, so nothing from the question ever runs as code */
export async function graphImage(token) {
  const core = await loadGraphCore()
  const spec = core.decodeGraphToken(token)
  if (!spec) return null
  const svg = core.graphSvg(spec)
  return typeof svg === 'string' && svg.trim().startsWith('<svg') ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null
}

// D118: qbank's diagram scripts, in qbank's own load order (questions/edit.blade.php): the registries, the launcher, the renderer and
// the lazy loader that fetches each editor when it is first chosen. qbank-page-only helpers (token chips, preview media controls, its
// regression self-check) are not loaded: they work on qbank's own page markup.
const DIAGRAM_REGISTRIES = ['diagram-registry', 'coordinate-geometry-registry', 'number-line-registry', 'tree-diagram-registry', 'technical-drawing-registry',
  'statistical-diagram-registry', 'function-transformation-registry', 'complex-plane-registry', 'digital-logic-registry', 'finite-state-machine-registry',
  'database-er-registry', 'network-topology-registry', 'uml-software-design-registry', 'uml-sequence-registry', 'uml-activity-registry',
  'cloud-deployment-registry', 'chemical-structure-registry', 'biological-cell-registry', 'human-anatomy-registry', 'plant-anatomy-registry',
  'genetics-diagram-registry', 'ecology-diagram-registry', 'geology-diagram-registry', 'weather-climate-registry', 'astronomy-diagram-registry',
  'hydrology-diagram-registry', 'oceanography-diagram-registry', 'environmental-science-diagram-registry', 'disaster-management-diagram-registry']
const DIAGRAM_EDITOR = [...DIAGRAM_REGISTRIES, 'diagram-launcher', 'diagram-launcher-alias-compat', 'question-diagram-renderer', 'diagram-editor-lazy-loader', 'number-line-font-hotfix']
let diagramEditorLoading = null
let diagramRendererLoading = null

function classicScript(name) {
  return new Promise((resolve, reject) => {
    const src = `${BASE}/diagram/${name}-v1.js`
    if (document.querySelector(`script[data-qbank="${name}"]`)) return resolve()
    const script = document.createElement('script')
    script.src = src
    script.async = false                      // keep qbank's order
    script.dataset.qbank = name
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`${name} did not load`))
    document.head.appendChild(script)
  })
}

/** the renderer alone (to show a saved diagram) */
export function loadDiagramRenderer() {
  if (window.QmxDiagram?.svgMarkup) return Promise.resolve(window.QmxDiagram)
  if (!diagramRendererLoading) diagramRendererLoading = classicScript('question-diagram-renderer').then(() => window.QmxDiagram)
    .catch((e) => { diagramRendererLoading = null; throw e })
  return diagramRendererLoading
}

/** qbank's diagram picker and editors (with SweetAlert2, D120) */
export function loadQbankDiagrams() {
  if (window.QmxDiagramLauncher?.open && window.QmxDiagramLazyLoader) return Promise.resolve(window.QmxDiagramLauncher)
  if (!diagramEditorLoading) diagramEditorLoading = loadSwal().then(() => Promise.all(DIAGRAM_EDITOR.map(classicScript)))
    .then(() => window.QmxDiagramLauncher).catch((e) => { diagramEditorLoading = null; throw e })
  return diagramEditorLoading
}

/** opens qbank's diagram picker on this field; the chosen editor writes its token into the field itself (setRangeText + input) */
export async function openDiagramPicker(field) {
  const launcher = await loadQbankDiagrams()
  if (!launcher?.open) throw new Error('qbank diagram launcher missing')
  launcher.open({ textarea: field })
}

/** a diagram token as an image, drawn by qbank's renderer (an SVG inside <img> runs no script) */
export async function diagramImage(token) {
  const qmx = await loadDiagramRenderer()
  const spec = qmx?.decodeToken(token)
  if (!spec) return null
  const svg = qmx.svgMarkup(spec)
  return typeof svg === 'string' && svg.trim().startsWith('<svg') ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null
}
