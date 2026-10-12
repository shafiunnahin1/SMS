import { useEffect, useState } from 'react'
import { loadMathlive, UNSAFE_LATEX } from './mathlive'
import { parseRich } from './richText'

// Question text with inline maths ($...$ or qbank's \( ... \)) and, since D72 (QB.12), qbank's formatting vocabulary. The text is
// read into allowlisted nodes (richText.js) and built as React elements - plain text stays React text (escaped); each maths piece
// goes to mathlive's <math-span>, which reads it as TEXT and draws it. No HTML string is ever injected.
const LIST_STYLE = { disc: 'disc', circle: 'circle', square: 'square', decimal: 'decimal', 'lower-alpha': 'lower-alpha', 'upper-alpha': 'upper-alpha',
  'lower-roman': 'lower-roman', 'upper-roman': 'upper-roman', 'bengali-number': 'bengali', 'bengali-letter': 'bengali' }
const ALIGN = { left: 'text-start', right: 'text-end', center: 'text-center', justify: 'text-justify' }
const CELL = 'px-2 py-1 align-top [border:1px_solid_var(--line)]'

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

function Node({ n, ready }) {
  if (n.text !== undefined) return <Maths text={n.text} ready={ready} />
  const kids = n.children.map((c, i) => <Node key={i} n={c} ready={ready} />)
  const a = n.attrs
  switch (n.tag) {
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
    case 'table': return <table className="my-1 border-collapse">{kids}</table>
    case 'th': return <th dir={a.dir} colSpan={a.colspan} rowSpan={a.rowspan} className={`${CELL} font-semibold`}>{kids}</th>
    case 'td': return <td dir={a.dir} colSpan={a.colspan} rowSpan={a.rowspan} className={CELL}>{kids}</td>
    default: {
      const Tag = n.tag   // strong em u s sup sub ol ul li dl dd thead tbody tr - all from the allowlist in richText.js
      return <Tag>{kids}</Tag>
    }
  }
}

export default function MathText({ text, className = '' }) {
  const [ready, setReady] = useState(false)
  useEffect(() => { let on = true; loadMathlive().then(() => on && setReady(true)).catch(() => {}); return () => { on = false } }, [])
  return (
    <span dir="auto" className={`whitespace-pre-wrap ${className}`}>
      {parseRich(text).map((n, i) => <Node key={i} n={n} ready={ready} />)}
    </span>
  )
}
