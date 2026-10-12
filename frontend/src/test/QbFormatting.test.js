import { describe, it, expect } from 'vitest'
import { applyAlign, applyCase, applyFormat, applyList, clearFormat, insertTable, mathRegionAt } from '../features/qb/formatting'

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
    expect(insertTable('', 0, 0, { rows: 2, cols: 2 }).value).toBe('<table class="qmx-table qmx-table-grid qmx-table-width-100"><tbody><tr><th dir="auto"></th><th dir="auto"></th></tr><tr><td dir="auto"></td><td dir="auto"></td></tr></tbody></table>')
    expect(insertTable('', 0, 0, { rows: 1, cols: 1, caption: '<img src=x onerror=alert(1)>' }).value)
      .toContain('<caption>&lt;img src=x onerror=alert(1)&gt;</caption>')
  })
})
