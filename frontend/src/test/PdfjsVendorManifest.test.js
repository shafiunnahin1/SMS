import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// D127: the local pdf.js 3.11.174 copy under public/vendor/pdfjs (reads PDFs of scanned OMR sheets in the browser), pinned by MANIFEST.sha256 - every file listed, none extra,
// each byte-for-byte as recorded.
const ROOT = join(process.cwd(), 'public/vendor/pdfjs')
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p] })

describe('pdf.js vendor copy (D127)', () => {
  it('matches MANIFEST.sha256 exactly', () => {
    const listed = Object.fromEntries(readFileSync(join(ROOT, 'MANIFEST.sha256'), 'utf8').split('\n')
      .map((l) => l.match(/^([0-9a-f]{64})\s+(\S.*)$/)).filter(Boolean).map((m) => [m[2], m[1]]))
    const files = walk(ROOT).map((p) => relative(ROOT, p).split('\\').join('/')).filter((f) => f !== 'MANIFEST.sha256').sort()
    expect(files).toEqual(Object.keys(listed).sort())
    for (const f of files) expect(createHash('sha256').update(readFileSync(join(ROOT, f))).digest('hex'), f).toBe(listed[f])
  })
})
