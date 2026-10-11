import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import bn from '../i18n/bn.json'
import en from '../i18n/en.json'
import ar from '../i18n/ar.json'
import i18n from '../i18n'

// i18n/index.js loads only `app` (as the default namespace) and `nav`; a group of texts put next to them is never loaded and the
// page shows raw keys (QB.1-QB.5 did: `qb.*` sat at the top level). Every t('qb.…') / t('qbp.…') key used in the code resolves.
describe('i18n files', () => {
  it('have only the namespaces index.js loads', () => {
    for (const d of [bn, en, ar]) expect(Object.keys(d).sort()).toEqual(['app', 'nav'])
  })

  it('resolve every question-bank key the pages use, in bn and en', () => {
    const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`]))
    const keys = new Set()
    for (const f of files('src').filter(f => /\.jsx?$/.test(f) && !f.includes('/test/'))) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bt\(\s*'(qbp?\.[a-z_]+(?:\.[a-z_]+)*)'/g)) keys.add(m[1])
    }
    expect(keys.size).toBeGreaterThan(50)
    const missing = [...keys].filter(k => !['bn', 'en'].every(l => i18n.exists(k, { lng: l, fallbackLng: false })))
    expect(missing).toEqual([])
  })
})
