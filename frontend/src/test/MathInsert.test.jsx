import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MathInsert from '../features/qb/MathInsert'

vi.mock('../features/qb/mathlive', () => ({ loadMathlive: () => Promise.resolve({}) }))

describe('MathInsert font support', () => {
  it('applies a selected math font through MathLive and returns focus to the field', async () => {
    render(<MathInsert onInsert={vi.fn()} />)
    fireEvent.click(document.querySelector('[data-action="math"]'))
    const field = await screen.findByTestId('math-field')
    expect(field.style.getPropertyValue('--ui-font-family')).toBe('var(--font-body)')
    const callOrder = []
    field.selection = { ranges: [[0, 3]], direction: 'forward' }
    field.applyStyle = vi.fn((_, options) => callOrder.push(['style', options]))
    field.focus = vi.fn(() => callOrder.push(['focus']))
    fireEvent.blur(field)

    fireEvent.change(screen.getByRole('combobox', { name: 'গণিতের ফন্ট' }), { target: { value: 'doubleStruck' } })

    await waitFor(() => expect(field.applyStyle).toHaveBeenCalledWith(
      { fontFamily: 'none', variant: 'double-struck', variantStyle: 'up' },
      { range: [0, 3], operation: 'set' },
    ))
    expect(field.focus).toHaveBeenCalledOnce()
    expect(callOrder).toEqual([['focus'], ['style', { range: [0, 3], operation: 'set' }]])
    expect(field.selection).toEqual({ ranges: [[0, 3]], direction: 'forward' })
  })
})