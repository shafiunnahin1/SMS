import { useEffect } from 'react'
import { useInstitutionStore } from '../store/institutionStore'
import { applyTheme } from './applyTheme'

// docs/THEMING.md "theme/ThemeProvider.jsx": applies CSS variables + data-attributes on <html> whenever /bootstrap changes the theme
export default function ThemeProvider({ children }) {
  const theme = useInstitutionStore(s => s.theme)
  useEffect(() => { applyTheme(theme) }, [theme])
  return children
}
