import { describe, expect, it } from 'vitest'
import { answerRows, readSheet } from '../features/qb/omrSheet'

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
    expect(readSheet({ width: W, height: H, data: new Uint8ClampedArray(W * H * 4).fill(255) }, { geometry })).toEqual({ ok: false, error: 'markers' })
  })
})
