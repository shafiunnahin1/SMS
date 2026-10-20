import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// D130: the local heic2any 0.0.4 copy under public/vendor/heic2any (turns HEIC photos of OMR sheets into JPEG in the browser), pinned by MANIFEST.sha256 - every file listed, none extra,
// each byte-for-byte as recorded.
const ROOT = join(process.cwd(), 'public/vendor/heic2any')
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p] })

describe('heic2any vendor copy (D130)', () => {
  it('matches MANIFEST.sha256 exactly', () => {
    const listed = Object.fromEntries(readFileSync(join(ROOT, 'MANIFEST.sha256'), 'utf8').split('\n')
      .map((l) => l.match(/^([0-9a-f]{64})\s+(\S.*)$/)).filter(Boolean).map((m) => [m[2], m[1]]))
    const files = walk(ROOT).map((p) => relative(ROOT, p).split('\\').join('/')).filter((f) => f !== 'MANIFEST.sha256').sort()
    expect(files).toEqual(Object.keys(listed).sort())
    for (const f of files) expect(createHash('sha256').update(readFileSync(join(ROOT, f))).digest('hex'), f).toBe(listed[f])
  })
})
