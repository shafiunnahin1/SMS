import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MathInsert from '../features/qb/MathInsert'

vi.mock('../features/qb/mathlive', () => ({ loadMathlive: () => Promise.resolve({}) }))

describe('MathInsert font support', () => {
  it('applies a selected math font through MathLive and returns focus to the field', async () => {
    render(<MathInsert onInsert={vi.fn()} />)
    fireEvent.click(document.querySelector('[data-action="math"]'))
    const field = await screen.findByTestId('math-field')
    field.applyStyle = vi.fn()
    field.focus = vi.fn()

    fireEvent.change(screen.getByRole('combobox', { name: 'গণিতের ফন্ট' }), { target: { value: 'doubleStruck' } })
    fireEvent.click(document.querySelector('[data-action="math-font-apply"]'))

    await waitFor(() => expect(field.applyStyle).toHaveBeenCalledWith({ fontFamily: 'none', variant: 'double-struck', variantStyle: 'up' }))
    expect(field.focus).toHaveBeenCalledOnce()
  })
})