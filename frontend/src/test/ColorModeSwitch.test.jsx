import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import i18n from '../i18n'
import { useInstitutionStore } from '../store/institutionStore'
import ColorModeSwitch, { COLOR_MODE_KEY } from '../layouts/parts/ColorModeSwitch'

const theme = (mode) => ({ primary_color: '#2563EB', secondary_color: '#0F172A', accent_color: '#F59E0B', on_primary: '#FFFFFF', theme_mode: mode, tokens: {} })
const html = () => document.documentElement.classList.contains('dark')
const pick = (v) => fireEvent.change(screen.getByTestId('color-mode-switch').querySelector('select'), { target: { value: v } })

// D239 DRK.1: the user's own light / dark choice, kept only in this browser, applied at once; "institution" follows the theme again
describe('own light / dark choice (D239)', () => {
  beforeEach(() => {
    i18n.changeLanguage('en')
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('dark, light and back to the institution setting, without a reload', () => {
    useInstitutionStore.setState({ theme: theme('light') })
    render(<ColorModeSwitch />)
    expect(screen.getByTestId('color-mode-switch').querySelector('select').value).toBe('')
    pick('dark')
    expect([html(), localStorage.getItem(COLOR_MODE_KEY)]).toEqual([true, 'dark'])
    pick('light')
    expect([html(), localStorage.getItem(COLOR_MODE_KEY)]).toEqual([false, 'light'])
    useInstitutionStore.setState({ theme: theme('dark') })
    pick('')
    expect([html(), localStorage.getItem(COLOR_MODE_KEY)]).toEqual([true, null])
  })

  it('shows the saved choice when the page opens', () => {
    localStorage.setItem(COLOR_MODE_KEY, 'dark')
    useInstitutionStore.setState({ theme: theme('light') })
    render(<ColorModeSwitch />)
    expect(screen.getByTestId('color-mode-switch').querySelector('select').value).toBe('dark')
    expect(screen.getByText('Theme: institution')).toBeInTheDocument()
  })
})
