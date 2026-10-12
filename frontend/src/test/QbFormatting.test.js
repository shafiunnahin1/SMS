import { describe, it, expect } from 'vitest'
import { applyAlign, applyCase, applyFormat, applyList, clearFormat, createTableCells, insertPicture, insertTable, mathRegionAt, mergeTableCells, splitTableCell } from '../features/qb/formatting'

// D72 (QB.12): qbank's ribbon actions write qbank's vocabulary; inside maths they write LaTeX.
describe('ribbon actions', () => {
  it('wraps the selection, or LaTeX inside maths', () => {
    expect(applyFormat('H2O', 1, 2, 'subscript')).toEqual({ value: 'H<sub>2</sub>O', start: 1, end: 13 })
    expect(applyFormat('a $x+y$ b', 3, 4, 'bold').value).toBe('a $\\boldsymbol{x}+y$ b')
    expect(applyFormat('blue', 0, 4, 'text-color', '#FF0000').value).toBe('<span data-qmx-color="#ff0000">blue</span>')
    expect(applyFormat('blue', 0, 4, 'text-color', 'red;x').value).toBe('<span data-qmx-color="#2563eb">blue</span>')
    expect(applyFormat('none', 2, 2, 'bold').value).toBe('none')
    expect(mathRegionAt('\\(a\\) b', 2, 3)).toEqual({ bodyStart: 2, bodyEnd: 3 })
  })

  it('changes case outside tags only, makes lists, aligns and clears', () => {
    expect(applyCase('<strong>hello</strong> world', 0, 28, 'upper').value).toBe('<strong>HELLO</strong> WORLD')
    expect(applyCase('HELLO. WORLD', 0, 12, 'sentence').value).toBe('Hello. World')
    expect(applyList('- one\n- two', 0, 11, 'ol', 'upper-roman').value).toBe('<ol class="qmx-list-upper-roman"><li>one</li><li>two</li></ol>')
    expect(applyList('a - b\nc\nd', 0, 9, 'dl').value).toBe('<dl><dt>a</dt><dd>b</dd><dt>c</dt><dd>d</dd></dl>')
    expect(applyAlign('x', 0, 1, 'center').value).toBe('<div class="qmx-align-center">x</div>')
    expect(clearFormat('<strong>x</strong>y', 0, 18).value).toBe('xy')
    expect(insertTable('', 0, 0, { rows: 2, cols: 2 }).value).toBe('<table class="qmx-table qmx-table-grid qmx-table-width-100 qmx-table-align-center qmx-table-normal"><tbody><tr><th dir="auto"></th><th dir="auto"></th></tr><tr><td dir="auto"></td><td dir="auto"></td></tr></tbody></table>')
    expect(insertTable('', 0, 0, { rows: 1, cols: 1, caption: '<img src=x onerror=alert(1)>' }).value)
      .toContain('<caption>&lt;img src=x onerror=alert(1)&gt;</caption>')
  })

  it('merges rectangular cells without losing text and splits them back safely', () => {
    const cells = createTableCells(2, 3)
    cells[0][0].text = '<img src=x onerror=alert(1)>'
    expect(mergeTableCells(cells, [[0, 0], [0, 1]])[0][0]).toMatchObject({ rowspan: 1, colspan: 2 })
    expect(mergeTableCells(cells, [[0, 0], [1, 1]])).toBeNull()
    cells[0][1].text = 'kept'
    const merged = mergeTableCells(cells, [[0, 0], [0, 1]])
    expect(merged[0][0].text).toBe('<img src=x onerror=alert(1)>\nkept')
    expect(merged[0][1].mergedInto).toBe('0:0')
    const html = insertTable('', 0, 0, { rows: 2, cols: 3, cells: merged }).value
    expect(html).toContain('<th dir="auto" colspan="2">&lt;img src=x onerror=alert(1)&gt;<br>kept</th>')
    expect(html).not.toContain('<img')
    expect(splitTableCell(merged, 0, 0)[0][0]).toMatchObject({ text: '<img src=x onerror=alert(1)>', colspan: 1, rowspan: 1 })
    expect(splitTableCell(merged, 0, 0)[0][1]).toMatchObject({ text: 'kept', mergedInto: null, colspan: 1, rowspan: 1 })
    expect(splitTableCell(merged, 0, 1)).toBeNull()
  })

  it('inserts only bounded picture references, never a source URL', () => {
    expect(insertPicture('ab', 1, 1, 42, { width: 50, align: 'right' }).value)
      .toBe('a<img data-qmx-media="42" data-qmx-width="50" data-qmx-align="right">b')
    expect(insertPicture('text', 0, 4, 0).value).toBe('text')
    expect(insertPicture('text', 0, 4, 42, { width: 1, align: 'side' }).value)
      .toBe('<img data-qmx-media="42" data-qmx-width="100" data-qmx-align="center">')
    const picture = '<img data-qmx-media="9" data-qmx-width="100" data-qmx-align="center">'
    expect(insertPicture('<div>one</div><div>two</div>', 0, 0, 9, { position: 'after', paragraph: 1 }).value)
      .toBe(`<div>one</div>${picture}<div>two</div>`)
    expect(insertPicture('one\ntwo', 0, 0, 9, { position: 'after', paragraph: 2 }).value).toBe(`one\ntwo${picture}`)
    expect(insertPicture('one\ntwo', 0, 0, 9, { position: 'start' }).value).toBe(`${picture}one\ntwo`)
    expect(insertPicture('one\ntwo', 0, 0, 9, { position: 'end' }).value).toBe(`one\ntwo${picture}`)
    expect(insertPicture('one', 0, 0, 9, { position: 'after', paragraph: 4 }).value).toBe(`one${picture}`)
  })

  it('serializes only the approved table layout choices and header column', () => {
    const html = insertTable('', 0, 0, { rows: 2, cols: 2, headerColumn: true, striped: true, width: '75', align: 'right', spacing: 'comfortable' }).value
    expect(html).toContain('class="qmx-table qmx-table-grid qmx-table-width-75 qmx-table-align-right qmx-table-comfortable qmx-table-striped"')
    expect(html).toContain('<tr><th dir="auto"></th><td dir="auto"></td></tr>')
    expect(html).toContain('<tr><th dir="auto"></th><td dir="auto"></td></tr>')
    expect(insertTable('', 0, 0, { rows: 1, cols: 1, width: '400', align: 'start', spacing: 'loose' }).value)
      .toContain('qmx-table-width-100 qmx-table-align-center qmx-table-normal')
  })
})
