import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// D119: the qbank tools under public/vendor/qbank are qbank's code, pinned by MANIFEST.sha256 - every file listed, none extra,
// each byte-for-byte as recorded (the guard checks the same on every commit).
const ROOT = join(process.cwd(), 'public/vendor/qbank')
const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p] })

describe('qbank vendor copy (D119)', () => {
  it('matches MANIFEST.sha256 exactly', () => {
    const listed = Object.fromEntries(readFileSync(join(ROOT, 'MANIFEST.sha256'), 'utf8').split('\n')
      .map((l) => l.match(/^([0-9a-f]{64})\s+(\S.*)$/)).filter(Boolean).map((m) => [m[2], m[1]]))
    const files = walk(ROOT).map((p) => relative(ROOT, p).split('\\').join('/')).filter((f) => f !== 'MANIFEST.sha256').sort()
    expect(files).toEqual(Object.keys(listed).sort())
    for (const f of files) expect(createHash('sha256').update(readFileSync(join(ROOT, f))).digest('hex'), f).toBe(listed[f])
  })
})
