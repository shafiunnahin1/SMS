// docs/THEMING.md "tailwind.config.js - Full Code": every colour, radius, spacing and shadow is a CSS variable set by ThemeProvider
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)', secondary: 'var(--color-secondary)', accent: 'var(--color-accent)',
        'on-primary': 'var(--color-on-primary)',
        surface: 'var(--surface)', 'surface-muted': 'var(--surface-muted)',
        line: 'var(--line)',
        'primary-soft': 'var(--color-primary-soft)', 'secondary-soft': 'var(--color-secondary-soft)',
        'primary-fg': 'var(--color-primary-fg)',
        content: 'var(--text)', 'content-muted': 'var(--text-muted)',
        sidebar: 'var(--sidebar-bg)', 'on-sidebar': 'var(--sidebar-text)',
      },
      borderColor: { DEFAULT: 'var(--line)' },
      borderRadius: { token: 'var(--radius)' },
      spacing: { density: 'var(--space)', row: 'var(--row-h)' },
      boxShadow: { card: 'var(--card-shadow)' },
      fontFamily: { body: 'var(--font-body)' },
    },
  },
}
