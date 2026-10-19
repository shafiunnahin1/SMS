import { test, expect } from '@playwright/test'

// R2.1.2 / D118 (6): every graph type qbank's graph registry knows and every diagram mode qbank's renderer supports is drawn by the
// copied renderers - a minimal figure of each mode is encoded as qbank's token, decoded and drawn to an SVG, as the writer preview,
// the question views and the printed paper do. Runs once (school-desktop; no login needed - public files only).
const BASE = process.env.E2E_BASE_DOMAIN ?? 'lvh.me:5173'
test.use({ baseURL: `http://admin.${BASE}` })

test('D118 every qbank graph type and diagram mode draws', async ({ page }) => {
  await page.goto('/login')
  const result = await page.evaluate(async () => {
    const core = await import('/vendor/qbank/js/math/tools/graph/graph-core.js')
    const graphs = {}
    for (const plugin of core.getGraphPlugins()) {
      const type = plugin.type ?? plugin.id
      try {
        const token = core.encodeGraphToken({ type })
        const svg = core.graphSvg(core.decodeGraphToken(token))
        graphs[type] = typeof svg === 'string' && svg.trim().startsWith('<svg')
      } catch (e) { graphs[type] = `error: ${e.message}` }
    }
    await new Promise((ok, no) => { const s = document.createElement('script'); s.src = '/vendor/qbank/js/diagram/question-diagram-renderer-v1.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s) })
    const D = window.QmxDiagram
    const modes = [...new Set(String(D.normalizeSpec).match(/'[a-z0-9-]+'/g) ?? [])].map((m) => m.slice(1, -1))
    const diagrams = {}
    for (const mode of modes) {
      let spec
      try { spec = D.normalizeSpec({ mode, objects: [] }) } catch { continue }       // not a mode name
      if (spec.mode !== mode) continue
      try {
        const token = `[[qmx-diagram:${D.encodeSpec(spec)}]]`
        const svg = D.svgMarkup(D.decodeToken(token))
        diagrams[mode] = typeof svg === 'string' && svg.trim().startsWith('<svg')
      } catch (e) { diagrams[mode] = `error: ${e.message}` }
    }
    return { graphs, diagrams }
  })
  const failed = (o) => Object.entries(o).filter(([, v]) => v !== true)
  expect(Object.keys(result.graphs).length).toBeGreaterThan(5)
  expect(Object.keys(result.diagrams).length).toBeGreaterThan(30)
  expect(failed(result.graphs)).toEqual([])
  expect(failed(result.diagrams)).toEqual([])
})
