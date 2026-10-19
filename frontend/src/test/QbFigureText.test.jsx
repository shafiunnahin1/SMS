import { render, screen, waitFor } from '@testing-library/react'
import { vi } from 'vitest'

// D118: MathText - the one component every question view uses (writer preview, teacher library, student study) - turns qbank's
// graph and diagram tokens into images from qbank's renderers, keeps the text around them, and shows a placeholder for a bad token.
vi.mock('../features/qb/qbankTools', () => ({
  graphImage: vi.fn(async (t) => (t.includes('GOOD') ? 'data:image/svg+xml;charset=utf-8,%3Csvg%3E' : null)),
  diagramImage: vi.fn(async () => 'data:image/svg+xml;charset=utf-8,%3Csvg%3E'),
}))
vi.mock('../features/qb/mathlive', () => ({ loadMathlive: () => Promise.resolve(), UNSAFE_LATEX: /\\(href|url)/ }))
import MathText from '../features/qb/MathText'

describe('MathText with qbank figures (D118)', () => {
  it('draws graphs and diagrams as images and keeps the text', async () => {
    const { container } = render(<MathText text={'Before [[qmx-graph:GOODgraphToken1]] middle [[qmx-diagram:aDiagramToken22]] after'} />)
    await waitFor(() => expect(container.querySelectorAll('img[data-qb-graph="drawn"]')).toHaveLength(2))
    expect(container.querySelector('img[data-kind="graph"]').getAttribute('src')).toMatch(/^data:image\/svg\+xml/)
    expect(container.querySelector('img[data-kind="diagram"]')).not.toBeNull()
    expect(container.textContent).toContain('Before')
    expect(container.textContent).toContain('after')
    expect(container.textContent).not.toContain('[[qmx-')
  })

  it('shows a placeholder for a token qbank cannot read', async () => {
    const { container } = render(<MathText text={'x [[qmx-graph:BADgraphToken12]]'} />)
    await waitFor(() => expect(container.querySelector('[data-qb-graph="unreadable"]')).not.toBeNull())
    expect(screen.queryByRole('img')).toBeNull()
  })
})
