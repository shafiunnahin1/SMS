// Decision D52: the fonts come from Google Fonts (this replaces I18N.md section 4.4's self-hosting). One stylesheet per family,
// added once, with display=swap so text shows in the fallback font at once and never stays invisible on a slow line.
// The token keys are THEMING.md's font_family values; Arabic families are loaded by I18nProvider when the locale is 'ar'.
export const GOOGLE_FAMILIES = {
  'hind-siliguri':     'Hind+Siliguri:wght@400;500;600;700',
  'noto-sans-bengali': 'Noto+Sans+Bengali:wght@400;500;600;700',
  'baloo-da-2':        'Baloo+Da+2:wght@400;500;600;700',
  'anek-bangla':       'Anek+Bangla:wght@400;500;600;700',
  'inter':             'Inter:wght@400;500;600;700',
  'noto-sans-arabic':  'Noto+Sans+Arabic:wght@400;500;600;700',
}
// Inter has no Bangla glyphs: tokens.css falls back to Hind Siliguri for it, so that family is loaded with it
const ALSO = { inter: ['hind-siliguri'] }
const loaded = new Set()

function addLink(attrs) {
  const link = document.createElement('link')
  Object.entries(attrs).forEach(([k, v]) => link.setAttribute(k, v))
  document.head.appendChild(link)
}

export function loadFont(key) {
  if (!key || loaded.has(key) || !GOOGLE_FAMILIES[key] || typeof document === 'undefined') return
  if (!loaded.size) {
    addLink({ rel: 'preconnect', href: 'https://fonts.googleapis.com' })
    addLink({ rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' })
  }
  loaded.add(key)
  addLink({ rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?family=${GOOGLE_FAMILIES[key]}&display=swap`, 'data-font': key })
  ;(ALSO[key] ?? []).forEach(loadFont)
}
