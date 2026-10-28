import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '../i18n'
import api from '../api/axios'
import QbPaperPreview from '../pages/qb/QbPaperPreview'
import { downloadPaperJpg, downloadPaperPdf } from '../features/qb/paperImage'
import { applyPreviewFontSize, optionColumnCount, resetPreviewFontSize } from '../features/qb/paperOptions'

vi.mock('../features/qb/paperImage', () => ({ downloadPaperJpg: vi.fn(() => Promise.resolve()), downloadPaperPdf: vi.fn(() => Promise.resolve()), paperDimensions: vi.fn((size = 'A4', orientation = 'portrait') => {
  const papers = { A4: { width: 210, height: 297, widthPt: 595.28, heightPt: 841.89 }, A5: { width: 148, height: 210, widthPt: 419.53, heightPt: 595.28 }, Letter: { width: 215.9, height: 279.4, widthPt: 612, heightPt: 792 }, Legal: { width: 215.9, height: 355.6, widthPt: 612, heightPt: 1008 } }
  const paper = papers[size] ?? papers.A4
  return orientation === 'landscape' ? { width: paper.height, height: paper.width, widthPt: paper.heightPt, heightPt: paper.widthPt } : paper
}) }))
vi.mock('../api/axios', () => ({ default: { get: vi.fn() }, bindAuthStore: () => {} }))

const mcq = (no, text) => ({ no, marks: '1.00', subject: null, question: { id: 100 + no, question_text: text, media: [], answer_text: 'x', explanation_text: `why ${no}`,
  options: [{ label: 'ক', content_text: 'one', is_correct: true }, { label: 'খ', content_text: 'two', is_correct: false }] } })
const PAPER = { id: 7, title: 'Weekly test', exam_name: '', duration_minutes: 30, total_marks: '3.00', instructions: 'Read carefully', set: 'A', set_code: 'A', sets_count: 2,
  institution: 'Demo School', answers: true, media: [], answer_key: [],
  sections: [{ title: 'MCQ', instruction: null, items: [mcq(1, 'First?'), mcq(2, 'Second?')] }, { title: 'Written', instruction: null, items: [mcq(3, 'Third?')] }] }

function renderPage(data = PAPER) {
  api.get.mockResolvedValue({ data: { data } })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/admin/question-bank/papers/7/preview?set=A']}>
    <Routes><Route path="/admin/question-bank/papers/:id/preview" element={<QbPaperPreview />} /></Routes></MemoryRouter></QueryClientProvider>)
}

describe('D133 paper print preview', () => {
  it('chooses option columns from displayed content and honors explicit overrides', () => {
    expect(optionColumnCount(['short', '123456789012'])).toBe(4)
    expect(optionColumnCount(['1234567890123'])).toBe(2)
    expect(optionColumnCount(['1234567890123456789012345678901'])).toBe(1)
    expect(optionColumnCount(['$$x^2 + 1$$'])).toBe(1)
    expect(optionColumnCount(['<table><tr><td>x</td></tr></table>'])).toBe(1)
    expect(optionColumnCount(['<img data-qmx-media="9">'])).toBe(2)
    expect(optionColumnCount(['short'], '2')).toBe(2)
    expect(optionColumnCount(['short'], '4')).toBe(4)
  })

  it('wraps only an exact selected source substring in a bounded preview font size', () => {
    const source = 'Use $x+2$ and 2 &lt; 3.'
    const sized = applyPreviewFontSize(source, 'x+2', 19)
    expect(sized).toBe('Use $<span data-qbp-font-size="19">x+2</span>$ and 2 &lt; 3.')
    expect(resetPreviewFontSize(sized, 'x+2')).toBe(source)
    expect(applyPreviewFontSize(source, '<', 5)).toContain('<span data-qbp-font-size="5">&lt;</span>')
    expect(applyPreviewFontSize(source, 'missing', 12)).toBeNull()
    expect(applyPreviewFontSize(source, 'x+2', 4)).toBeNull()
    expect(applyPreviewFontSize(source, 'x+2', 842)).toContain('data-qbp-font-size="842"')
    expect(applyPreviewFontSize(source, 'x+2', 2049)).toBeNull()
  })

  it('updates an existing selected-text size instead of nesting and can reset it', () => {
    const source = 'Use $x+2$ and 2 &lt; 3.'
    const sized = applyPreviewFontSize(source, 'x+2', 15)
    const resized = applyPreviewFontSize(sized, 'x+2', 18)
    const previouslyNested = 'Use $<span data-qbp-font-size="15"><span data-qbp-font-size="18">x+2</span></span>$ and 2 &lt; 3.'

    expect(resized).toBe('Use $<span data-qbp-font-size="18">x+2</span>$ and 2 &lt; 3.')
    expect(resized.match(/data-qbp-font-size/g)).toHaveLength(1)
    expect(resetPreviewFontSize(resized, 'x+2')).toBe(source)
    expect(applyPreviewFontSize(previouslyNested, 'x+2', 20)).toBe('Use $<span data-qbp-font-size="20">x+2</span>$ and 2 &lt; 3.')
    expect(resetPreviewFontSize(previouslyNested, 'x+2')).toBe(source)
  })

  it('applies paper-wide and per-question columns and remembers page geometry', async () => {
    window.localStorage.clear()
    renderPage()
    const paper = await screen.findByTestId('qb-paper')
    const optionSelect = screen.getByRole('combobox', { name: 'অপশনের কলাম' })
    expect(screen.getAllByTestId('qb-paper-options')[0]).toHaveAttribute('data-option-columns', '4')

    fireEvent.change(optionSelect, { target: { value: '1' } })
    expect(screen.getAllByTestId('qb-paper-options').every(node => node.dataset.optionColumns === '1')).toBe(true)
    fireEvent.click(screen.getAllByRole('checkbox', { name: '১ নং প্রশ্ন বাছাই' })[0])
    fireEvent.change(screen.getByRole('combobox', { name: 'বাছাই করা প্রশ্নের কলাম' }), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'প্রয়োগ' }))
    expect(screen.getAllByTestId('qb-paper-options').map(node => node.dataset.optionColumns)).toEqual(['2', '1', '1'])

    fireEvent.change(screen.getByRole('combobox', { name: 'কাগজের মাপ' }), { target: { value: 'A5' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'পাতার দিক' }), { target: { value: 'landscape' } })
    expect(paper.style.width).toBe('210mm')
    expect(paper.style.minHeight).toBe('148mm')
    expect(JSON.parse(window.localStorage.getItem('qb-paper-preview:7:A'))).toMatchObject({ optionColumns: '1', pageSize: 'A5', orientation: 'landscape', questionColumns: { 101: '2' } })
  })

  it('changes only the selected paper text size and can reset it', async () => {
    window.localStorage.clear()
    renderPage()
    const paper = await screen.findByTestId('qb-paper')
    const richText = paper.querySelector('[data-qb-field="question_text"]')
    const range = document.createRange()
    range.selectNodeContents(richText.firstChild)
    window.getSelection().removeAllRanges()
    window.getSelection().addRange(range)
    fireEvent.mouseUp(paper)

    expect(screen.getByTestId('selected-font-text')).toHaveTextContent('First?')
    fireEvent.click(screen.getByRole('button', { name: 'লেখা বড় করুন' }))
    expect(paper.querySelector('[data-qb-field="question_text"] [style*="font-size"]')).toHaveTextContent('First?')
    expect(PAPER.sections[0].items[0].question.question_text).toBe('First?')
    expect(JSON.parse(window.localStorage.getItem('qb-paper-preview:7:A')).edits[101].question_text).toContain('data-qbp-font-size="15"')

    fireEvent.click(screen.getByRole('button', { name: 'আগের মাপ' }))
    expect(paper.querySelector('[data-qbp-font-size]')).toBeNull()
  })

  it('selects a complete MathLive formula and keeps it intact when resizing', async () => {
    window.localStorage.clear()
    const mathPaper = structuredClone(PAPER)
    mathPaper.sections[0].items[0].question.question_text = 'Formula $x+2$'
    renderPage(mathPaper)
    const paper = await screen.findByTestId('qb-paper')
    await waitFor(() => expect(paper.querySelector('math-span[data-qb-latex-source="$x+2$"]')).toBeInTheDocument())
    fireEvent.mouseUp(paper.querySelector('math-span[data-qb-latex-source="$x+2$"]'))
    expect(screen.getByTestId('selected-font-text')).toHaveTextContent('$x+2$')

    fireEvent.click(screen.getByRole('button', { name: 'লেখা বড় করুন' }))
    expect(JSON.parse(window.localStorage.getItem('qb-paper-preview:7:A')).edits[101].question_text).toContain('<span data-qbp-font-size="15">$x+2$</span>')
    await waitFor(() => expect(paper.querySelector('math-span[data-qb-latex-source="$x+2$"]')).toBeInTheDocument())
    expect(paper.querySelector('math-span[data-qb-latex-source="$x+2$"]')).toHaveAttribute('data-qb-preview-font-size', '15')

    fireEvent.click(screen.getByRole('button', { name: 'লেখা বড় করুন' }))
    expect(JSON.parse(window.localStorage.getItem('qb-paper-preview:7:A')).edits[101].question_text).toContain('<span data-qbp-font-size="16">$x+2$</span>')
    await waitFor(() => expect(paper.querySelector('math-span[data-qb-latex-source="$x+2$"]')).toHaveAttribute('data-qb-preview-font-size', '16'))
  })

  it('loads the set with answers and shows the header, answers and explanations as qbank', async () => {
    window.localStorage.clear()
    renderPage()
    const paper = await screen.findByTestId('qb-paper')
    expect(api.get).toHaveBeenCalledWith('/question-bank/papers/7/pdf', { params: { set: 'A', answers: 1, format: 'json' } })
    expect(within(paper).getByText('Demo School')).toBeInTheDocument()
    expect(screen.getByTestId('qb-paper-set')).toHaveTextContent('A')
    expect(screen.getByTestId('qb-paper-instructions')).toHaveTextContent('Read carefully')
    expect(screen.getAllByTestId('qb-paper-correct')).toHaveLength(3)
    expect(screen.getAllByTestId('qb-paper-explanation')).toHaveLength(3)
    expect(within(paper).getAllByText('ক)').length).toBeGreaterThan(0)
  })

  it('keeps sections in one column flow and paginates the paper in print', async () => {
    window.localStorage.clear()
    renderPage()
    const paper = await screen.findByTestId('qb-paper')
    const columns = within(paper).getByTestId('qb-paper-columns')
    expect(within(columns).getAllByTestId('qb-paper-section')).toHaveLength(2)
    expect(within(paper).getAllByTestId('qb-paper-page')).toHaveLength(1)                 // jsdom measures nothing: one page
    expect(within(columns).getAllByTestId('qb-paper-column')).toHaveLength(2)               // two real columns on the page

    const styles = [...document.querySelectorAll('style')].map(style => style.textContent).join('\n')
    expect(styles).toContain('@page{size:210mm 297mm;margin:0}')
    expect(styles).toContain('.qb-paper .qb-page{width:210mm;min-height:0;height:auto;margin:0;overflow:visible;box-shadow:none;border:0;border-radius:0;break-after:page;')
  })

  it('customizes the paper: visibility, language, numbering, section order, text box', async () => {
    window.localStorage.clear()
    renderPage()
    await screen.findByTestId('qb-paper')
    fireEvent.click(screen.getByRole('switch', { name: 'Answer' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Explanation' }))
    expect(screen.queryAllByTestId('qb-paper-correct')).toHaveLength(0)
    expect(screen.queryAllByTestId('qb-paper-explanation')).toHaveLength(0)

    fireEvent.click(screen.getByRole('switch', { name: 'ভাষা / Language' }))
    expect(within(screen.getByTestId('qb-paper')).getAllByText('a)').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('switch', { name: 'নতুন সিরিয়াল' }))
    const sections = () => screen.getAllByTestId('qb-paper-section')
    expect(within(sections()[1]).getByText('1.')).toBeInTheDocument()

    fireEvent.click(within(screen.getByTestId('section-order')).getAllByRole('button', { name: 'নিচে' })[0])
    expect(within(sections()[0]).getByText('Written')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Add Text Box/ }))
    expect(screen.getAllByTestId('qb-text-box')).toHaveLength(1)
    expect(JSON.parse(window.localStorage.getItem('qb-paper-preview'))).toMatchObject({ language: 'en', restartNumbers: true, show: { answer: false, explanation: false } })
  })

  it('edits a question for this paper only and keeps the edit with the paper and set', async () => {
    window.localStorage.clear()
    renderPage()
    await screen.findByTestId('qb-paper')
    fireEvent.click(screen.getAllByRole('button', { name: /নং প্রশ্ন সম্পাদনা/ })[0])
    const editor = screen.getByTestId('qb-question-editor')
    fireEvent.change(within(editor).getByRole('textbox', { name: 'প্রশ্ন' }), { target: { value: 'Changed?' } })
    fireEvent.change(within(editor).getByRole('textbox', { name: 'অপশন ক' }), { target: { value: 'uno' } })
    fireEvent.click(within(editor).getByRole('button', { name: 'এই পত্রে রাখুন' }))
    const first = screen.getAllByTestId('qb-paper-question')[0]
    expect(first).toHaveAttribute('data-edited', 'yes')
    expect(within(first).getByText('Changed?')).toBeInTheDocument()
    expect(within(first).getByText('uno')).toBeInTheDocument()
    expect(within(first).getByTestId('qb-paper-correct')).toBeInTheDocument()   // the right option is still marked
    expect(PAPER.sections[0].items[0].question.question_text).toBe('First?')    // the loaded question itself is untouched
    expect(JSON.parse(window.localStorage.getItem('qb-paper-preview:7:A')).edits[101]).toMatchObject({ question_text: 'Changed?', options: ['uno', 'two'] })

    fireEvent.click(screen.getAllByRole('button', { name: /নং প্রশ্ন সম্পাদনা/ })[0])
    fireEvent.click(screen.getByRole('button', { name: 'মূল প্রশ্নে ফিরুন' }))
    expect(within(screen.getAllByTestId('qb-paper-question')[0]).getByText('First?')).toBeInTheDocument()
  })

  it('drops a text box into the gap after a question', async () => {
    window.localStorage.clear()
    renderPage()
    await screen.findByTestId('qb-paper')
    fireEvent.click(screen.getByRole('button', { name: /Add Text Box/ }))
    expect(screen.getByTestId('qb-text-box')).toHaveAttribute('data-anchor', 'top')
    fireEvent.pointerDown(screen.getByLabelText('টেনে সরান'))
    fireEvent.pointerMove(screen.getByTestId('qb-paper'), { clientY: 5 })
    expect(screen.getByTestId('qb-drop-gap')).toBeInTheDocument()
    fireEvent.pointerUp(screen.getByTestId('qb-paper'), { clientY: 5 })
    const box = screen.getByTestId('qb-text-box')
    expect(box).toHaveAttribute('data-anchor', '103')       // after the last question whose middle is above the pointer
    expect(box.previousElementSibling).toHaveAttribute('data-qid', '103')
    expect(screen.queryByTestId('qb-drop-gap')).toBeNull()
  })

  it('drops a box between header lines and switches its wrap like Word', async () => {
    window.localStorage.clear()
    renderPage()
    const paper = await screen.findByTestId('qb-paper')
    const rect = (top, height = 20) => () => ({ top, height, bottom: top + height, left: 0, right: 600, width: 600, x: 0, y: top, toJSON() {} })
    paper.querySelectorAll('[data-gap]').forEach(el => { el.getBoundingClientRect = rect(1000) })
    paper.querySelector('[data-gap="h-institution"]').getBoundingClientRect = rect(100)
    paper.getBoundingClientRect = rect(0, 1200)
    fireEvent.click(screen.getByRole('button', { name: /Add Text Box/ }))
    fireEvent.pointerDown(screen.getByLabelText('টেনে সরান'), { clientX: 10, clientY: 10 })
    fireEvent.pointerMove(window, { clientX: 500, clientY: 130 })
    expect(screen.getByTestId('qb-drag-ghost').style.display).toBe('block')
    fireEvent.pointerUp(window, { clientX: 500, clientY: 130 })
    const box = screen.getByTestId('qb-text-box')
    expect(box).toHaveAttribute('data-anchor', 'h-institution')      // under the institution name, inside the header
    expect(box.previousElementSibling).toHaveAttribute('data-line', 'institution')

    const wrap = screen.getByRole('combobox', { name: /Wrap Text/ })
    fireEvent.change(wrap, { target: { value: 'square' } })
    expect(screen.getByTestId('qb-text-box')).toHaveAttribute('data-wrap', 'square')
    expect(screen.getByTestId('qb-text-box').style.float).toBe('inline-end')   // dropped on the right half

    fireEvent.change(wrap, { target: { value: 'front' } })
    const free = screen.getByTestId('qb-text-box')
    expect(free).toHaveAttribute('data-anchor', 'free')
    expect(free.style.position).toBe('absolute')
    free.getBoundingClientRect = rect(0, 40)
    fireEvent.pointerDown(screen.getByLabelText('টেনে সরান'), { clientX: 5, clientY: 5 })
    fireEvent.pointerMove(window, { clientX: 305, clientY: 405 })
    expect(free.style.left).toBe('300px')                              // moves with the pointer, anywhere on the page
    fireEvent.pointerUp(window, { clientX: 305, clientY: 405 })
    expect(JSON.parse(window.localStorage.getItem('qb-paper-preview:7:A')).boxes[0]).toMatchObject({ wrap: 'front', x: 300, y: 400 })
  })

  it('aligns the text of the picked box left, center, right or justified', async () => {
    window.localStorage.clear()
    renderPage()
    await screen.findByTestId('qb-paper')
    fireEvent.click(screen.getByRole('button', { name: /Add Text Box/ }))
    const body = within(screen.getByTestId('qb-text-box')).getByLabelText('লেখার বাক্স')
    expect(body.style.textAlign).toBe('left')
    for (const [name, value] of [['মাঝে', 'center'], ['ডানে', 'right'], ['জাস্টিফাই', 'justify'], ['বামে', 'left']]) {
      fireEvent.click(screen.getByRole('button', { name }))
      expect(body.style.textAlign).toBe(value)
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'true')
    }
    fireEvent.click(screen.getByRole('button', { name: 'মাঝে' }))
    expect(JSON.parse(window.localStorage.getItem('qb-paper-preview:7:A')).boxes[0].align).toBe('center')
  })

  it('saves the selected paper pages as a JPG named after the paper and set', async () => {
    window.localStorage.clear()
    renderPage()
    const paper = await screen.findByTestId('qb-paper')
    fireEvent.click(screen.getByRole('button', { name: 'ইমেজ' }))
    expect(downloadPaperJpg).toHaveBeenCalledWith(paper, 'paper-7-A.jpg', 'A4', 'portrait')
  })

  it('downloads a PDF file from the PDF button and opens the print dialog only from the print button', async () => {
    window.localStorage.clear()
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    renderPage()
    const paper = await screen.findByTestId('qb-paper')
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }))
    expect(downloadPaperPdf).toHaveBeenCalledWith(paper, 'paper-7-A.pdf', 'A4', 'portrait')
    expect(print).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'প্রিন্ট' }))
    expect(print).toHaveBeenCalledTimes(1)
    print.mockRestore()
  })
})
