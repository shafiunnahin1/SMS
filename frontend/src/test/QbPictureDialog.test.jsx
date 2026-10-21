import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '../i18n'
import PictureDialog from '../features/qb/PictureDialog'
import Ribbon from '../features/qb/Ribbon'

describe('writer picture workflow', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('opens the editor from the ribbon before asking for a file', () => {
    const onImage = vi.fn()
    render(<Ribbon onImage={onImage} readActive={() => ({ value: '', start: 0, end: 0 })} run={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'ছবি' }))
    expect(onImage).toHaveBeenCalledOnce()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('previews a chosen image and submits its layout and transform settings together', async () => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => '/local-preview.png'), revokeObjectURL: vi.fn() })
    const onSave = vi.fn()
    const file = new File(['image'], 'question.png', { type: 'image/png' })
    render(<PictureDialog open initial={{ mode: 'insert' }} onClose={vi.fn()} onSave={onSave} />)

    fireEvent.change(screen.getByLabelText('ছবি বাছাই করুন'), { target: { files: [file] } })
    expect(await screen.findByRole('img', { name: 'ছবির প্রিভিউ' })).toHaveAttribute('src', '/local-preview.png')
    fireEvent.change(screen.getByRole('slider', { name: 'ছবির প্রস্থ' }), { target: { value: '60' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'ছবি বসানোর স্থান' }), { target: { value: 'after' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: 'অনুচ্ছেদ নম্বর' }), { target: { value: '2' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'ছবির ঘূর্ণন' }), { target: { value: '90' } })
    fireEvent.click(screen.getByRole('button', { name: 'যোগ করুন' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ file, settings: expect.objectContaining({ width: 60, position: 'after', paragraph: 2, rotation: 90 }) }))
  })

  it('reopens existing image layout settings from its preview context', () => {
    const onSave = vi.fn()
    render(<PictureDialog open initial={{ mode: 'edit', sourceUrl: '/private/image.png', settings: { width: 55, align: 'right' } }} onClose={vi.fn()} onSave={onSave} />)
    expect(screen.getByRole('img', { name: 'ছবির প্রিভিউ' })).toHaveAttribute('src', '/private/image.png')
    expect(screen.getByRole('slider', { name: 'ছবির প্রস্থ' })).toHaveValue('55')
    expect(screen.getByRole('combobox', { name: 'ছবি বসানোর স্থান' })).toHaveValue('cursor')
  })
})
