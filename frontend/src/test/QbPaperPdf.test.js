import { describe, expect, it } from 'vitest'
import { buildPdf, pageSlices } from '../features/qb/paperImage'

describe('paper PDF without a library', () => {
  it('cuts a tall paper into A4 pages and moves each cut up to the given white row', () => {
    const canvas = { width: 210, height: 700 }            // one A4 page is 297 px tall at this width
    expect(pageSlices(canvas)).toEqual([{ top: 0, height: 297 }, { top: 297, height: 297 }, { top: 594, height: 106 }])
    expect(pageSlices(canvas, (from, to) => to - 10)[0]).toEqual({ top: 0, height: 287 })
  })

  it('writes a PDF with one page and one JPEG image per slice and a correct cross-reference table', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    const bytes = buildPdf([{ bytes: jpeg, width: 210, height: 297 }, { bytes: jpeg, width: 210, height: 100 }])
    const text = new TextDecoder('latin1').decode(bytes)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text).toContain('/Count 2')
    expect(text.match(/\/Subtype \/Image/g)).toHaveLength(2)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    const xref = Number(text.match(/startxref\n(\d+)/)[1])
    expect(text.slice(xref, xref + 4)).toBe('xref')
    const offsets = [...text.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map(m => Number(m[1]))
    offsets.forEach((at, i) => expect(text.slice(at, at + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`))
  })
})
