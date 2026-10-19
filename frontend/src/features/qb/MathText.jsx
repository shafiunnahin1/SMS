import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { loadMathlive, UNSAFE_LATEX } from './mathlive'
import { parseRich } from './richText'
import { graphImage } from './qbankTools'

// Question text with inline maths ($...$ or qbank's \( ... \)) and, since D72 (QB.12), qbank's formatting vocabulary. The text is
// read into allowlisted nodes (richText.js) and built as React elements - plain text stays React text (escaped); each maths piece
// goes to mathlive's <math-span>, which reads it as TEXT and draws it. No HTML string is ever injected.
const LIST_STYLE = { disc: 'disc', circle: 'circle', square: 'square', decimal: 'decimal', 'lower-alpha': 'lower-alpha', 'upper-alpha': 'upper-alpha',
  'lower-roman': 'lower-roman', 'upper-roman': 'upper-roman', 'bengali-number': 'bengali', 'bengali-letter': 'bengali' }
const ALIGN = { left: 'text-start', right: 'text-end', center: 'text-center', justify: 'text-justify' }
const TABLE_WIDTH = { auto: 'auto', 50: '50%', 75: '75%', 100: '100%' }
const CELL_SPACING = { compact: 'px-1 py-0', normal: 'px-2 py-1', comfortable: 'px-3 py-2' }
const CELL = 'align-top [border:1px_solid_var(--line)]'

function Maths({ text, ready }) {
  const parts = String(text).split(/(\$[^$]+\$|\\\([\s\S]+?\\\))/g).filter(Boolean)
  return parts.map((p, i) => {
    const dollar = p.length > 2 && p.startsWith('$') && p.endsWith('$')
    const paren = p.length > 4 && p.startsWith('\\(') && p.endsWith('\\)')
    const latex = dollar ? p.slice(1, -1) : paren ? p.slice(2, -2) : null
    if (latex === null) return <span key={i}>{p}</span>
    if (!ready || UNSAFE_LATEX.test(latex)) return <code key={i} dir="ltr">{latex}</code>
    return <math-span key={i} dir="ltr">{latex}</math-span>
  })
}

// D118: qbank's graph token, drawn by qbank's own renderer into an <img> (an SVG image runs no script)
function Graph({ token }) {
  const { t } = useTranslation()
  const [src, setSrc] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let on = true
    graphImage(token).then((u) => { if (!on) return; if (u) setSrc(u); else setFailed(true) }).catch(() => on && setFailed(true))
    return () => { on = false }
  }, [token])
  if (failed) return <span className="text-content-muted" data-qb-graph="unreadable">[{t('qbed.graph_unreadable')}]</span>
  if (!src) return <span className="text-content-muted" data-qb-graph="loading">…</span>
  return <img src={src} alt={t('qbed.graph')} data-qb-graph="drawn" className="my-2 block max-w-full" />
}

function Text({ text, ready }) {
  const parts = String(text).split(/(\[\[qmx-graph:[A-Za-z0-9_-]{10,60000}\]\])/g).filter(Boolean)
  return parts.map((p, i) => p.startsWith('[[qmx-graph:') ? <Graph key={i} token={p} /> : <Maths key={i} text={p} ready={ready} />)
}

function Node({ n, ready, media }) {
  if (n.text !== undefined) return <Text text={n.text} ready={ready} />
  const kids = n.children.map((c, i) => <Node key={i} n={c} ready={ready} media={media} />)
  const a = n.attrs
  switch (n.tag) {
    case 'img': {
      const src = media.get(a.media)
      if (!src) return null
      const margin = { left: '0 auto 0 0', center: '0 auto', right: '0 0 0 auto' }[a.align] ?? '0 auto'
      return <img src={src} alt="" className="my-1 max-w-full" style={{ display: 'block', width: `${a.width ?? 100}%`, margin }} />
    }
    case 'br': return <br />
    case 'span': return <span style={{ color: a.color, backgroundColor: a.bg }}>{kids}</span>
    case 'div': return <div dir={a.dir} className={ALIGN[a.align] ?? ''}>{kids}</div>
    case 'ol':
    case 'ul': {
      const List = n.tag
      return <List className="list-inside" style={{ listStyleType: LIST_STYLE[a.list] ?? (n.tag === 'ol' ? 'decimal' : 'disc') }}>{kids}</List>
    }
    case 'dt': return <dt className="font-semibold">{kids}</dt>
    case 'mark': return <mark className="bg-secondary-soft text-content">{kids}</mark>
    case 'table': {
      const margin = { left: { marginInlineEnd: 'auto' }, center: { marginInline: 'auto' }, right: { marginInlineStart: 'auto' } }[a.align] ?? { marginInline: 'auto' }
      return <table className={`my-1 border-collapse ${a.striped ? '[&_tbody_tr:nth-child(even)]:bg-surface-muted' : ''}`} style={{ width: TABLE_WIDTH[a.width] ?? '100%', ...margin }}>{kids}</table>
    }
    case 'caption': return <caption className="caption-top p-2 text-start text-sm font-semibold">{kids}</caption>
    case 'th': return <th dir={a.dir} colSpan={a.colspan} rowSpan={a.rowspan} className={`${CELL} ${CELL_SPACING[a.spacing] ?? CELL_SPACING.normal} font-semibold`}>{kids}</th>
    case 'td': return <td dir={a.dir} colSpan={a.colspan} rowSpan={a.rowspan} className={`${CELL} ${CELL_SPACING[a.spacing] ?? CELL_SPACING.normal}`}>{kids}</td>
    default: {
      const Tag = n.tag   // strong em u s sup sub ol ul li dl dd thead tbody tr - all from the allowlist in richText.js
      return <Tag>{kids}</Tag>
    }
  }
}

export default function MathText({ text, className = '', media = [] }) {
  const [ready, setReady] = useState(false)
  const mediaById = new Map(media.filter((item) => item?.id != null && typeof item.url === 'string').map((item) => [String(item.id), item.url]))
  useEffect(() => { let on = true; loadMathlive().then(() => on && setReady(true)).catch(() => {}); return () => { on = false } }, [])
  return (
    <span dir="auto" className={`whitespace-pre-wrap ${className}`}>
      {parseRich(text).map((n, i) => <Node key={i} n={n} ready={ready} media={mediaById} />)}
    </span>
  )
}
