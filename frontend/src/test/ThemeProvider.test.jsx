import { render } from '@testing-library/react'
import { act } from 'react'
import ThemeProvider from '../theme/ThemeProvider'
import { useInstitutionStore } from '../store/institutionStore'

// docs/TESTING.md "ThemeProvider.test.jsx": the theme object becomes CSS variables and data-* attributes; the user's own dark-mode
// choice beats the institution default. D52: the chosen font is loaded from Google Fonts once.
const THEME = { primary_color: '#0F766E', secondary_color: '#134E4A', accent_color: '#F59E0B', on_primary: '#FFFFFF', theme_mode: 'light',
  tokens: { font_family: 'anek-bangla', radius: 'lg', density: 'comfortable', card_style: 'shadow', sidebar_style: 'light', table_style: 'plain', login_template: 'centered', dashboard_variant: 'cards' } }
const root = document.documentElement

beforeEach(() => { localStorage.clear(); root.className = ''; document.head.querySelectorAll('link[data-font]').forEach(l => l.remove()) })

it('writes the brand colours as CSS variables and the tokens as data attributes', () => {
  act(() => useInstitutionStore.setState({ theme: THEME }))
  render(<ThemeProvider><p>x</p></ThemeProvider>)
  expect(root.style.getPropertyValue('--color-primary')).toBe('#0F766E')
  expect(root.style.getPropertyValue('--color-on-primary')).toBe('#FFFFFF')
  expect({ ...root.dataset }).toMatchObject({ radius: 'lg', density: 'comfortable', card: 'shadow', sidebar: 'light', table: 'plain', font: 'anek-bangla' })
  expect(root.classList.contains('dark')).toBe(false)
})

it("the user's own dark-mode choice wins over the institution default", () => {
  localStorage.setItem('color-mode', 'dark')
  act(() => useInstitutionStore.setState({ theme: { ...THEME, theme_mode: 'light', tokens: { ...THEME.tokens } } }))
  render(<ThemeProvider><p>x</p></ThemeProvider>)
  expect(root.classList.contains('dark')).toBe(true)
})

it('a new theme (another tenant or an admin change) replaces the old values', () => {
  act(() => useInstitutionStore.setState({ theme: THEME }))
  render(<ThemeProvider><p>x</p></ThemeProvider>)
  act(() => useInstitutionStore.setState({ theme: { ...THEME, primary_color: '#7C3AED', tokens: { ...THEME.tokens, radius: 'xl' } } }))
  expect([root.style.getPropertyValue('--color-primary'), root.dataset.radius]).toEqual(['#7C3AED', 'xl'])
})
