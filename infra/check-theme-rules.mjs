#!/usr/bin/env node
// frontend/scripts/check-theme-rules.mjs   (Revision 7)
// Enforces AGENTS.md D5 (no hardcoded Class/Section/Batch/Course words), D11 (theme tokens only) and the public-site XSS rule.
// Usage:  node scripts/check-theme-rules.mjs [dir ...]      default: src/pages src/components src/layouts
// CI:     npm run lint:theme      (package.json: "lint:theme": "node scripts/check-theme-rules.mjs")
// Escape hatch (rare, must be justified in the PR): put  // theme-lint-ignore  on the same line.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, extname, sep } from 'node:path'

const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['src/pages', 'src/components', 'src/features', 'src/layouts', 'src/ui']
const EXT = new Set(['.js', '.jsx', '.ts', '.tsx'])
const SKIP_PATH = [`${sep}theme${sep}`, `${sep}i18n${sep}`, `${sep}config${sep}`]       // the places that are ALLOWED to hold colours / words

// Brand-ish colour families are forbidden; status colours (red, green, yellow, amber, orange) and text-white are allowed.
const COLOR = /(?<![\w:/-])(?:hover:|focus:|active:|dark:|disabled:)*(?:bg|text|border|ring|divide|from|to|via|fill|stroke|outline|shadow)-(?:gray|slate|zinc|neutral|stone|blue|indigo|sky|cyan|teal|purple|violet|fuchsia|pink|rose)(?:-\d{2,3})?(?![\w-])|(?<![\w:/-])bg-white(?![\w/-])|(?<![\w:/-])bg-black(?![\w/-])/g
const HEX = /(['"`])#[0-9A-Fa-f]{3,8}\1/g
// `text-primary` was never defined (brand text must be text-primary-fg: dark-mode safe, see docs/THEMING.md). Tailwind would silently emit nothing.
const BAD_BRAND_TEXT = /(?<![\w:/-])(?:hover:|focus:|dark:)*text-primary(?![\w-])/g
// Revision 9 (docs/I18N.md section 4): Arabic is right-to-left. Physical left/right classes do not flip, so they are forbidden - use the logical ones
// (ms-* me-* ps-* pe-* start-* end-* text-start text-end rounded-s/e border-s/e) and gap-* instead of space-x-*.
const PHYSICAL_DIR = /(?<![\w-])(?:[a-z]+:)*(?:-?m[lr]-|-?p[lr]-|left-|right-|text-left|text-right|rounded-[lr]-|rounded-[lr](?![\w-])|border-[lr]-|border-[lr](?![\w-])|space-x-|divide-x|float-(?:left|right))\S*/g
// Direction-implying icons must go through <DirIcon/> (mirrors in RTL); importing them bare from lucide-react is not allowed outside components/DirIcon.
const DIRECTIONAL_ICON = /\b(?:Chevron(?:s)?(?:Left|Right)|Arrow(?:Left|Right)|ArrowBigLeft|ArrowBigRight|Undo2?|Redo2?|MoveLeft|MoveRight|ChevronFirst|ChevronLast|StepForward|StepBack|SkipForward|SkipBack)\b/g
const NOT_DIRICON_FILE = p => !/(^|\/)DirIcon\.[jt]sx?$/.test(norm(p))
const RADIUS = /(?<![\w-])rounded-(?:sm|md|lg|xl|2xl|3xl)(?![\w-])/g          // use rounded-token (rounded-full is fine)
const INLINE_STYLE_COLOR = /style=\{\{[^}]*\b(?:color|background|backgroundColor|borderColor)\s*:\s*['"`]#/g
const DANGEROUS = /dangerouslySetInnerHTML/g
const TERMS_JSX = />\s*(?:Class(?:es)?|Section(?:s)?|Batch(?:es)?|Course(?:s)?|শ্রেণি(?:সমূহ)?|শ্রেণী(?:সমূহ)?|শাখা(?:সমূহ)?|সেকশন|ব্যাচ(?:সমূহ)?|কোর্স(?:সমূহ)?)\s*</g
const TERMS_PROP = /\b(?:label|title|placeholder|header|name)\s*[:=]\s*\{?\s*['"`](?:Class(?:es)?|Section(?:s)?|Batch(?:es)?|Course(?:s)?|শ্রেণি|শ্রেণী|শাখা|সেকশন|ব্যাচ|কোর্স)['"`]/g

// Revision 8 (docs/UI-PACKS.md): pages, shared components and feature hooks/views must never know WHICH pack, preset or layout is active -
// the pack decides presentation through PageSlot / ui/variants/*. Branching on it here breaks the next pack. Allowed only in ui/, theme/, layouts/, store/.
const PACK_LEAK = /\b(?:ui_pack|uiPack|preset_key|presetKey|layout_key|layoutKey)\b|ui\/packs\//g
const norm = p => p.split(sep).join('/')
const NOT_PACK_AWARE = p => /(^|\/)src\/(pages|components|features)\//.test(norm(p))      // default views live in features/ too: they must not branch on the pack either

const RULES = [
  ['theme-color',  COLOR,     'use theme tokens: bg-surface / bg-surface-muted / bg-primary text-on-primary / text-content / text-content-muted / border-line / bg-primary-soft'],
  ['brand-text',   BAD_BRAND_TEXT, 'use text-primary-fg (dark-mode safe); text-primary is not a defined class'],
  ['pack-leak',    PACK_LEAK, 'pages/components must not read ui_pack / preset_key / layout_key or import ui/packs - use PageSlot and ui/variants (docs/UI-PACKS.md)', NOT_PACK_AWARE],
  ['physical-direction', PHYSICAL_DIR, 'RTL-unsafe: use ms-/me-/ps-/pe-/start-/end-/text-start/text-end/rounded-s/e/border-s/e and gap-*'],
  ['directional-icon', DIRECTIONAL_ICON, 'wrap in <DirIcon icon={...}/> so it mirrors in RTL', NOT_DIRICON_FILE],
  ['hex-color',    HEX,       'no hex colours in components - use a token class or var(--color-primary)'],
  ['style-color',  INLINE_STYLE_COLOR, 'no inline colour styles - use a token class'],
  ['radius',       RADIUS,    'use rounded-token'],
  ['xss',          DANGEROUS, 'never render institution text as HTML'],
  ['hardcoded-term', TERMS_JSX,  "use useTerms(): {t('batch')}"],
  ['hardcoded-term', TERMS_PROP, "use useTerms(): label: t('batch')"],
]

function* walk(d) {
  let entries = []
  try { entries = readdirSync(d) } catch { return }
  for (const e of entries) {
    const p = join(d, e)
    const s = statSync(p)
    if (s.isDirectory()) { if (e !== 'node_modules') yield* walk(p) }
    else if (EXT.has(extname(p)) && !SKIP_PATH.some(x => p.includes(x))) yield p
  }
}

let violations = 0, files = 0
for (const dir of dirs) for (const file of walk(dir)) {
  files++
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (line.includes('theme-lint-ignore')) return
    for (const [rule, re, hint, applies] of RULES) {
      if (applies && !applies(file)) continue
      re.lastIndex = 0
      const subject = rule === 'pack-leak' ? line.replace(/\/\/.*$/, '') : line      // a comment that merely names layout_key is harmless
      const m = subject.match(re)
      if (m) { violations++; console.error(`${file}:${i + 1}  [${rule}] ${m[0].trim()}  -> ${hint}`) }
    }
  })
}
console.log(`${files} files checked, ${violations} violation(s)`)
process.exit(violations ? 1 : 0)
