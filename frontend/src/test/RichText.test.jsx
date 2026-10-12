import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import MathText from '../features/qb/MathText'
import { parseRich, plainText } from '../features/qb/richText'

// D72 (QB.12): qbank's vocabulary renders as elements; anything else never reaches the page.
describe('rich question text', () => {
  it('renders the vocabulary', () => {
    const { container } = render(<MathText text={'H<sub>2</sub>O <strong>কী</strong> <span data-qmx-color="#2563eb">নীল</span><ol class="qmx-list-upper-roman"><li>এক</li></ol><div class="qmx-align-center">মাঝ</div>'} />)
    expect(container.querySelector('sub').textContent).toBe('2')
    expect(container.querySelector('strong').textContent).toBe('কী')
    expect(container.querySelector('span[style]').style.color).toBe('rgb(37, 99, 235)')
    expect(container.querySelector('ol').style.listStyleType).toBe('upper-roman')
    expect(container.querySelector('div.text-center').textContent).toBe('মাঝ')
  })

  it('renders a sanitized table caption', () => {
    const { container } = render(<MathText text={'<table><caption onclick="alert(1)">তথ্য সারণি</caption><tbody><tr><td>১</td></tr></tbody></table>'} />)
    const caption = container.querySelector('table caption')
    expect(caption.textContent).toBe('তথ্য সারণি')
    expect(caption).not.toHaveAttribute('onclick')
  })

  it('drops scripts, handlers, links and bad colours', () => {
    const { container } = render(<MathText text={'a<script>alert(1)</script><img src=x onerror="alert(1)"><a href="javascript:x()">link</a><b onclick="x()">b</b><span data-qmx-color="red;x">c</span><style>*{}</style>'} />)
    expect(container.querySelector('script, img, a, style, [onclick], [onerror]')).toBeNull()
    expect(container.textContent).toBe('alinkbc')
    expect(container.querySelector('span[style]')).toBeNull()
  })

  it('keeps escaped markup as text and plain text unchanged', () => {
    expect(parseRich('2 &lt; 3 &amp; <i>x</i>')).toEqual([{ text: '2 < 3 & ' }, { tag: 'em', attrs: {}, children: [{ text: 'x' }] }])
    expect(parseRich('just text')).toEqual([{ text: 'just text' }])
    expect(plainText('<strong>বল</strong> কাকে<ol><li>এক</li><li>দুই</li></ol>')).toBe('বল কাকে\nএক\nদুই')
  })
})
