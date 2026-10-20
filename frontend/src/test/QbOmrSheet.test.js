import { describe, expect, it } from 'vitest'
import { answerRows, judgeSheet, pageThreshold, readSheet } from '../features/qb/omrSheet'
import photos from './fixtures/omr-photos.json'

// D127 (3): a whole sheet read with the persisted geometry - roll, set and answers; unreadable digits become "?"
const W = 800
const H = 1120
const cell = (left, top) => ({ bubble: { left, top, width: 0.02, height: 0.014 } })
const grid = (left, digits) => ({ digit_count: digits, rows: Array.from({ length: 10 }, (_, d) => Array.from({ length: digits }, (_, c) => cell(left + c * 0.03, 0.17 + d * 0.02))) })
const geometry = {
  roll: grid(0.2, 2),
  set: grid(0.7, 1),
  answers: { columns: [
    { rows: [{ question_index: 1, options: [0, 1, 2, 3].map(o => cell(0.3 + o * 0.04, 0.56)) }] },
    { rows: [{ question_index: 0, options: [0, 1, 2, 3].map(o => cell(0.3 + o * 0.04, 0.53)) }] },
  ] },
}

const image = (fills) => {
  const data = new Uint8ClampedArray(W * H * 4).fill(255)
  const dot = (cx, cy, r, hole = 0) => {
    for (let y = Math.round(cy - r); y <= cy + r; y++) for (let x = Math.round(cx - r); x <= cx + r; x++) {
      if (hole && Math.abs(x - cx) <= hole && Math.abs(y - cy) <= hole) continue
      data.set([0, 0, 0, 255], (y * W + x) * 4)
    }
  }
  for (const [x, y] of [[0.119, 0.05], [0.881, 0.05], [0.119, 0.882], [0.881, 0.882]]) dot(W * x, H * y, 16, 6)
  for (const b of fills) {
    const cx = (b.left + b.width / 2) * W
    const cy = (b.top + b.height / 2) * H
    for (let y = Math.round(cy - 6); y <= cy + 6; y++) for (let x = Math.round(cx - 6); x <= cx + 6; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= 36) data.set([0, 0, 0, 255], (y * W + x) * 4)
    }
  }
  return { width: W, height: H, data }
}

describe('readSheet (D127)', () => {
  it('orders answer rows by question index', () => {
    expect(answerRows(geometry).map(r => r.question_index)).toEqual([0, 1])
  })

  it('reads roll, set and answers; an unmarked digit stays unreadable', () => {
    const fills = [geometry.roll.rows[4][0].bubble, geometry.set.rows[1][0].bubble,
      geometry.answers.columns[1].rows[0].options[2].bubble,
      geometry.answers.columns[0].rows[0].options[0].bubble, geometry.answers.columns[0].rows[0].options[3].bubble]
    const r = readSheet(image(fills), { geometry, info_boxes: { set: { visible: true } } }, ['A', 'B'])
    expect(r.ok).toBe(true)
    expect(r.roll).toBe('4?')
    expect(r.set_code).toBe('B')
    expect(r.answers).toEqual([{ status: 'marked', selected: [2] }, { status: 'ambiguous', selected: [0, 3] }])
  })

  it('refuses a page without its four markers', () => {
    const r = readSheet({ width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(255) }, { geometry })
    expect([r.ok, r.error]).toEqual([false, 'markers'])
  })

  // a phone photo: turned 3 degrees, a shadow across the page, dim light and a quarter of the resolution
  const photo = (src, { angle = 3, dim = 0.35, shadow = 0.35, shrink = 0.5, blur = 0 } = {}) => {
    const w = Math.round(W * shrink)
    const h = Math.round(H * shrink)
    const data = new Uint8ClampedArray(w * h * 4)
    const a = angle * Math.PI / 180
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const u = x / w - 0.5
      const v = y / h - 0.5
      const sx = Math.round(((u * Math.cos(a) - v * Math.sin(a)) * 1.08 + 0.5) * W)   // a little margin round the turned page
      const sy = Math.round(((u * Math.sin(a) + v * Math.cos(a)) * 1.08 + 0.5) * H)
      const inside = sx >= 0 && sy >= 0 && sx < W && sy < H
      const value = inside ? src.data[(sy * W + sx) * 4] : 200
      const light = dim * (1 - shadow * (x / w))                  // darker towards one side
      const g = Math.round(value * light + 12)
      data.set([g, g, g, 255], (y * w + x) * 4)
    }
    if (!blur) return { width: w, height: h, data }
    const soft = new Uint8ClampedArray(data.length)                // out of focus: a box blur
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let sum = 0
      let n = 0
      for (let dy = -blur; dy <= blur; dy++) for (let dx = -blur; dx <= blur; dx++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy))
        const xx = Math.min(w - 1, Math.max(0, x + dx))
        sum += data[(yy * w + xx) * 4]
        n++
      }
      const g = Math.round(sum / n)
      soft.set([g, g, g, 255], (y * w + x) * 4)
    }
    return { width: w, height: h, data: soft }
  }

  it('reads a slightly turned, dim, low-resolution photo after enhancement', () => {
    const fills = [geometry.roll.rows[4][0].bubble, geometry.roll.rows[7][1].bubble, geometry.set.rows[0][0].bubble,
      geometry.answers.columns[1].rows[0].options[1].bubble, geometry.answers.columns[0].rows[0].options[3].bubble]
    const r = readSheet(photo(image(fills)), { geometry, info_boxes: { set: { visible: true } } }, ['A', 'B'])
    expect(r.ok).toBe(true)
    expect(r.roll).toBe('47')
    expect(r.set_code).toBe('A')
    expect(r.answers).toEqual([{ status: 'marked', selected: [1] }, { status: 'marked', selected: [3] }])
    expect(r.quality.dark).toBe(true)
  })

  it('reads a blurry, more turned, smaller photo', () => {
    const fills = [geometry.roll.rows[9][0].bubble, geometry.roll.rows[0][1].bubble, geometry.set.rows[1][0].bubble,
      geometry.answers.columns[1].rows[0].options[0].bubble, geometry.answers.columns[0].rows[0].options[2].bubble]
    const r = readSheet(photo(image(fills), { angle: -6, shrink: 0.4, blur: 1 }), { geometry, info_boxes: { set: { visible: true } } }, ['A', 'B'])
    expect([r.ok, r.roll, r.set_code]).toEqual([true, '90', 'B'])
    expect(r.answers.map(a => a.selected)).toEqual([[0], [2]])
  })

  it('finds the sheet when it fills only part of a photo with dark things beside it', () => {
    const fills = [geometry.roll.rows[3][0].bubble, geometry.roll.rows[6][1].bubble, geometry.set.rows[0][0].bubble,
      geometry.answers.columns[1].rows[0].options[3].bubble, geometry.answers.columns[0].rows[0].options[1].bubble]
    const page = photo(image(fills), { angle: 2, dim: 0.9, shadow: 0.1, shrink: 0.6 })
    const fw = page.width * 2
    const fh = Math.round(page.height * 1.6)
    const data = new Uint8ClampedArray(fw * fh * 4)
    for (let i = 0; i < data.length; i += 4) data.set([25, 25, 25, 255], i)       // a dark desk / screen frame
    for (let k = 0; k < 6; k++) for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) data.set([0, 0, 0, 255], ((20 + y + k * 90) * fw + 15 + x) * 4)   // dark toolbar blocks
    const ox = Math.round(page.width * 0.6)
    const oy = Math.round(page.height * 0.25)
    for (let y = 0; y < page.height; y++) data.set(page.data.subarray(y * page.width * 4, (y + 1) * page.width * 4), ((oy + y) * fw + ox) * 4)
    const r = readSheet({ width: fw, height: fh, data }, { geometry, info_boxes: { set: { visible: true } } }, ['A', 'B'])
    expect([r.ok, r.roll, r.set_code]).toEqual([true, '36', 'A'])
    expect(r.answers.map(a => a.selected)).toEqual([[3], [1]])
  })

  it('finds a sheet photographed sideways', () => {
    const fills = [geometry.roll.rows[2][0].bubble, geometry.roll.rows[5][1].bubble, geometry.answers.columns[1].rows[0].options[0].bubble, geometry.answers.columns[0].rows[0].options[2].bubble]
    const src = image(fills)
    const side = { width: H, height: W, data: new Uint8ClampedArray(src.data.length) }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) side.data.set(src.data.subarray((y * W + x) * 4, (y * W + x) * 4 + 4), (x * H + (H - 1 - y)) * 4)
    const r = readSheet(side, { geometry, info_boxes: { set: { visible: false } } })
    expect(r.ok).toBe(true)
    expect(r.roll).toBe('25')
    expect(r.answers.map(a => a.selected)).toEqual([[0], [2]])
  })
})

// D132: whole sheets measured on the owner's phone photos (fixtures/omr-photos.json): one threshold per photo, and every reading that
// is not certain is flagged for a person - checked against what the owner filled in (roll and set) and what the photos show.
describe('per-photo threshold on real photos (D132)', () => {
  const SYM = ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ', 'ঝ', 'ঞ']
  const sel = (r, q) => r.answers[q - 1].selected
  const sure = (r, q) => r.answers[q - 1].status !== 'uncertain'
  // the safety rule: a reading the reader is sure of is never wrong (checked on the rows we know); and enough rows are sure to help
  const expectSure = (r, rows, atLeast) => {
    for (const [q, want] of rows) if (sure(r, q)) expect(sel(r, q), `q${q}`).toEqual(want)
    expect(rows.filter(([q]) => sure(r, q)).length).toBeGreaterThanOrEqual(atLeast)
  }

  it('every photo matches its printed form code the right way up', () => {
    for (const n of ['screen', 'shadow', 'clean', 'sideways']) expect(photos[n].code, n).toBeGreaterThan(0.5)
  })

  it('a clean photo with light pen marks: roll 300099 offered with one digit to check, set গ, sure answers right', () => {
    const r = judgeSheet(photos.clean, SYM)
    expect(r.threshold).toBeLessThan(0.5)                     // light marks: a low threshold for this photo
    expect([r.roll, r.roll_uncertain, r.set_code]).toEqual(['30?099', true, 'গ'])
    expectSure(r, [[6, [1]], [8, [2]], [11, [1]], [14, [1]], [15, [3]]], 3)
    expect(r.answers[15].status).not.toBe('marked')           // empty on paper, read as a mark: sent to a person, never scored silently
  })

  it('a shadowed photo: roll 303132, the set (ঘ) left for a person', () => {
    const r = judgeSheet(photos.shadow, SYM)
    expect([r.roll, r.set_code, r.set_uncertain]).toEqual(['303132', null, true])
    expectSure(r, [[1, [2]], [2, [1]], [3, [2]], [5, [1]], [9, [1, 3]], [13, [1, 3]], [18, [2]]], 4)
    expect(r.answers[10].status).not.toBe('marked')           // খ filled, two bubbles grey: several marks, so a person checks it
  })

  it('a sideways photo: roll 2?1377 (the empty column stays unread), set খ', () => {
    const r = judgeSheet(photos.sideways, SYM)
    expect([r.roll, r.set_code]).toEqual(['2?1377', 'খ'])
  })

  it('a photo of a screen: roll 242478 and set ক offered; the empty row 12 is flagged, not marked', () => {
    const r = judgeSheet(photos.screen, SYM)
    expect(r.threshold).toBeGreaterThan(0.6)                  // empty bubbles are grey there: a high threshold
    expect([r.roll, r.set_code]).toEqual(['242478', 'ক'])
    expect(sel(r, 12)).toEqual([])
    expectSure(r, [[1, [1]], [3, [3]], [4, [1]], [5, [0]], [11, [1]], [13, [3]], [14, [1]], [15, [3]], [20, [3]]], 6)
  })

  it('pageThreshold splits two groups; an all-empty page marks nothing', () => {
    expect(pageThreshold([0.02, 0.05, 0.03, 0.5, 0.55])).toBeGreaterThan(0.05)
    expect(pageThreshold([0.02, 0.05, 0.03, 0.5, 0.55])).toBeLessThan(0.5)
    expect(pageThreshold([0, 0, 0, 0])).toBeGreaterThan(0)
  })
})
