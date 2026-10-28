import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import '../i18n'
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

  it('renders only a matching question media id with bounded placement', () => {
    const { container } = render(<MathText media={[{ id: 42, url: '/storage/question.png' }]} text={'<img data-qmx-media="42" data-qmx-width="50" data-qmx-align="right" src="https://evil.test/x.png" onerror="alert(1)"><img data-qmx-media="43">'} />)
    const image = container.querySelector('img')
    expect(image).toHaveAttribute('src', '/storage/question.png')
    expect(image).toHaveAttribute('alt', '')
    expect(image.style.width).toBe('50%')
    expect(image.style.margin).toBe('0px 0px 0px auto')
    expect(container.querySelectorAll('img')).toHaveLength(1)
    expect(image).not.toHaveAttribute('onerror')
  })

  it('opens the supplied picture action from a preview image click', () => {
    const onImageClick = vi.fn()
    render(<MathText media={[{ id: 42, url: '/storage/question.png' }]} onImageClick={onImageClick} text={'<img data-qmx-media="42" data-qmx-width="55" data-qmx-align="right">'} />)
    fireEvent.click(screen.getByRole('button', { name: 'ছবির সেটিংস খুলুন' }))
    expect(onImageClick).toHaveBeenCalledWith({ media: '42', width: 55, align: 'right' })
  })

  it('renders only allowlisted table layout classes as semantic styles', () => {
    const { container } = render(<MathText text={'<table class="qmx-table-width-75 qmx-table-align-right qmx-table-comfortable qmx-table-striped evil"><tbody><tr><th>শিরোনাম</th></tr></tbody></table>'} />)
    const table = container.querySelector('table')
    expect(table.style.width).toBe('75%')
    expect(table.style.marginInlineStart).toBe('auto')
    expect(table).toHaveClass('[&_tbody_tr:nth-child(even)]:bg-surface-muted')
    expect(container.querySelector('th')).toHaveClass('px-3', 'py-2')
  })

  it('only honors bounded print font sizes when the preview explicitly enables them', () => {
    const text = '<span data-qbp-font-size="19">Large</span><span data-qbp-font-size="4">Too small</span><span data-qbp-font-size="65">Too large</span>'
    const regular = render(<MathText text={text} />)
    expect(regular.container.querySelector('[style*="font-size"]')).toBeNull()
    expect(regular.container.textContent).toBe('LargeToo smallToo large')

    const preview = render(<MathText text={text} allowPreviewFontSize />)
    expect(preview.container.querySelector('[data-qb-rich-text] > span').style.fontSize).toBe('19pt')
    expect(preview.container.querySelector('span[style*="4pt"]')).toBeNull()
    expect(preview.container.querySelector('span[style*="65pt"]')).toHaveTextContent('Too large')
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
