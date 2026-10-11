import { useEffect, useState } from 'react'
import { loadMathlive, UNSAFE_LATEX } from './mathlive'

// Question text with inline maths between $...$ (D66 QB.3). Plain text stays React text (escaped); each $...$ piece goes to
// mathlive's <math-span>, which reads it as TEXT and draws it - no HTML string is ever injected.
export default function MathText({ text, className = '' }) {
  const [ready, setReady] = useState(false)
  useEffect(() => { let on = true; loadMathlive().then(() => on && setReady(true)).catch(() => {}); return () => { on = false } }, [])
  const parts = String(text ?? '').split(/(\$[^$]+\$)/g).filter(Boolean)
  return (
    <span dir="auto" className={`whitespace-pre-wrap ${className}`}>
      {parts.map((p, i) => {
        const latex = p.startsWith('$') && p.endsWith('$') && p.length > 2 ? p.slice(1, -1) : null
        if (latex === null) return <span key={i}>{p}</span>
        if (!ready || UNSAFE_LATEX.test(latex)) return <code key={i} dir="ltr">{latex}</code>
        return <math-span key={i} dir="ltr">{latex}</math-span>
      })}
    </span>
  )
}
