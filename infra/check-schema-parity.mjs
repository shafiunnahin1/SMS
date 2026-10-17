#!/usr/bin/env node
// infra/check-schema-parity.mjs   (Revision 10 - added after verification found 6 columns and 2 UNIQUE constraints that existed only in module docs)
// Rule (D13): docs/database/schema.sql is the ONLY schema truth. Any CREATE TABLE copied into a module doc must not add a column or a UNIQUE
// constraint that schema.sql lacks. Run in CI:  node infra/check-schema-parity.mjs   (exit 1 on any divergence)
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] ?? '.'
const SCHEMA = join(root, 'docs/database/schema.sql')
const strip = s => s.replace(/--[^\n]*/g, '')
const norm  = cols => cols.split(',').map(c => c.trim()).sort().join(',')

function tables(sql) {                                   // { table: { cols:Set, uniques:Set } }
  const out = {}
  for (const m of strip(sql).matchAll(/CREATE TABLE (\w+) \(([\s\S]*?)\n\);/g)) {
    const [, name, body] = m, cols = new Set(), uniques = new Set()
    for (const raw of body.split('\n')) {
      const line = raw.trim().replace(/,$/, '')
      if (!line) continue
      let u
      if ((u = line.match(/^UNIQUE(?: KEY)?\s*(?:\w+\s*)?\(([^)]*)\)/))) { uniques.add(norm(u[1])); continue }
      if (/^(FOREIGN|KEY|PRIMARY|INDEX|CONSTRAINT)\b/.test(line)) continue
      const c = line.match(/^([a-z_][a-z0-9_]*)\s+[A-Za-z]/)
      if (c) { cols.add(c[1]); if (/\bUNIQUE\b/.test(line)) uniques.add(c[1]) }
    }
    out[name] = { cols, uniques }
  }
  return out
}
function* codeFences(text) {                            // proper fence pairing (a regex pairs mixed-language fences wrongly)
  let cur = null, buf = []
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*```(\w*)\s*$/)
    if (m) { if (cur === null) { cur = m[1]; buf = [] } else { yield buf.join('\n'); cur = null } }
    else if (cur !== null) buf.push(line)
  }
}
function* mdFiles(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e), s = statSync(p)
    if (s.isDirectory()) { if (!/(^|\/)(reports|database)$/.test(p)) yield* mdFiles(p) }
    else if (p.endsWith('.md')) yield p
  }
}

const schemaSql = readFileSync(SCHEMA, 'utf8')
const S = tables(schemaSql)
for (const m of strip(schemaSql).matchAll(/ALTER TABLE (\w+) ADD COLUMN (\w+)/g)) S[m[1]]?.cols.add(m[2])
for (const m of strip(schemaSql).matchAll(/CREATE UNIQUE INDEX \w+ ON (\w+)\(([^)]*)\)/g)) S[m[1]]?.uniques.add(norm(m[2]))

let bad = 0, copies = 0
for (const f of mdFiles(join(root, 'docs'))) {
  for (const block of codeFences(readFileSync(f, 'utf8'))) {
    for (const [name, t] of Object.entries(tables(block))) {
      if (!S[name]) continue
      copies++
      for (const c of t.cols)    if (!S[name].cols.has(c))    { bad++; console.error(`${f}: ${name}.${c} is not in schema.sql`) }
      for (const u of t.uniques) if (!S[name].uniques.has(u)) { bad++; console.error(`${f}: ${name} UNIQUE(${u}) differs from schema.sql (schema has: ${[...S[name].uniques].map(x => `(${x})`).join(' ') || 'none'})`) }
    }
  }
}
console.log(`${copies} table copies in docs checked against ${Object.keys(S).length} schema tables, ${bad} divergence(s)`)
process.exit(bad ? 1 : 0)
