import { createContext, useContext } from 'react'

// D181 QBO.3: in the paper preview a question's own pictures, tables, graphs and diagrams can be picked and laid out for this paper
// and set only - alignment (left / centre / right, or floated to a side with text around it), a bounded size (10-100% of the line;
// pictures, graphs and diagrams keep their proportions, a table changes its width) and a border (off or 1-3 pt in the text colour).
// Nothing reaches the question bank: the choices live with the paper's other preview settings in this browser.
export const PaperObjectsContext = createContext(null)
export const OBJECT_ALIGNS = ['left', 'center', 'right', 'float-start', 'float-end']
export const OBJECT_BORDERS = [0, 1, 2, 3]

/** a stable id for the n-th object of a kind inside one field of one question (the preview's MathText scope) */
export const objectId = (scope, kind, n) => `${scope}|${kind}${n}`

/** the outer / inner styles of a laid-out object (null: no choice made - the question's own rendering stays as it is) */
export function objectStyles(layout) {
  if (!layout || (!layout.align && !layout.width && !layout.border)) return null
  const width = Math.min(100, Math.max(10, Number(layout.width) || 100))
  const float = layout.align === 'float-start' ? 'inline-start' : layout.align === 'float-end' ? 'inline-end' : null
  const outer = float ? { float, width: `${width}%`, margin: '0.25rem 0.75rem' } : { display: 'block', textAlign: layout.align === 'left' ? 'start' : layout.align === 'right' ? 'end' : 'center' }
  const inner = { display: float ? 'block' : 'inline-block', width: float ? '100%' : `${width}%`, maxWidth: '100%', boxSizing: 'border-box',
    border: layout.border ? `${layout.border}pt solid currentColor` : undefined, verticalAlign: 'top' }
  return { outer, inner }
}

/** wraps one object: clicking it picks it in the preview; with a layout choice it takes that alignment, size and border */
export function PaperObject({ id, kind, children }) {
  const ctx = useContext(PaperObjectsContext)
  if (!ctx || !id) return children
  const styles = objectStyles(ctx.layout[id])
  const pick = (event) => { event.stopPropagation(); ctx.select({ id, kind }) }
  const selected = ctx.selected?.id === id
  const cls = `qb-object${selected ? ' qb-object-selected' : ''}${styles ? ' qb-object-sized' : ''}`
  if (!styles) return <span className={cls} style={{ display: 'contents' }} data-qb-object={id} data-kind={kind} onClick={pick}>{children}</span>
  return (
    <span className={cls} style={styles.outer} data-qb-object={id} data-kind={kind} onClick={pick}>
      <span className="qb-object-inner" style={styles.inner}>{children}</span>
    </span>
  )
}

export const usePaperObjects = () => useContext(PaperObjectsContext)
