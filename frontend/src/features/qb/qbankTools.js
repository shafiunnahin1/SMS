// D118 (R2.1.2): qbank's own graph and diagram tools, copied unchanged into public/vendor/qbank (qbank revision 40f769c). They load
// once, on first use, from this site (nothing from the internet). The editor only asks a tool for its result - qbank's text token
// for a graph - and inserts it with its own run(insertAt, ...), so React keeps owning the field's value.
const BASE = '/vendor/qbank/js'
export const GRAPH_TOKEN = /\[\[qmx-graph:[A-Za-z0-9_-]{10,60000}\]\]/g

let mathLoading = null
let graphCore = null

/** the graph tool's dataset client reads this before it starts (qbank's QmxGraphDatasetConfig) */
function configureDatasets() {
  window.QmxGraphDatasetConfig = { ...(window.QmxGraphDatasetConfig ?? {}), baseUrl: '/api/v1/writer/graph-datasets' }
}

export function loadQbankMath() {
  if (window.MathEditor?.getTool?.('graph')) return Promise.resolve(window.MathEditor)
  if (mathLoading) return mathLoading
  configureDatasets()
  mathLoading = new Promise((resolve, reject) => {
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
  })
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
