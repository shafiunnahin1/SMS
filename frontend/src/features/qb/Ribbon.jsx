import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Baseline, Bold, CaseLower, CaseSensitive, CaseUpper, Highlighter, ImagePlus, IndentIncrease,
  Italic, List, ListOrdered, ListTree, PaintBucket, RemoveFormatting, RotateCcw, Save, Strikethrough, Subscript, Superscript, Table, Underline } from 'lucide-react'
import Button from '../../components/Button'
import Modal from '../../ui/variants/Modal'
import { Input, Select } from '../../components/FormField'
import Check from '../academic/Check'
import MathInsert from './MathInsert'
import { DEFAULT_BG_COLOR, DEFAULT_TEXT_COLOR, LIST_STYLES, applyAlign, applyCase, applyFormat, applyList, clearFormat, createTableCells, insertAt, insertTab, insertTable, mergeTableCells, splitTableCell } from './formatting'

const keep = (e) => e.preventDefault()   // a ribbon click must not take the focus (and the selection) away from the text field

function Tool({ label, onClick, children, ...rest }) {
  return (
    <button type="button" title={label} aria-label={label} onMouseDown={keep} onClick={onClick}
      className="inline-flex h-9 min-w-9 items-center justify-center rounded-token px-2 text-sm text-content hover:bg-primary-soft disabled:opacity-50" {...rest}>
      {children}
    </button>
  )
}
const Sep = () => <span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />

// D72 (QB.12): qbank's editor ribbon. Every action works on the text field the writer was last in (run(fn, ...args) on the page
// applies it to that field's value and selection); maths, pictures, save and reset are the page's own actions.
export default function Ribbon({ run, onImage, onReset, disabled, saving }) {
  const { t } = useTranslation()
  const [ul, setUl] = useState(LIST_STYLES.ul[0])
  const [ol, setOl] = useState(LIST_STYLES.ol[0])
  const [table, setTable] = useState(null)
  const fmt = (f, c) => () => run(applyFormat, f, c)
  const selectedCells = table?.selected.map((point) => point.split(':').map(Number)) ?? []
  const mergedCells = table ? mergeTableCells(table.cells, selectedCells) : null
  const splitPoint = selectedCells.length === 1 ? selectedCells[0] : null
  const splitCandidate = splitPoint ? table.cells[splitPoint[0]]?.[splitPoint[1]] : null
  const canSplit = Boolean(splitCandidate && !splitCandidate.mergedInto && (splitCandidate.rowspan > 1 || splitCandidate.colspan > 1))
  const resizeTable = (key, value) => setTable((current) => {
    const next = { ...current, [key]: value }
    next.cells = createTableCells(next.rows, next.cols, current.cells)
    next.selected = []
    return next
  })
  const toggleTableCell = (row, col, checked) => setTable((current) => {
    const point = `${row}:${col}`
    return { ...current, selected: checked ? [...new Set([...current.selected, point])] : current.selected.filter((item) => item !== point) }
  })
  return (
    <div role="toolbar" aria-label={t('qbed.ribbon')} data-testid="qb-ribbon"
      className="sticky top-0 z-10 flex flex-wrap items-center gap-1 rounded-token bg-surface p-2 shadow-card [border:1px_solid_var(--line)]">
      <fieldset disabled={disabled} className="contents">
        <Button type="submit" form="qb-question-form" loading={saving} data-action="save" aria-label={t('common.save')}><Save aria-hidden="true" className="h-4 w-4" /></Button>
        <Sep />
        <Tool label={t('qbed.bold')} onClick={fmt('bold')} data-format="bold"><Bold aria-hidden="true" className="h-4 w-4" /></Tool>
        <Tool label={t('qbed.italic')} onClick={fmt('italic')} data-format="italic"><Italic aria-hidden="true" className="h-4 w-4" /></Tool>
        <Tool label={t('qbed.underline')} onClick={fmt('underline')} data-format="underline"><Underline aria-hidden="true" className="h-4 w-4" /></Tool>
        <Tool label={t('qbed.strike')} onClick={fmt('strike')} data-format="strike"><Strikethrough aria-hidden="true" className="h-4 w-4" /></Tool>
        <Tool label={t('qbed.superscript')} onClick={fmt('superscript')} data-format="superscript"><Superscript aria-hidden="true" className="h-4 w-4" /></Tool>
        <Tool label={t('qbed.subscript')} onClick={fmt('subscript')} data-format="subscript"><Subscript aria-hidden="true" className="h-4 w-4" /></Tool>
        <Sep />
        <Tool label={t('qbed.upper')} onClick={() => run(applyCase, 'upper')}><CaseUpper aria-hidden="true" className="h-4 w-4" /></Tool>
        <Tool label={t('qbed.lower')} onClick={() => run(applyCase, 'lower')}><CaseLower aria-hidden="true" className="h-4 w-4" /></Tool>
        <Tool label={t('qbed.sentence')} onClick={() => run(applyCase, 'sentence')}><CaseSensitive aria-hidden="true" className="h-4 w-4" /></Tool>
        <Sep />
        <Tool label={t('qbed.bullets')} onClick={() => run(applyList, 'ul', ul)} data-block="ul"><List aria-hidden="true" className="h-4 w-4" /></Tool>
        <select aria-label={t('qbed.bullet_style')} value={ul} onChange={e => setUl(e.target.value)} className="h-9 rounded-token bg-surface px-1 text-sm [border:1px_solid_var(--line)]">
          {LIST_STYLES.ul.map(s => <option key={s} value={s}>{t(`qbed.styles.${s}`)}</option>)}
        </select>
        <Tool label={t('qbed.numbers')} onClick={() => run(applyList, 'ol', ol)} data-block="ol"><ListOrdered aria-hidden="true" className="h-4 w-4" /></Tool>
        <select aria-label={t('qbed.number_style')} value={ol} onChange={e => setOl(e.target.value)} className="h-9 rounded-token bg-surface px-1 text-sm [border:1px_solid_var(--line)]">
          {LIST_STYLES.ol.map(s => <option key={s} value={s}>{t(`qbed.styles.${s}`)}</option>)}
        </select>
        <Tool label={t('qbed.description_list')} onClick={() => run(applyList, 'dl')}><ListTree aria-hidden="true" className="h-4 w-4" /></Tool>
        <Tool label={t('qbed.tab')} onClick={() => run(insertTab)}><IndentIncrease aria-hidden="true" className="h-4 w-4" /></Tool>
        <Sep />
        <Tool label={t('qbed.align_left')} onClick={() => run(applyAlign, 'left')}><AlignLeft aria-hidden="true" className="h-4 w-4" /></Tool>
        <Tool label={t('qbed.align_center')} onClick={() => run(applyAlign, 'center')} data-block="center"><AlignCenter aria-hidden="true" className="h-4 w-4" /></Tool>
        <Tool label={t('qbed.align_right')} onClick={() => run(applyAlign, 'right')}><AlignRight aria-hidden="true" className="h-4 w-4" /></Tool>
        <Tool label={t('qbed.justify')} onClick={() => run(applyAlign, 'justify')}><AlignJustify aria-hidden="true" className="h-4 w-4" /></Tool>
        <Sep />
        <Tool label={t('qbed.highlight')} onClick={fmt('highlight')}><Highlighter aria-hidden="true" className="h-4 w-4" /></Tool>
        <label className="inline-flex h-9 items-center gap-1 rounded-token px-2 text-sm hover:bg-primary-soft" title={t('qbed.text_color')}>
          <Baseline aria-hidden="true" className="h-4 w-4" /><span className="sr-only">{t('qbed.text_color')}</span>
          <input type="color" defaultValue={DEFAULT_TEXT_COLOR} onMouseDown={keep} onChange={e => run(applyFormat, 'text-color', e.target.value)} className="h-6 w-6 cursor-pointer bg-transparent" data-format="text-color" />
        </label>
        <label className="inline-flex h-9 items-center gap-1 rounded-token px-2 text-sm hover:bg-primary-soft" title={t('qbed.background_color')}>
          <PaintBucket aria-hidden="true" className="h-4 w-4" /><span className="sr-only">{t('qbed.background_color')}</span>
          <input type="color" defaultValue={DEFAULT_BG_COLOR} onMouseDown={keep} onChange={e => run(applyFormat, 'background', e.target.value)} className="h-6 w-6 cursor-pointer bg-transparent" />
        </label>
        <Tool label={t('qbed.clear')} onClick={() => run(clearFormat)}><RemoveFormatting aria-hidden="true" className="h-4 w-4" /></Tool>
        <Sep />
        <Tool label={t('qbed.table')} onClick={() => setTable({ rows: '3', cols: '2', header: true, style: 'grid', caption: '', cells: createTableCells(3, 2), selected: [] })} data-action="table"><Table aria-hidden="true" className="h-4 w-4" /></Tool>
        <label className="inline-flex h-9 cursor-pointer items-center rounded-token px-2 hover:bg-primary-soft" title={t('qbed.image')}>
          <ImagePlus aria-hidden="true" className="h-4 w-4" /><span className="sr-only">{t('qbed.image')}</span>
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onImage} name="picture" className="sr-only" />
        </label>
        <MathInsert onInsert={(snippet) => run(insertAt, snippet)} disabled={disabled} compact />
        <Tool label={t('qbed.reset')} onClick={onReset} data-action="reset"><RotateCcw aria-hidden="true" className="h-4 w-4" /></Tool>
      </fieldset>
      {table && (
        <Modal open onClose={() => setTable(null)} title={t('qbed.table')}>
          <div className="grid gap-3 sm:grid-cols-2" data-testid="table-dialog">
            <Input label={t('qbed.rows')} ltr inputMode="numeric" value={table.rows} onChange={e => resizeTable('rows', e.target.value)} name="rows" />
            <Input label={t('qbed.cols')} ltr inputMode="numeric" value={table.cols} onChange={e => resizeTable('cols', e.target.value)} name="cols" />
            <Input className="sm:col-span-2" label={t('qbed.caption')} value={table.caption} onChange={e => setTable({ ...table, caption: e.target.value })} name="caption" />
            <Select label={t('qbed.table_style')} value={table.style} onChange={e => setTable({ ...table, style: e.target.value })}
              options={['grid', 'horizontal', 'none'].map(s => ({ value: s, label: t(`qbed.table_styles.${s}`) }))} />
            <Check label={t('qbed.header_row')} checked={table.header} onChange={e => setTable({ ...table, header: e.target.checked })} />
            <div className="space-y-2 sm:col-span-2">
              <div className="flex gap-2">
                <Button variant="secondary" disabled={!mergedCells} onClick={() => {
                  const cells = mergeTableCells(table.cells, selectedCells)
                  if (cells) setTable({ ...table, cells, selected: [] })
                }} data-action="table-merge">{t('qbed.merge_cells')}</Button>
                <Button variant="secondary" disabled={!canSplit} onClick={() => {
                  const cells = splitTableCell(table.cells, splitPoint[0], splitPoint[1])
                  if (cells) setTable({ ...table, cells, selected: [] })
                }} data-action="table-split">{t('qbed.split_cell')}</Button>
              </div>
              <div className="overflow-auto" data-testid="table-cell-grid">
                <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${table.cells[0].length}, minmax(9rem, 1fr))` }}>
                  {table.cells.flatMap((line, row) => line.map((cell, col) => {
                    if (cell.mergedInto) return null
                    const point = `${row}:${col}`
                    const label = t('qbed.table_cell', { row: row + 1, col: col + 1 })
                    return (
                      <div key={point} className="min-w-0 space-y-1" style={{ gridColumn: `${col + 1} / span ${cell.colspan}`, gridRow: `${row + 1} / span ${cell.rowspan}` }}>
                        <label className="flex items-center gap-2 text-xs text-muted">
                          <input type="checkbox" checked={table.selected.includes(point)} onChange={e => toggleTableCell(row, col, e.target.checked)} data-testid={`table-cell-select-${row}-${col}`} />
                          {label}
                        </label>
                        <textarea aria-label={label} rows={2} value={cell.text} onChange={e => setTable(current => ({ ...current, cells: current.cells.map((cellsRow, currentRow) => cellsRow.map((item, currentCol) => currentRow === row && currentCol === col ? { ...item, text: e.target.value } : item)) }))}
                          className="w-full rounded-token bg-surface p-2 text-sm [border:1px_solid_var(--line)]" data-testid={`table-cell-${row}-${col}`} />
                      </div>
                    )
                  }))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button variant="secondary" onClick={() => setTable(null)}>{t('common.cancel')}</Button>
              <Button onClick={() => { run(insertTable, table); setTable(null) }} data-action="table-insert">{t('qb.insert')}</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
